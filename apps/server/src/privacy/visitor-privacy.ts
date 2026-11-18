export interface VisitorPrivacyRules {
  allow_visitor_deceased: boolean;
  max_generations_visible: number;
  hide_living_photos: boolean;
  hide_living_spouses: boolean;
  enable_relative_verify: boolean;
  verify_questions: string[];
  verify_max_attempts: number;
}

export const DEFAULT_VISITOR_PRIVACY: VisitorPrivacyRules = {
  allow_visitor_deceased: false,
  max_generations_visible: 5,
  hide_living_photos: true,
  hide_living_spouses: true,
  enable_relative_verify: false,
  verify_questions: [],
  verify_max_attempts: 3,
};

export function generationFromMaxDepth(maxDepth: number | undefined): number {
  if (maxDepth == null || !Number.isFinite(maxDepth)) return 1;
  return maxDepth + 1;
}

export function visitorMaySeePerson(
  isLiving: boolean,
  generation: number,
  rules: VisitorPrivacyRules,
): boolean {
  if (generation > rules.max_generations_visible) return false;
  if (!isLiving && !rules.allow_visitor_deceased) return false;
  return true;
}

export function mediaVisibleToVisitor(
  people: Array<{ is_living: boolean; generation: number }>,
  rules: VisitorPrivacyRules,
): boolean {
  if (people.length === 0) return true;
  for (const person of people) {
    if (person.generation > rules.max_generations_visible) return false;
    if (!person.is_living && !rules.allow_visitor_deceased) return false;
    if (person.is_living && rules.hide_living_photos) return false;
  }
  return true;
}

function visibleChildren(node: any, rules: VisitorPrivacyRules, genById: Map<string, number>) {
  return (node.children || [])
    .map((child: any) => redactTreeNode(child, rules, genById))
    .filter(Boolean);
}

function keepChildLinks(links: any[] | undefined, children: any[]) {
  if (!links) return undefined;
  const ids = new Set(children.map((child) => String(child.id)));
  return links.filter((link) => ids.has(String(link.child_id)));
}

function filterSpouses(spouses: any[] | undefined, rules: VisitorPrivacyRules) {
  if (!Array.isArray(spouses)) return spouses;
  return spouses.filter((spouse) => {
    const living = spouse?.is_living !== false;
    if (living && rules.hide_living_spouses) return false;
    if (!living && !rules.allow_visitor_deceased) return false;
    return true;
  });
}

/** 游客树节点。超过可见代数的整支去掉；已故人员只留结构占位，不带详情。 */
export function redactTreeNode(node: any, rules: VisitorPrivacyRules, genById: Map<string, number>): any | null {
  if (!node) return null;
  const generation = genById.get(String(node.id)) ?? 1;
  if (generation > rules.max_generations_visible) return null;
  const children = visibleChildren(node, rules, genById);
  const living = node.is_living !== false;
  if (!living && !rules.allow_visitor_deceased) {
    return {
      id: node.id,
      name: '',
      gender: '',
      is_living: false,
      has_photo: false,
      hidden: true,
      children,
      child_links: keepChildLinks(node.child_links, children),
    };
  }
  const next: any = {
    ...node,
    children,
    child_links: keepChildLinks(node.child_links, children),
    spouses: filterSpouses(node.spouses, rules),
  };
  if (living && rules.hide_living_photos) {
    next.avatar_url = undefined;
    next.thumbnail_url = undefined;
    next.has_photo = false;
  }
  if (rules.hide_living_spouses) next.marriages_history = undefined;
  return next;
}

function countNodes(node: any): number {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum: number, child: any) => sum + countNodes(child), 0);
}

function collectIds(node: any, ids: Set<string>) {
  if (!node) return;
  ids.add(String(node.id));
  for (const child of node.children || []) collectIds(child, ids);
}

export function redactClanTree(tree: any, rules: VisitorPrivacyRules, genById: Map<string, number>) {
  const rootNode = redactTreeNode(tree?.rootNode, rules, genById);
  if (!rootNode) {
    return {
      ...tree,
      rootNode: null,
      spouseEdges: [],
      mainLineage: [],
      totalPersons: 0,
      shownPersons: 0,
      isPartial: false,
    };
  }
  const ids = new Set<string>();
  collectIds(rootNode, ids);
  const spouseIds = new Set((rootNode.spouses || []).map((spouse: any) => String(spouse.id)));
  const shown = countNodes(rootNode);
  return {
    ...tree,
    rootNode,
    spouseEdges: (tree.spouseEdges || []).filter((edge: any) => spouseIds.has(String(edge.to)) || spouseIds.has(String(edge.from))),
    mainLineage: (tree.mainLineage || []).filter((id: any) => ids.has(String(id))),
    totalPersons: shown,
    shownPersons: shown,
    isPartial: false,
  };
}

export function redactPersonDetail(detail: any, rules: VisitorPrivacyRules, generation: number) {
  if (!detail?.person) return null;
  if (generation > rules.max_generations_visible) return null;
  const living = detail.person.is_living !== false;
  if (!living && !rules.allow_visitor_deceased) {
    return { hidden: true, person: { id: detail.person.id, is_living: false } };
  }
  const next: any = {
    ...detail,
    person: { ...detail.person },
    profile: detail.profile ? { ...detail.profile } : detail.profile,
    spouses: filterSpouses(detail.spouses, rules) || [],
    media: Array.isArray(detail.media) ? [...detail.media] : [],
  };
  if (living && rules.hide_living_photos) {
    next.person.avatar_url = null;
    next.person.thumbnail_url = null;
    next.media = [];
  }
  if (living && rules.hide_living_spouses && next.profile) {
    next.profile.marital_notes = null;
  }
  if (!rules.allow_visitor_deceased) {
    next.father = null;
    next.mother = null;
    next.parents = [];
  }
  return next;
}

export function redactPersonBio(bio: any, rules: VisitorPrivacyRules, generation: number) {
  if (!bio) return null;
  if (generation > rules.max_generations_visible) return null;
  if (bio.is_living === false && !rules.allow_visitor_deceased) {
    return { hidden: true, person_id: bio.person_id, is_living: false };
  }
  const next = { ...bio };
  if (bio.is_living !== false && rules.hide_living_spouses) next.marital_notes = null;
  return next;
}

export interface NamedPerson {
  full_name: string;
  is_living: boolean;
  generation: number;
}

/** 文档卷 HTML 没有结构化人物字段。隐藏人物的姓名从正文里去掉，在世照片开关打开时去掉图片。 */
export function redactDocumentHtml(html: string, rules: VisitorPrivacyRules, people: NamedPerson[]): string {
  let text = html || '';
  const hidden = people
    .map((person) => person.full_name?.trim() || '')
    .filter((name, index, names) => {
      if (name.length < 2 || names.indexOf(name) !== index) return false;
      const person = people.find((item) => item.full_name?.trim() === name);
      return !!person && !visitorMaySeePerson(person.is_living, person.generation, rules);
    })
    .sort((a, b) => b.length - a.length);
  for (const name of hidden) text = text.split(name).join('');
  if (rules.hide_living_photos) text = text.replace(/<img\b[^>]*>/gi, '');
  return text;
}

/** 游客只知道是否近亲，不返回共同祖先编号和亲缘称谓。 */
export function visitorKinshipResult<T extends { isConsanguineous: boolean }>(full: T, member: boolean): T | { isConsanguineous: boolean } {
  if (member) return full;
  return { isConsanguineous: full.isConsanguineous };
}

/** 册谱世录的 generation 是距始祖的深度，根为 0。产品口径的「第 N 代」= 深度 + 1。 */
export function redactCepuEntries(entries: any[], rules: VisitorPrivacyRules) {
  const living = new Map(entries.map((entry) => [String(entry.person_id), entry.is_living !== false]));
  const generationOf = new Map(entries.map((entry) => [String(entry.person_id), (entry.generation ?? 0) + 1]));
  const visible: any[] = [];
  for (const entry of entries) {
    const generation = (entry.generation ?? 0) + 1;
    if (generation > rules.max_generations_visible) continue;
    if (entry.is_living === false && !rules.allow_visitor_deceased) {
      visible.push({
        person_id: entry.person_id,
        generation: entry.generation,
        is_living: false,
        hidden: true,
        full_name: '',
      });
      continue;
    }
    const next = { ...entry };
    if (entry.is_living !== false && rules.hide_living_photos) {
      next.figures = [];
      next.avatar_url = undefined;
    }
    if (rules.hide_living_spouses) next.spouses = [];
    const children = Array.isArray(entry.children) ? entry.children : [];
    next.children = children.filter((child: any) => {
      const childGeneration = generationOf.get(String(child.person_id)) ?? 1;
      if (childGeneration > rules.max_generations_visible) return false;
      if (!rules.allow_visitor_deceased && living.get(String(child.person_id)) === false) return false;
      return true;
    });
    if (!rules.allow_visitor_deceased) {
      next.father_name = undefined;
      next.father_id = undefined;
    }
    visible.push(next);
  }
  return visible;
}

const RELATIVE_QUESTION_TYPES = [
  'father_name',
  'grandfather_birth_year',
  'great_grandfather_spouse_surname',
  'direct_elder',
  'direct_elder_year',
  'sibling_name',
  'birth_place',
] as const;

export function mapRelativeQuestionTypes(questions: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of questions || []) {
    const text = String(raw || '').trim();
    if (!text) continue;
    if (text.includes('曾祖父') && text.includes('配偶')) out.push('great_grandfather_spouse_surname');
    else if (text.includes('祖父') && (text.includes('出生') || text.includes('年'))) out.push('grandfather_birth_year');
    else if (text.includes('父亲') && (text.includes('姓名') || text.includes('名字'))) out.push('father_name');
    else if ((RELATIVE_QUESTION_TYPES as readonly string[]).includes(text)) out.push(text);
  }
  return [...new Set(out)];
}

export function relativeMaxAttempts(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 3;
  return Math.min(10, Math.floor(parsed));
}
