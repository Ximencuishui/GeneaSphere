import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Person } from '@prisma/client';
import * as puppeteer from 'puppeteer-core';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { CosService } from '../cos/cos.service';
import { ImageProcessorService } from '../cos/image-processor.service';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

interface TreeNode {
  id: string;
  name: string;
  gender: string;
  birth_date?: Date;
  death_date?: Date;
  is_living: boolean;
  children?: TreeNode[];
}

@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);

  constructor(
    private readonly cosService: CosService,
    private readonly imageProcessor: ImageProcessorService,
  ) {}

  /**
   * 定位族谱 PDF 模板（genealogy.hbs）
   * 多候选兜底：dist（nest-cli assets 若生效）→ cwd/src（pnpm --filter server）→ 仓库根/src（dev）。
   */
  private resolveTemplatePath(): string {
    const cwd = process.cwd();
    const candidates = [
      path.join(__dirname, 'templates', 'genealogy.hbs'),
      path.join(cwd, 'src', 'print', 'templates', 'genealogy.hbs'),
      path.join(cwd, 'apps', 'server', 'src', 'print', 'templates', 'genealogy.hbs'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error(`族谱 PDF 模板不存在（尝试: ${candidates.join(' / ')}）`);
  }

  async generateGenealogyPdf(clanId: bigint): Promise<Buffer> {
    const [clan, persons] = await Promise.all([
      prisma.clan.findUnique({
        where: { id: clanId },
      }),
      prisma.person.findMany({
        where: { clan_id: clanId },
        orderBy: { id: 'asc' },
      }),
    ]);

    if (!clan) {
      throw new Error(`Clan with id ${clanId} not found`);
    }

    // [性能修复 2026-08-17] 原实现"每个根节点各跑一轮 buildTree"（N 根 × 2 次查询），
    // 517 根的场景经隧道延迟可到分钟级；改为一次全量建森林：
    // 1 次全族人 + 1 次全部 depth=1 血缘边，内存组装所有树，共 3 次查询。
    const edges = await prisma.personAncestry.findMany({
      where: { descendant: { clan_id: clanId }, depth: 1 },
      select: { ancestor_id: true, descendant_id: true },
    });
    const hasParent = new Set(edges.map((e) => e.descendant_id.toString()));

    const nodeMap = new Map<string, TreeNode>();
    for (const p of persons) nodeMap.set(p.id.toString(), this.toTreeNode(p));

    const childMap = new Map<string, string[]>();
    for (const e of edges) {
      const parentIdStr = e.ancestor_id.toString();
      if (!childMap.has(parentIdStr)) childMap.set(parentIdStr, []);
      childMap.get(parentIdStr)!.push(e.descendant_id.toString());
    }
    for (const [parentId, childIds] of childMap) {
      const parentNode = nodeMap.get(parentId);
      if (parentNode) {
        parentNode.children = [...new Set(childIds)]
          .map((cid) => nodeMap.get(cid))
          .filter((node): node is TreeNode => node !== undefined);
      }
    }

    const treeNodes: TreeNode[] = persons
      .filter((p) => !hasParent.has(p.id.toString()))
      .map((p) => nodeMap.get(p.id.toString()))
      .filter((node): node is TreeNode => node !== undefined);

    const treeHtml = this.renderTreeHtml(treeNodes);
    const generateDate = new Date().toLocaleDateString('zh-CN');

    const personsWithIndex = persons.map((p, index) => ({
      ...p,
      rowIndex: index + 1,
      birth_date: p.birth_date ? this.formatDate(p.birth_date) : '-',
      death_date: p.death_date ? this.formatDate(p.death_date) : '-',
      gender_text: p.gender === 'male' ? '男' : '女',
      gender_class: p.gender === 'male' ? 'gender-male' : 'gender-female',
      status_text: p.is_living ? '在世' : '已故',
      status_class: p.is_living ? 'status-living' : 'status-deceased',
    }));

    const pageSize = 40;
    const totalPages = Math.ceil(persons.length / pageSize);

    const pages = [];
    for (let i = 0; i < totalPages; i++) {
      const start = i * pageSize;
      const end = Math.min(start + pageSize, persons.length);
      pages.push({
        pageNumber: i + 1,
        totalPages,
        persons: personsWithIndex.slice(start, end),
        showTree: i === 0,
        treeHtml: i === 0 ? treeHtml : '',
      });
    }

    const templateContent = fs.readFileSync(this.resolveTemplatePath(), 'utf-8');
    const template = handlebars.compile(templateContent);
    const html = template({
      clanName: clan.name,
      totalPersons: persons.length,
      generateDate,
      pages,
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'load',
    });

    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm',
      },
    });

    await browser.close();

    return Buffer.from(pdfBuffer);
  }

  private toTreeNode(person: Person): TreeNode {
    return {
      id: person.id.toString(),
      name: person.full_name,
      gender: person.gender,
      birth_date: person.birth_date,
      death_date: person.death_date,
      is_living: person.is_living,
      children: [],
    };
  }

  private renderTreeHtml(nodes: TreeNode[]): string {
    if (nodes.length === 0) return '';

    const renderNode = (node: TreeNode): string => {
      const childrenHtml = node.children && node.children.length > 0
        ? `<div class="tree-children">${node.children.map(renderNode).join('')}</div>`
        : '';

      return `
        <div class="tree-node">
          <div class="node-box">
            <div class="name">${node.name}</div>
            <div class="info">
              ${node.gender === 'male' ? '男' : '女'}
              ${node.birth_date ? ' · ' + this.formatDate(node.birth_date) : ''}
              ${!node.is_living && node.death_date ? ' · ' + this.formatDate(node.death_date) : ''}
            </div>
          </div>
          ${node.children && node.children.length > 0 ? '<div class="connector"></div>' : ''}
          ${childrenHtml}
        </div>
      `;
    };

    return `<div class="tree-children">${nodes.map(renderNode).join('')}</div>`;
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 导出"完整超长世系挂画"PDF（树谱 PRD §2.3 导出完整PDF）
   * - 算法：父系森林 DFS 前序分配列号（每棵子树占用连续列），辈分（闭包表深度）作行号；
   *   每节点一列一格，父子垂直连线，配偶以"配X氏"文本标注（v1 简化，不画配偶节点）；
   * - 输出：单页 PDF，页面尺寸 = SVG 实际尺寸（印刷挂画可按比例缩放打印）。
   */
  async exportHangingPdf(clanId: bigint): Promise<Buffer> {
    const [clan, persons, edges, familyUnits] = await Promise.all([
      prisma.clan.findUnique({ where: { id: clanId } }),
      prisma.person.findMany({ where: { clan_id: clanId }, orderBy: { id: 'asc' } }),
      prisma.personAncestry.findMany({
        where: { descendant: { clan_id: clanId }, depth: 1 },
        select: { ancestor_id: true, descendant_id: true },
      }),
      prisma.familyUnit.findMany({
        where: { clan_id: clanId },
        select: { husband_id: true, wife_id: true },
      }),
    ]);
    if (!clan) throw new Error(`Clan with id ${clanId} not found`);
    if (persons.length === 0) throw new Error('族内暂无人物');

    const nameById = new Map(persons.map((p) => [p.id.toString(), p]));
    const childMap = new Map<string, string[]>();
    const hasParent = new Set<string>();
    for (const e of edges) {
      const p = e.ancestor_id.toString();
      const c = e.descendant_id.toString();
      if (!childMap.has(p)) childMap.set(p, []);
      childMap.get(p)!.push(c);
      hasParent.add(c);
    }
    const roots = persons.filter((p) => !hasParent.has(p.id.toString())).map((p) => p.id.toString());

    // 配偶文本
    const spouseText = new Map<string, string[]>();
    for (const fu of familyUnits) {
      if (fu.husband_id && fu.wife_id) {
        const h = fu.husband_id.toString();
        const w = fu.wife_id.toString();
        const wName = nameById.get(w)?.full_name;
        const hName = nameById.get(h)?.full_name;
        if (wName) {
          if (!spouseText.has(h)) spouseText.set(h, []);
          spouseText.get(h)!.push(wName);
        }
        if (hName) {
          if (!spouseText.has(w)) spouseText.set(w, []);
          spouseText.get(w)!.push(hName);
        }
      }
    }

    // 辈分行号（BFS）+ 列号（DFS 前序）
    const genMap = new Map<string, number>();
    const colMap = new Map<string, number>();
    const queue = roots.map((r) => ({ id: r, gen: 0 }));
    const queued = new Set(roots);
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      genMap.set(cur.id, cur.gen);
      for (const c of childMap.get(cur.id) || []) {
        if (!queued.has(c)) {
          queued.add(c);
          queue.push({ id: c, gen: cur.gen + 1 });
        }
      }
    }
    for (const p of persons) {
      const id = p.id.toString();
      if (!genMap.has(id)) genMap.set(id, 0);
    }

    let col = 0;
    const dfs = (id: string) => {
      colMap.set(id, col);
      col++;
      const kids = (childMap.get(id) || []).slice().sort((a, b) => {
        const pa = nameById.get(a)?.birth_date ? new Date(nameById.get(a)!.birth_date!).getTime() : 0;
        const pb = nameById.get(b)?.birth_date ? new Date(nameById.get(b)!.birth_date!).getTime() : 0;
        return pa - pb;
      });
      for (const k of kids) dfs(k);
    };
    for (const r of roots) dfs(r);
    for (const p of persons) {
      const id = p.id.toString();
      if (!colMap.has(id)) {
        colMap.set(id, col);
        col++;
      }
    }

    // SVG 布局
    const W = 150, H = 76, GX = 26, GY = 116, PAD = 44;
    const maxCol = Math.max(1, col);
    const maxGen = Math.max(0, ...[...genMap.values()]) + 1;
    const svgW = maxCol * (W + GX) + PAD;
    const svgH = maxGen * (H + GY) + PAD;
    const cx = (id: string) => colMap.get(id)! * (W + GX) + PAD + W / 2;
    const cy = (id: string) => genMap.get(id)! * (H + GY) + PAD + H / 2;
    const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="background:#FBF7EF;">`,
      `<style>.hn{font-family:KaiTi,SimSun,serif;font-size:15px;fill:#3E3A35;} .hy{font-family:SimSun,serif;font-size:10px;fill:#8D6E63;} .hs{font-family:SimSun,serif;font-size:9px;fill:#A1887F;}</style>`,
      `<text x="${svgW / 2}" y="26" text-anchor="middle" font-family="KaiTi,SimSun,serif" font-size="24" fill="#5D4037">${esc(clan.name)} · 世系挂画</text>`,
    );
    for (const e of edges) {
      const p = e.ancestor_id.toString();
      const c = e.descendant_id.toString();
      const xp = cx(p), yp = cy(p) + H / 2;
      const xc = cx(c), yc = cy(c) - H / 2;
      const midY = (yp + yc) / 2;
      parts.push(
        `<path d="M ${xp} ${yp} L ${xp} ${midY} L ${xc} ${midY} L ${xc} ${yc}" fill="none" stroke="#B39B7F" stroke-width="1.6"/>`,
      );
    }
    for (const p of persons) {
      const id = p.id.toString();
      const x = colMap.get(id)! * (W + GX) + PAD;
      const y = genMap.get(id)! * (H + GY) + PAD;
      const years = p.birth_date
        ? `${new Date(p.birth_date).getFullYear()}${p.death_date ? ` - ${new Date(p.death_date).getFullYear()}` : p.is_living ? ' - 今' : ''}`
        : p.death_date ? `${new Date(p.death_date).getFullYear()} 卒` : '';
      const spouses = (spouseText.get(id) || []).map((s) => `配${s}`).join('、');
      const fill = p.gender === 'male' ? '#EAF3FB' : '#FBE9EF';
      const stroke = p.gender === 'male' ? '#7FA7C9' : '#D98BA4';
      parts.push(
        `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`,
        `<text x="${x + W / 2}" y="${y + 30}" text-anchor="middle" class="hn">${esc(p.full_name)}</text>`,
        years ? `<text x="${x + W / 2}" y="${y + 48}" text-anchor="middle" class="hy">${esc(years)}</text>` : '',
        spouses ? `<text x="${x + W / 2}" y="${y + 64}" text-anchor="middle" class="hs">${esc(spouses.length > 16 ? spouses.slice(0, 15) + '…' : spouses)}</text>` : '',
      );
    }
    parts.push(`</svg>`);
    const svgBody = parts.filter(Boolean).join('\n');

    // PDF 规格上限（约 200 英寸 @96dpi）；超宽/超高时按比例缩放 + 标注说明
    const MAX_PX = 19200;
    let outW = svgW;
    let outH = svgH;
    let scale = 1;
    if (svgW > MAX_PX || svgH > MAX_PX) {
      scale = Math.min(MAX_PX / svgW, MAX_PX / svgH);
      outW = Math.round(svgW * scale);
      outH = Math.round(svgH * scale);
    }
    const scaleNote =
      scale < 1
        ? `<text x="${PAD}" y="${svgH - 14}" font-family="SimSun,serif" font-size="${Math.round(16 / scale)}" fill="#A1887F">已按 ${(scale * 100).toFixed(0)}% 缩放（完整尺寸 ${svgW}×${svgH}px，超出 PDF 单页规格上限）</text>`
        : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${svgW} ${svgH}" style="background:#FBF7EF;">${svgBody}${scaleNote}</svg>`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>body{margin:0;}</style></head><body>${svg}</body></html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: Math.min(outW, 8000), height: Math.min(outH, 8000) });
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        width: `${outW}px`,
        height: `${outH}px`,
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  /**
   * 生成 PDF 并上传至 COS 热 Bucket
   * @returns CDN URL
   */
  async generateAndUploadPdf(clanId: bigint, orderId?: string): Promise<string> {
    const pdfBuffer = await this.generateGenealogyPdf(clanId);

    const uuid = uuidv4().replace(/-/g, '');
    const subPath = orderId || clanId.toString();
    const result = await this.imageProcessor.uploadFile(
      pdfBuffer,
      'print/pdf',
      subPath,
      'pdf',
      'hot',
    );

    this.logger.log(`印刷 PDF 已上传至 COS: ${result.url}`);
    return result.url;
  }
}