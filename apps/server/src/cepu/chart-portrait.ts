/**
 * 世系图上的人物头像。只接受已经存在的图片地址。
 * 性别图、姓氏图、随机占位图和 data URI 都不当成头像。
 */
const PLACEHOLDER = /picsum\.photos|dicebear|ui-avatars|placeholder\.com|via\.placeholder|default[-_]?avatar|generic[-_]?person|identicon/i;

export function chartPortraitUrl(value: unknown): string {
  const url = String(value ?? '').trim();
  if (!url || url.startsWith('data:')) return '';
  if (PLACEHOLDER.test(url)) return '';
  if (url.startsWith('/') || /^https?:\/\//i.test(url)) return url;
  return '';
}
