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
  private readonly templatePath = path.join(__dirname, 'templates', 'genealogy.hbs');

  constructor(
    private readonly cosService: CosService,
    private readonly imageProcessor: ImageProcessorService,
  ) {}

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

    const rootPersons = await this.findRootPersons(clanId);

    const treeNodes: TreeNode[] = [];
    for (const root of rootPersons) {
      const tree = await this.buildTree(root.id);
      treeNodes.push(tree);
    }

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

    const templateContent = fs.readFileSync(this.templatePath, 'utf-8');
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

  private async findRootPersons(clanId: bigint): Promise<Person[]> {
    const rootAncestries = await prisma.personAncestry.findMany({
      where: {
        descendant: { clan_id: clanId },
        depth: 0,
      },
      include: { descendant: true },
    });

    const rootIds = new Set<bigint>();
    for (const ancestry of rootAncestries) {
      const hasParent = await prisma.personAncestry.findFirst({
        where: {
          descendant_id: ancestry.descendant_id,
          depth: 1,
        },
      });
      if (!hasParent) {
        rootIds.add(ancestry.descendant_id);
      }
    }

    return prisma.person.findMany({
      where: { id: { in: Array.from(rootIds) } },
    });
  }

  private async buildTree(rootPersonId: bigint): Promise<TreeNode> {
    const descendants = await prisma.personAncestry.findMany({
      where: { ancestor_id: rootPersonId },
      include: { descendant: true },
      orderBy: { depth: 'asc' },
    });

    if (descendants.length === 0) {
      const person = await prisma.person.findUnique({
        where: { id: rootPersonId },
      });
      if (!person) {
        throw new Error(`Person with id ${rootPersonId} not found`);
      }
      return this.toTreeNode(person);
    }

    const nodeMap = new Map<string, TreeNode>();
    const childMap = new Map<string, string[]>();

    for (const record of descendants) {
      const person = record.descendant;
      const node = this.toTreeNode(person);
      nodeMap.set(person.id.toString(), node);

      if (record.depth > 0) {
        const directParent = await this.getDirectParent(record.descendant_id);
        if (directParent) {
          const parentIdStr = directParent.toString();
          if (!childMap.has(parentIdStr)) {
            childMap.set(parentIdStr, []);
          }
          childMap.get(parentIdStr)!.push(record.descendant_id.toString());
        }
      }
    }

    for (const [parentId, childIds] of childMap) {
      const parentNode = nodeMap.get(parentId);
      if (parentNode) {
        const uniqueChildIds = [...new Set(childIds)];
        parentNode.children = uniqueChildIds
          .map((id) => nodeMap.get(id))
          .filter((node): node is TreeNode => node !== undefined);
      }
    }

    const rootNode = nodeMap.get(rootPersonId.toString());
    if (!rootNode) {
      throw new Error(`Root person with id ${rootPersonId} not found`);
    }

    return rootNode;
  }

  private async getDirectParent(personId: bigint): Promise<bigint | null> {
    const parentAncestry = await prisma.personAncestry.findFirst({
      where: {
        descendant_id: personId,
        depth: 1,
      },
      select: { ancestor_id: true },
    });
    return parentAncestry?.ancestor_id ?? null;
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