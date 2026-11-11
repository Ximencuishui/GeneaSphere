/**
 * 把当前树谱节点走成欧谱的人物和父子边。
 * 配偶留在人物上，不另起一行。世代从当前这棵树的根算起，根是第一世。
 */
import type { GenealogyNode } from '@/types';
import type { EuropeanLinkInput, EuropeanPersonInput } from '@/utils/european-chart';

export interface EuropeanPersonCaption {
  courtesyName?: string;
  artName?: string;
  generationWord?: string;
  birthYear?: number;
  deathYear?: number;
  isLiving?: boolean;
  /** 墓葬。册谱格子里写成「葬某地」，树谱不传则不显示。 */
  burialPlace?: string;
  /** 籍贯，行传里写成「籍某地」。 */
  nativePlace?: string;
  /** 子女名，行传里写成「子某、某」。 */
  offspring?: string;
  achievements?: string;
  anecdotes?: string;
  /** 传记正文。册谱欧式格内只留简述，全文在人物传。 */
  biography?: string;
  adoptionNote?: string;
  /** 册谱欧式：该人完整行传所在世系图号。无行传则不设。 */
  biographyChartNo?: number;
  /** 行传所在卷。女子指向闺秀录，其余指向人物传。 */
  citeBook?: '人物传' | '闺秀录';
  /** 真实头像。空则世系图不画头像。 */
  avatarUrl?: string;
}

export interface EuropeanViewModel {
  people: EuropeanPersonInput[];
  links: EuropeanLinkInput[];
  captions: Record<string, EuropeanPersonCaption>;
}

const EMPTY_MODEL: EuropeanViewModel = { people: [], links: [], captions: {} };

export function europeanViewModel(root: GenealogyNode | null | undefined): EuropeanViewModel {
  if (!root) return EMPTY_MODEL;
  const people: EuropeanPersonInput[] = [];
  const links: EuropeanLinkInput[] = [];
  const captions: Record<string, EuropeanPersonCaption> = {};
  const seen = new Set<string>();
  const expanded = new Set<string>();

  const visit = (node: GenealogyNode, depth: number) => {
    const id = String(node.id ?? '').trim();
    if (!id) return;
    if (!seen.has(id)) {
      seen.add(id);
      people.push({
        id,
        name: personName(node),
        generation: depth + 1,
        birthOrder: finiteNumber(node.birth_order),
        childType: node.child_type,
        spouses: (node.spouses || [])
          .map((spouse) => ({
            name: String(spouse.full_name || spouse.name || '').trim(),
            marriageOrder: finiteNumber(spouse.marriage_order),
          }))
          .filter((spouse) => spouse.name),
      });
      const courtesyName = textOf((node as { courtesy_name?: unknown }).courtesy_name);
      const artName = textOf((node as { art_name?: unknown }).art_name);
      const generationWord = textOf(node.generation_word);
      captions[id] = {
        courtesyName,
        artName,
        generationWord,
        birthYear: yearOf(node.birth_year ?? node.birth_date),
        deathYear: yearOf(node.death_year ?? node.death_date),
        isLiving: node.is_living,
      };
    }
    if (expanded.has(id)) return;
    expanded.add(id);

    const linkByChild = new Map<string, { birth_order?: number; child_type?: string }>();
    for (const link of node.child_links || []) {
      linkByChild.set(String(link.child_id), link);
    }
    for (const child of node.children || []) {
      const childId = String(child.id ?? '').trim();
      if (!childId || childId === id) continue;
      const link = linkByChild.get(childId);
      links.push({
        parentId: id,
        childId,
        birthOrder: finiteNumber(link?.birth_order ?? child.birth_order),
        childType: link?.child_type || child.child_type,
      });
      visit(child, depth + 1);
    }
  };

  visit(root, 0);
  return { people, links, captions };
}

function personName(node: GenealogyNode): string {
  const raw = node.full_name || (node as { name?: string }).name || node.label || '';
  return String(raw).trim();
}

function textOf(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function yearOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^(\d{3,4})/);
  return match ? Number(match[1]) : undefined;
}
