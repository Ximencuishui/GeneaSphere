import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient, Gender, Person } from '@prisma/client';
import * as XLSX from 'xlsx';
import { TreeService } from '../tree/tree.service';

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

  constructor(private readonly treeService: TreeService) {}

  async importFromExcel(
    fileBuffer: Buffer,
    clanId: bigint
  ): Promise<ImportResult> {
    const result: ImportResult = {
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json<ExcelPersonData>(worksheet);

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

            const ancestryRecords: Prisma.PersonAncestryCreateManyInput[] = [
              {
                ancestor_id: person.id,
                descendant_id: person.id,
                depth: 0,
              },
            ];

            if (parentId) {
              const parentAncestries = await tx.personAncestry.findMany({
                where: { descendant_id: parentId },
                select: { ancestor_id: true, depth: true },
              });

              for (const pa of parentAncestries) {
                ancestryRecords.push({
                  ancestor_id: pa.ancestor_id,
                  descendant_id: person.id,
                  depth: pa.depth + 1,
                });
              }
            }

            await tx.personAncestry.createMany({
              data: ancestryRecords,
            });

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
}
