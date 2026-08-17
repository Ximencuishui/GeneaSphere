import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient, Gender, Person } from '@prisma/client';
import { TreeService } from '../tree/tree.service';
import { PedigreeService } from '../pedigree/pedigree.service';
import { parseXlsxSafely } from './xlsx-sanitizer';

const prisma = new PrismaClient();

export interface ImportResult {
  successCount: number;
  failureCount: number;
  errors: { row: number; message: string }[];
}

export interface ExcelPersonData {
  full_name: string;
  gender: string;
  birth_date?: string;
  death_date?: string;
  is_living?: string;
  parent_name?: string;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly treeService: TreeService,
    // [双写一致性 2026-08-17] 导入路径与 tree/family-relation 共用统一亲子写入入口
    private readonly pedigreeService: PedigreeService,
  ) {}

  async importFromExcel(
    fileBuffer: Buffer,
    clanId: bigint
  ): Promise<ImportResult> {
    const result: ImportResult = {
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    // 通过 xlsx 输入隔离层解析：魔数校验 + 大小限制 + 行数限制 + 原型链清洗
    // （缓解 xlsx@0.18.5 的 CVE-2023-30533 / CVE-2024-22363）
    const jsonData = parseXlsxSafely<ExcelPersonData>(fileBuffer);

    if (jsonData.length === 0) {
      return result;
    }

    const nameToIdMap = new Map<string, bigint>();
    const recordsToCreate: {
      data: Omit<Prisma.PersonUncheckedCreateInput, 'id'>;
      parentName?: string;
      rowIndex: number;
    }[] = [];

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowIndex = i + 2;

      try {
        this.validateRow(row, rowIndex, result);

        const birthDate = row.birth_date ? new Date(row.birth_date) : undefined;
        const deathDate = row.death_date ? new Date(row.death_date) : undefined;

        recordsToCreate.push({
          data: {
            clan_id: clanId,
            full_name: row.full_name.trim(),
            gender: this.parseGender(row.gender),
            birth_date: birthDate,
            death_date: deathDate,
            is_living: row.is_living ? this.parseBoolean(row.is_living) : true,
          },
          parentName: row.parent_name?.trim(),
          rowIndex,
        });
      } catch (error) {
        result.failureCount++;
        result.errors.push({ row: rowIndex, message: error.message });
        this.logger.error(`Row ${rowIndex}: ${error.message}`);
      }
    }

    if (recordsToCreate.length === 0) {
      return result;
    }

    try {
      await prisma.$transaction(async (tx) => {
        for (const record of recordsToCreate) {
          try {
            const parentId = record.parentName
              ? nameToIdMap.get(record.parentName)
              : undefined;

            const person = await tx.person.create({
              data: record.data,
            });

            nameToIdMap.set(record.data.full_name, person.id);

            if (parentId) {
              // [双写一致性 2026-08-17] 走统一入口：PersonAncestry + FamilyChild/FamilyUnit 同时维护
              await this.pedigreeService.attachChildToParents(tx, {
                clan_id: clanId,
                child_id: person.id,
                parent_ids: [parentId],
              });
            } else {
              // 顶层祖先：仅写 self-record
              await tx.personAncestry.createMany({
                data: [{ ancestor_id: person.id, descendant_id: person.id, depth: 0 }],
                skipDuplicates: true,
              });
            }

            result.successCount++;
          } catch (error) {
            result.failureCount++;
            result.errors.push({
              row: record.rowIndex,
              message: `创建失败: ${error.message}`,
            });
            this.logger.error(
              `Row ${record.rowIndex}: 创建失败 - ${error.message}`
            );
          }
        }
      });
    } catch (error) {
      this.logger.error(`导入事务失败: ${error.message}`);
      throw new Error(`导入失败: ${error.message}`);
    }

    return result;
  }

  private validateRow(
    row: ExcelPersonData,
    rowIndex: number,
    result: ImportResult
  ): void {
    if (!row.full_name || row.full_name.trim() === '') {
      throw new Error('姓名不能为空');
    }

    if (!row.gender || row.gender.trim() === '') {
      throw new Error('性别不能为空');
    }

    const validGenders = ['male', 'female', '男', '女'];
    if (!validGenders.includes(row.gender.trim().toLowerCase())) {
      throw new Error('性别必须为 male/female 或 男/女');
    }

    if (row.birth_date) {
      const birthDate = new Date(row.birth_date);
      if (isNaN(birthDate.getTime())) {
        throw new Error('出生日期格式无效');
      }
    }

    if (row.death_date) {
      const deathDate = new Date(row.death_date);
      if (isNaN(deathDate.getTime())) {
        throw new Error('死亡日期格式无效');
      }
    }
  }

  private parseGender(gender: string): Gender {
    const normalized = gender.trim().toLowerCase();
    if (normalized === 'male' || normalized === '男') {
      return Gender.male;
    }
    if (normalized === 'female' || normalized === '女') {
      return Gender.female;
    }
    throw new Error('无效的性别值');
  }

  private parseBoolean(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '是' || normalized === '1';
  }

  /**
   * 导入族谱 JSON 备份（与 admin 数据导出格式一致）
   * - 结构：{ persons: [{id, full_name, gender, birth_date, death_date, is_living}],
   *          families: [{id, husband_id, wife_id}],
   *          family_children: [{family_id, child_id, birth_order}],
   *          ancestry: [{ancestor_id, descendant_id, depth}] }
   * - 全部数据强制归属当前 clan；导入文件里的旧 id 重新映射为库中新自增 id；
   * - 事务内完成；闭包表数据缺失时由 PedigreeService 兜底补全（self-record + 父母祖先链）。
   */
  async importFromJson(data: any, clanId: bigint): Promise<ImportResult> {
    const result: ImportResult = { successCount: 0, failureCount: 0, errors: [] };
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('JSON 数据格式无效');
    }
    const persons = Array.isArray(data.persons) ? data.persons : [];
    const families = Array.isArray(data.families) ? data.families : [];
    const familyChildren = Array.isArray(data.family_children) ? data.family_children : [];
    const ancestry = Array.isArray(data.ancestry) ? data.ancestry : [];

    if (persons.length === 0) {
      result.errors.push({ row: 0, message: 'JSON 未包含 persons 数据' });
      return result;
    }

    await prisma.$transaction(async (tx) => {
      // 1) persons（旧 id → 新 id）
      const idMap = new Map<string, bigint>();
      for (let i = 0; i < persons.length; i++) {
        const p = persons[i];
        try {
          const created = await tx.person.create({
            data: {
              clan_id: clanId,
              full_name: String(p.full_name ?? '').trim(),
              gender: this.parseGender(String(p.gender ?? '')),
              birth_date: p.birth_date ? new Date(p.birth_date) : undefined,
              death_date: p.death_date ? new Date(p.death_date) : undefined,
              is_living: p.is_living === false ? false : true,
            },
          });
          if (p.id != null) idMap.set(String(p.id), created.id);
          result.successCount++;
        } catch (e: any) {
          result.failureCount++;
          result.errors.push({
            row: i + 1,
            message: `人物「${p.full_name ?? ''}」创建失败: ${e.message}`,
          });
        }
      }

      // 2) families（husband/wife 映射；缺失的成员允许单亲）
      const familyIdMap = new Map<string, bigint>();
      for (let i = 0; i < families.length; i++) {
        const f = families[i];
        try {
          const husband = f.husband_id != null ? idMap.get(String(f.husband_id)) : undefined;
          const wife = f.wife_id != null ? idMap.get(String(f.wife_id)) : undefined;
          const created = await tx.familyUnit.create({
            data: {
              clan_id: clanId,
              husband_id: husband ?? null,
              wife_id: wife ?? null,
            },
          });
          if (f.id != null) familyIdMap.set(String(f.id), created.id);
        } catch (e: any) {
          result.failureCount++;
          result.errors.push({ row: i + 1, message: `家庭创建失败: ${e.message}` });
        }
      }

      // 3) family_children（同时兜底闭包表）
      for (let i = 0; i < familyChildren.length; i++) {
        const fc = familyChildren[i];
        try {
          const familyId = fc.family_id != null ? familyIdMap.get(String(fc.family_id)) : undefined;
          const childId = fc.child_id != null ? idMap.get(String(fc.child_id)) : undefined;
          if (!familyId || !childId) continue;
          await tx.familyChild.create({
            data: {
              family_id: familyId,
              child_id: childId,
              birth_order: Number(fc.birth_order ?? 0),
            },
          });
          const fam = await tx.familyUnit.findUnique({
            where: { id: familyId },
            select: { husband_id: true, wife_id: true },
          });
          const parentIds = [fam?.husband_id, fam?.wife_id].filter(
            (x): x is bigint => x != null,
          );
          if (parentIds.length > 0) {
            await this.pedigreeService.syncAncestryFromParents(tx, childId, parentIds);
          }
        } catch (e: any) {
          result.failureCount++;
          result.errors.push({ row: i + 1, message: `子女关系创建失败: ${e.message}` });
        }
      }

      // 4) ancestry 显式数据（id 重映射）+ 自补 self-record
      const ancestryRows: Prisma.PersonAncestryCreateManyInput[] = [];
      const seen = new Set<string>();
      for (const a of ancestry) {
        const anc = a.ancestor_id != null ? idMap.get(String(a.ancestor_id)) : undefined;
        const desc = a.descendant_id != null ? idMap.get(String(a.descendant_id)) : undefined;
        if (!anc || !desc) continue;
        const key = `${anc}:${desc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ancestryRows.push({
          ancestor_id: anc,
          descendant_id: desc,
          depth: Number(a.depth ?? 0),
        });
      }
      for (const [, newId] of idMap) {
        const key = `${newId}:${newId}`;
        if (!seen.has(key)) {
          seen.add(key);
          ancestryRows.push({ ancestor_id: newId, descendant_id: newId, depth: 0 });
        }
      }
      for (let i = 0; i < ancestryRows.length; i += 1000) {
        await tx.personAncestry.createMany({
          data: ancestryRows.slice(i, i + 1000),
          skipDuplicates: true,
        });
      }
    });

    return result;
  }
}
