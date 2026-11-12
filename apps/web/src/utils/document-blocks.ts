/**
 * 把文档卷 HTML 切成不跨页切开的块。段落、标题、图片、列表各算一块。
 */

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'img', 'figure', 'blockquote', 'table', 'pre', 'hr',
]);

const CONTAINER_TAGS = new Set(['div', 'section', 'article', 'main']);

export function documentBlocksFromHtml(html: string): string[] {
  const source = html.replace(/^\uFEFF/, '').trim();
  if (!source) return [];
  const doc = new DOMParser().parseFromString(`<div id="doc-root">${source}</div>`, 'text/html');
  const root = doc.getElementById('doc-root');
  if (!root) return [];
  const blocks: string[] = [];
  collect(root, blocks);
  return blocks.filter(isVisibleBlock);
}

function collect(parent: Element, blocks: string[]) {
  let inline = '';
  const flush = () => {
    const chunk = inline.trim();
    inline = '';
    if (chunk) blocks.push(`<p>${chunk}</p>`);
  };
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.trim()) inline += escapeHtml(text);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    if (tag === 'br') {
      flush();
      continue;
    }
    if (isSplittableContainer(element)) {
      flush();
      collect(element, blocks);
      continue;
    }
    flush();
    blocks.push(element.outerHTML);
  }
  flush();
}

function isSplittableContainer(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (!CONTAINER_TAGS.has(tag)) return false;
  return [...element.children].some((child) => {
    const childTag = child.tagName.toLowerCase();
    return BLOCK_TAGS.has(childTag) || CONTAINER_TAGS.has(childTag);
  });
}

function isVisibleBlock(html: string): boolean {
  if (/<img\b/i.test(html)) return true;
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return text.length > 0;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
