export interface PdfPersonRecord {
  rowNumber: number;
  localId: string;
  fullName: string;
  gender?: 'M' | 'F' | 'UNKNOWN';
  generation?: number;
  birthDate?: string;
  deathDate?: string;
  isLiving?: boolean;
  parentName?: string;
  parentLocalId?: string;
  motherName?: string;
  motherLocalId?: string;
  spouseName?: string;
  spouseLocalId?: string;
  biography?: string;
  burialPlace?: string;
  notes?: string;
  confidenceScore: number;
  originalText?: string;
  pageNumber?: number;
  parseWarning?: string;
}

const DIGIT: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

const KEYWORDS = ['嫡配', '继配', '側室', '侧室', '长子', '次子', '三子', '四子', '五子', '之子', '长女', '次女', '之女', '配', '娶', '妻', '子', '女'];

/**
 * 从族谱正文提取人物，并在本批内用 localId 连上父母、配偶。
 * 「第X世」「行X」只作前缀，不进入姓名。姓名中的「氏」一律视为女性。
 */
export function extractPersonsFromText(text: string, isOcrText = false): PdfPersonRecord[] {
  if (!text) return [];
  const records: PdfPersonRecord[] = [];
  const opened = new Set<string>();
  let current: PdfPersonRecord | null = null;
  let currentSpouse: PdfPersonRecord | null = null;
  let row = 0;
  let page = 1;
  const base = isOcrText ? 55 : 72;

  const add = (partial: Omit<PdfPersonRecord, 'rowNumber' | 'localId' | 'confidenceScore'> & { confidenceScore?: number }): PdfPersonRecord => {
    row += 1;
    const record: PdfPersonRecord = {
      ...partial,
      rowNumber: row,
      localId: `p${row}`,
      confidenceScore: Math.min(partial.confidenceScore ?? base, 100),
    };
    records.push(record);
    return record;
  };

  for (const rawLine of text.split(/\n+/)) {
    const pageMark = rawLine.trim().match(/^@@PAGE:(\d+)@@$/);
    if (pageMark) {
      page = Number(pageMark[1]) || page;
      continue;
    }
    const parsed = parseGenealogyLine(rawLine);
    if (!parsed) {
      noteUnparsed(rawLine, page);
      continue;
    }

    if (parsed.head) {
      const reusable = records.find(
        (item) => item.fullName === parsed.head && item.parentLocalId && !opened.has(item.localId),
      );
      if (reusable) {
        opened.add(reusable.localId);
        if (parsed.generation) reusable.generation = parsed.generation;
        if (parsed.birthDate) reusable.birthDate = parsed.birthDate;
        if (parsed.deathDate) reusable.deathDate = parsed.deathDate;
        if (parsed.courtesy) reusable.notes = [reusable.notes, `字${parsed.courtesy}`].filter(Boolean).join('；');
        reusable.isLiving = !reusable.deathDate;
        reusable.originalText = rawLine.trim().slice(0, 200);
        reusable.confidenceScore = Math.min(100, Math.max(reusable.confidenceScore, base + 10));
        current = reusable;
        currentSpouse = records.find((item) => item.localId === reusable.spouseLocalId) ?? null;
        if (!reusable.pageNumber) reusable.pageNumber = page;
      } else {
        const gender = genderOf(parsed.head, 'head');
        const record = add({
          fullName: parsed.head,
          gender,
          generation: parsed.generation,
          birthDate: parsed.birthDate,
          deathDate: parsed.deathDate,
          isLiving: !parsed.deathDate,
          notes: parsed.courtesy ? `字${parsed.courtesy}` : undefined,
          originalText: rawLine.trim().slice(0, 200),
          pageNumber: page,
          confidenceScore: base + (parsed.generation ? 10 : 0),
        });
        flagUncertain(record, rawLine);
        opened.add(record.localId);
        if (gender === 'F' && current && current.gender !== 'F') {
          linkSpouse(current, record);
          currentSpouse = record;
        } else {
          current = record;
          currentSpouse = null;
        }
      }
    }

    for (const relation of parsed.relations) {
      if (!relation.name) continue;
      if (relation.kind === 'spouse') {
        const spouse = add({
          fullName: relation.name,
          gender: 'F',
          generation: current?.generation,
          originalText: rawLine.trim().slice(0, 200),
          pageNumber: page,
          confidenceScore: base + 12,
          isLiving: true,
        });
        flagUncertain(spouse, rawLine);
        if (relation.name.includes('氏')) spouse.gender = 'F';
        if (current) {
          linkSpouse(current, spouse);
          currentSpouse = spouse;
        }
        continue;
      }

      const childGender = relation.female || relation.name.includes('氏') ? 'F' : 'M';
      const child = add({
        fullName: relation.name,
        gender: childGender,
        generation: current?.generation ? current.generation + 1 : parsed.generation,
        parentName: current?.fullName,
        parentLocalId: current?.localId,
        motherName: currentSpouse?.fullName,
        motherLocalId: currentSpouse?.localId,
        originalText: rawLine.trim().slice(0, 200),
        pageNumber: page,
        isLiving: true,
        confidenceScore: base + (current ? 15 : 0),
      });
      flagUncertain(child, rawLine);
      if (!current) current = child;
    }
  }

  return records;

  function noteUnparsed(rawLine: string, pageNumber: number) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('--')) return;
    const generationOnly = /^第[0-9一二三四五六七八九十百]+世$/.test(trimmed);
    const broken = /[?？�]|无法识别|识别失败|噪声/.test(trimmed);
    if (!generationOnly && !broken) return;
    const record = add({
      fullName: trimmed.slice(0, 12),
      gender: 'UNKNOWN',
      originalText: trimmed.slice(0, 200),
      pageNumber,
      isLiving: true,
      confidenceScore: 18,
      parseWarning: generationOnly ? '只有世次，没有姓名' : '无法识别为族谱条目',
    });
    record.confidenceScore = 18;
  }
}

function flagUncertain(record: PdfPersonRecord, line: string) {
  const reasons: string[] = [];
  if (/[?？�]/.test(record.fullName) || /[?？�]/.test(line)) reasons.push('原文有无法识别的字');
  if (!/[世配子子女氏娶妻行]/.test(line) && !record.parentLocalId) reasons.push('不像族谱条目');
  if (!reasons.length) return;
  record.parseWarning = reasons.join('；');
  record.confidenceScore = Math.min(record.confidenceScore, 36);
}

export function parseChineseGeneration(raw: string): number {
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  if (raw === '十') return 10;
  const tens = raw.match(/^([一二三四五六七八九])十([一二三四五六七八九])?$/);
  if (tens) return DIGIT[tens[1]] * 10 + (tens[2] ? DIGIT[tens[2]] : 0);
  if (raw.startsWith('十')) return 10 + (DIGIT[raw[1]] || 0);
  if (raw.length === 1 && DIGIT[raw] != null) return DIGIT[raw];
  return 0;
}

function genderOf(name: string, role: 'head' | 'spouse' | 'child'): 'M' | 'F' {
  if (name.includes('氏') || role === 'spouse') return 'F';
  return 'M';
}

function linkSpouse(left: PdfPersonRecord, right: PdfPersonRecord) {
  if (!left.spouseLocalId) {
    left.spouseLocalId = right.localId;
    left.spouseName = right.fullName;
  }
  right.spouseLocalId = left.localId;
  right.spouseName = left.fullName;
  right.gender = 'F';
}

interface ParsedLine {
  generation?: number;
  head?: string;
  courtesy?: string;
  birthDate?: string;
  deathDate?: string;
  relations: Array<{ kind: 'spouse' | 'child'; name: string; female: boolean }>;
}

export function parseGenealogyLine(rawLine: string): ParsedLine | null {
  let line = rawLine.trim().replace(/^[\d.、．\s]+/, '');
  if (!line) return null;

  let generation: number | undefined;
  const generationMatch = line.match(/^第([0-9一二三四五六七八九十百]+)世/);
  if (generationMatch) {
    generation = parseChineseGeneration(generationMatch[1]);
    line = line.slice(generationMatch[0].length).replace(/^[，,、\s]+/, '');
  }
  line = line.replace(/^行([0-9一二三四五六七八九十百]+)/, '').replace(/^[，,、\s]+/, '');
  if (!line) return null;

  const birthDate = extractDate(line, ['生于', '生', '诞']);
  const deathDate = extractDate(line, ['逝世', '卒于', '卒', '殁', '终']);
  const courtesyMatch = line.match(/字([\u4e00-\u9fa5]{1,4})/);

  let rest = line;
  let head: string | undefined;
  if (!leadingKeyword(rest)) {
    head = leadingName(rest);
    if (head) rest = rest.slice(rest.indexOf(head) + head.length);
  }

  const relations: ParsedLine['relations'] = [];
  const marker = /(?:^|[，,、;；。\s])(嫡配|继配|側室|侧室|长子|次子|三子|四子|五子|之子|长女|次女|之女|配|娶|妻|子|女)/g;
  const hits = [...rest.matchAll(marker)];
  for (let i = 0; i < hits.length; i++) {
    const keyword = hits[i][1];
    const start = (hits[i].index ?? 0) + hits[i][0].length;
    const end = i + 1 < hits.length ? (hits[i + 1].index ?? rest.length) : rest.length;
    const female = keyword.includes('女');
    const kind: 'spouse' | 'child' = /配|娶|妻|室/.test(keyword) ? 'spouse' : 'child';
    for (const name of namesIn(rest.slice(start, end))) {
      relations.push({ kind, name, female });
    }
  }

  if (!head && relations.length === 0) return null;
  return {
    generation: generation || undefined,
    head,
    courtesy: courtesyMatch?.[1],
    birthDate: birthDate ?? undefined,
    deathDate: deathDate ?? undefined,
    relations,
  };
}

function leadingKeyword(value: string): string | null {
  return KEYWORDS.find((keyword) => value.startsWith(keyword)) ?? null;
}

function leadingName(value: string): string | undefined {
  const text = value.replace(/^[，,、;；。\s]+/, '');
  const matched = text.match(/^([\u4e00-\u9fa5]{1,2}氏|[\u4e00-\u9fa5]{2,4})/);
  if (!matched) return undefined;
  if (KEYWORDS.some((keyword) => matched[1] === keyword || matched[1].startsWith(keyword))) return undefined;
  return matched[1];
}

function namesIn(chunk: string): string[] {
  return chunk
    .split(/[、,，]/)
    .map((part) => leadingName(part.split(/字|号|生|卒|殁/)[0] ?? ''))
    .filter((name): name is string => !!name);
}

function extractDate(text: string, keywords: string[]): string | null {
  const ordered = [...keywords].sort((a, b) => b.length - a.length);
  for (const keyword of ordered) {
    const index = text.indexOf(keyword);
    if (index === -1) continue;
    const after = text.slice(index + keyword.length);
    const full = after.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})/);
    if (full) {
      return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`;
    }
    const year = after.match(/(\d{4})年?/);
    if (year && keyword !== '生') return `${year[1]}-01-01`;
    if (year && keyword === '生于') return `${year[1]}-01-01`;
  }
  return null;
}
