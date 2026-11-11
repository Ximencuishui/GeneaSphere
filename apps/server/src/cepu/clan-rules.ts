/**
 * 家规家训只有一份正文，存在 Clan.rules。
 * 家族概况编辑它；册谱卷二「家训」读它、保存时写回它。
 */

export const FAMILY_RULES_TEXT = `族中家训以文公《白鹿洞书院揭示》为纲。家族概况与册谱卷二家训共用这一份文字。

五教之目
父子有亲。君臣有义。夫妇有别。长幼有序。朋友有信。

为学之序
博学之。审问之。慎思之。明辨之。笃行之。

修身之要
言忠信。行笃敬。惩忿窒欲。迁善改过。

处事之要
正其义不谋其利。明其道不计其功。

接物之要
己所不欲，勿施于人。行有不得，反求诸己。

日用八则
一、孝父母：百善孝为先，晨昏定省，侍奉无怠。
二、友兄弟：手足情深，兄友弟恭，和睦相处。
三、谨夫妇：相敬如宾，勤俭持家，共育后代。
四、教子孙：诗书传家，以德为先，严慈相济。
五、睦宗族：宗族和睦，守望相助，患难与共。
六、重丧祭：慎终追远，祭祀以诚，不忘根本。
七、崇节俭：戒奢以俭，量入为出，积善余庆。
八、守国法：奉公守法，不涉邪僻，立身行道。`;

const LEGACY_OVERVIEW_RULES = `一、孝父母：百善孝为先，晨昏定省，侍奉无怠。
二、友兄弟：手足情深，兄友弟恭，和睦相处。
三、谨夫妇：相敬如宾，勤俭持家，共育后代。
四、教子孙：诗书传家，以德为先，严慈相济。
五、睦宗族：宗族和睦，守望相助，患难与共。
六、重丧祭：慎终追远，祭祀以诚，不忘根本。
七、崇节俭：戒奢以俭，量入为出，积善余庆。
八、守国法：奉公守法，不涉邪僻，立身行道。`;

export function isFamilyRulesTitle(title: string): boolean {
  return title.includes('家训');
}

export function isLegacyOverviewRules(text: string): boolean {
  return text.replace(/\s+/g, '') === LEGACY_OVERVIEW_RULES.replace(/\s+/g, '');
}

export function isLegacyBookRules(text: string): boolean {
  return text.includes('紫阳日用八则') || (text.includes('白鹿洞书院揭示') && !text.includes('百善孝为先'));
}

/** 两份演示稿都还在时，收成同一份。已经改过的一侧保留。 */
export function chooseFamilyRules(overview: string, bookPlain: string): string {
  const rules = overview.trim();
  const book = bookPlain.trim();
  const overviewLegacy = !rules || isLegacyOverviewRules(rules);
  const bookLegacy = !book || isLegacyBookRules(book);
  if (overviewLegacy && bookLegacy) return FAMILY_RULES_TEXT;
  if (!rules) return book;
  if (!book || bookLegacy) return rules;
  if (overviewLegacy) return book;
  return rules;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isHeading(line: string): boolean {
  return line.length > 0 && line.length <= 12 && !/[：:，。；;]/.test(line);
}

/** 纯文本排成册谱文档。短行且没有句读的，当作小标题。 */
export function rulesToHtml(text: string): string {
  const source = text.trim();
  if (!source) return '';
  return source.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return '';
    if (isHeading(lines[0]) && lines.length > 1) {
      const rest = lines.slice(1).map(escapeHtml).join('<br/>');
      return `<h4>${escapeHtml(lines[0])}</h4>\n<p style="text-indent:2em;">${rest}</p>`;
    }
    if (isHeading(lines[0]) && lines.length === 1) {
      return `<h4>${escapeHtml(lines[0])}</h4>`;
    }
    return `<p style="text-indent:2em;">${lines.map(escapeHtml).join('<br/>')}</p>`;
  }).filter(Boolean).join('\n');
}

/** 册谱编辑器交回来的 HTML 或纯文本，还原成家族概况使用的纯文本。 */
export function htmlToRules(html: string): string {
  const source = html.trim();
  if (!source) return '';
  if (!source.includes('<')) return source.replace(/\r\n/g, '\n').trim();
  return source
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type RulesDb = {
  clan: {
    update: (args: { where: { id: bigint }; data: { rules: string | null } }) => Promise<unknown>;
  };
  bookVolume: {
    findMany: (args: {
      where: { clan_id: bigint; type: string };
      select: { id: true; title: true; content: true };
    }) => Promise<{ id: bigint; title: string; content: string | null }[]>;
    update: (args: { where: { id: bigint }; data: { content: string } }) => Promise<unknown>;
  };
};

/** 把 Clan.rules 写进标题含「家训」的文档卷，供导出直接读卷宗正文。 */
export async function refreshFamilyRulesVolume(db: RulesDb, clanId: bigint, rules: string | null) {
  const volumes = await db.bookVolume.findMany({
    where: { clan_id: clanId, type: 'document' },
    select: { id: true, title: true, content: true },
  });
  const volume = volumes.find((item) => isFamilyRulesTitle(item.title));
  if (!volume) return;
  const content = rules?.trim() ? rulesToHtml(rules) : '';
  if ((volume.content ?? '') === content) return;
  await db.bookVolume.update({ where: { id: volume.id }, data: { content } });
}
