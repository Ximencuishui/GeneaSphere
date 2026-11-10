/**
 * 册谱世录 → 欧谱。配偶和墓葬留在格子里，不另占一行。
 * 世代沿用世录的辈分，根是第一世。
 */
import {
  buildEuropeanCharts,
  type EuropeanChart,
  type EuropeanLinkInput,
  type EuropeanPersonInput,
} from '@/utils/european-chart';
import type { EuropeanPersonCaption, EuropeanViewModel } from '@/utils/european-chart-source';

export interface ShiluChartChild {
  person_id?: string;
  name: string;
  rank?: number;
  child_type?: string;
}

export interface ShiluChartEntry {
  person_id: string;
  generation: number;
  rank?: number;
  full_name: string;
  gender?: string;
  courtesy_name?: string;
  art_name?: string;
  birth_year?: number;
  death_year?: number;
  is_living?: boolean;
  burial_place?: string;
  native_place?: string;
  achievements?: string;
  anecdotes?: string;
  biography?: string;
  adoption_note?: string;
  father_id?: string;
  child_type?: string;
  spouses?: { name: string; marriage_order?: number }[];
  children?: ShiluChartChild[];
}

export function europeanViewFromShilu(entries: readonly ShiluChartEntry[]): EuropeanViewModel {
  const people: EuropeanPersonInput[] = [];
  const links: EuropeanLinkInput[] = [];
  const captions: Record<string, EuropeanPersonCaption> = {};
  const ids = new Set<string>();

  for (const entry of entries) {
    const id = String(entry.person_id ?? '').trim();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    people.push({
      id,
      name: entry.full_name || id,
      generation: Math.max(1, Math.floor(entry.generation) + 1),
      birthOrder: finite(entry.rank),
      childType: entry.child_type,
      spouses: (entry.spouses || [])
        .map((spouse) => ({
          name: String(spouse.name || '').trim(),
          marriageOrder: finite(spouse.marriage_order),
        }))
        .filter((spouse) => spouse.name),
    });
    const offspring = (entry.children || [])
      .map((child) => text(child.name))
      .filter((name): name is string => Boolean(name))
      .join('、');
    captions[id] = {
      courtesyName: text(entry.courtesy_name),
      artName: text(entry.art_name),
      birthYear: finite(entry.birth_year),
      deathYear: finite(entry.death_year),
      isLiving: entry.is_living,
      burialPlace: text(entry.burial_place),
      nativePlace: text(entry.native_place),
      offspring: offspring || undefined,
      achievements: text(entry.achievements),
      anecdotes: text(entry.anecdotes),
      biography: text(entry.biography),
      citeBook: entry.gender === 'female' ? '闺秀录' : '人物传',
      adoptionNote: text(entry.adoption_note),
    };
  }

  const linked = new Set<string>();
  const hasFather = entries.some((entry) => entry.father_id && ids.has(String(entry.father_id)));
  if (hasFather) {
    for (const entry of entries) {
      const id = String(entry.person_id ?? '').trim();
      const fatherId = String(entry.father_id ?? '').trim();
      if (!id || !fatherId || !ids.has(id) || !ids.has(fatherId) || fatherId === id) continue;
      links.push({
        parentId: fatherId,
        childId: id,
        birthOrder: finite(entry.rank),
        childType: entry.child_type,
      });
      linked.add(id);
    }
  } else {
    const byGenName = new Map<string, ShiluChartEntry[]>();
    for (const entry of entries) {
      const key = `${entry.generation}|${entry.full_name}`;
      const list = byGenName.get(key) || [];
      list.push(entry);
      byGenName.set(key, list);
    }
    for (const entry of entries) {
      const parentId = String(entry.person_id ?? '').trim();
      if (!parentId) continue;
      for (const child of entry.children || []) {
        const pool = byGenName.get(`${entry.generation + 1}|${child.name}`) || [];
        const match = pool.find((item) => {
          const childId = String(item.person_id);
          if (linked.has(childId)) return false;
          if (child.rank == null || item.rank == null) return true;
          return item.rank === child.rank;
        });
        if (!match) continue;
        links.push({
          parentId,
          childId: String(match.person_id),
          birthOrder: finite(child.rank ?? match.rank),
          childType: child.child_type || match.child_type,
        });
        linked.add(String(match.person_id));
      }
    }
  }

  return { people, links, captions };
}

export function europeanChartsFromShilu(entries: readonly ShiluChartEntry[]): {
  charts: EuropeanChart[];
  captions: Record<string, EuropeanPersonCaption>;
} {
  const model = europeanViewFromShilu(entries);
  return {
    charts: buildEuropeanCharts(model.people, model.links),
    captions: model.captions,
  };
}

function finite(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function text(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  return raw || undefined;
}
