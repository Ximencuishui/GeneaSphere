/**
 * 演示页人物资料。卡片上只放姓名和生卒年，这些字段在点击后的抽屉里看。
 */
export interface PersonEvent {
  year: string;
  text: string;
}

export interface PersonStory {
  photoUrl?: string;
  generationWord?: string;
  bio?: string;
  events?: PersonEvent[];
  birthYear?: number;
  deathYear?: number;
}

function portrait(name: string, background: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300"><rect width="100%" height="100%" fill="${background}"/><text x="50%" y="54%" text-anchor="middle" font-size="72" fill="#F7F1E6" font-family="serif">${name}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** key 是「场景 id:节点 id」。 */
export const DEMO_PROFILES: Record<string, PersonStory> = {
  'multi-wife:1': {
    photoUrl: portrait('夫', '#8C7344'),
    generationWord: '德',
    birthYear: 1480,
    deathYear: 1546,
    bio: '本支始迁祖之后第五世。以耕读持家，先后娶四位妻子，子女分属各房。',
    events: [
      { year: '1502', text: '补县学生员。' },
      { year: '1518', text: '主持重修祠堂，手订本房世系。' },
      { year: '1546', text: '卒于家，葬祖茔左侧。' },
    ],
  },
  'multi-wife:2': {
    photoUrl: portrait('妻', '#A56B78'),
    generationWord: '淑',
    birthYear: 1483,
    deathYear: 1520,
    bio: '元配。生子继 A，早卒。族谱以她所出为长房。',
    events: [
      { year: '1499', text: '于归。' },
      { year: '1504', text: '生长子继 A。' },
    ],
  },
  'multi-wife:3': {
    photoUrl: portrait('妻', '#7A4458'),
    generationWord: '静',
    birthYear: 1490,
    deathYear: 1558,
    bio: '继室。生继 B1、继 B2。B1 后承主脉。',
    events: [
      { year: '1521', text: '续弦入门。' },
      { year: '1524', text: '生继 B1。' },
      { year: '1528', text: '生继 B2。' },
    ],
  },
  'multi-wife:A': {
    generationWord: '仁',
    birthYear: 1504,
    deathYear: 1561,
    bio: '长房长子，主脉。幼年丧母，由继母抚育。',
    events: [{ year: '1530', text: '入县学。' }],
  },
  'multi-wife:B1': {
    generationWord: '仁',
    birthYear: 1524,
    deathYear: 1589,
    bio: '二房长子。生子 B1 子、女 B1 女。谱牒记其承第二房香火，同时标注主脉。',
    events: [{ year: '1548', text: '分家立户，仍与长房同祭。' }],
  },
  'single-spouse-multi-kids:H': {
    photoUrl: portrait('夫', '#6E5830'),
    generationWord: '文',
    birthYear: 1602,
    deathYear: 1674,
    bio: '一妻三子。长子、次子各有子嗣，三子未娶。',
    events: [
      { year: '1624', text: '娶妻。' },
      { year: '1626', text: '生长子。' },
    ],
  },
  'single-spouse-multi-kids:W': {
    photoUrl: portrait('妻', '#8E5A68'),
    generationWord: '惠',
    birthYear: 1605,
    deathYear: 1680,
    bio: '元配，三子皆其所出。',
    events: [{ year: '1624', text: '于归。' }],
  },
  'single-spouse-multi-kids:S1': {
    generationWord: '行',
    birthYear: 1626,
    deathYear: 1690,
    bio: '长子，主脉。生有长孙。',
    events: [{ year: '1648', text: '生长孙。' }],
  },
  'single-spouse-multi-kids:S2': {
    generationWord: '行',
    birthYear: 1629,
    deathYear: 1695,
    bio: '次子。生次孙，旁支。',
    events: [],
  },
  'single-spouse-multi-kids:S3': {
    generationWord: '行',
    birthYear: 1633,
    deathYear: 1688,
    bio: '三子，无后。',
    events: [],
  },
};
