import { describe, expect, it } from 'vitest';
import { documentBlocksFromHtml } from '@/utils/document-blocks';

describe('documentBlocksFromHtml', () => {
  it('段落、标题、列表、图片各自成块', () => {
    const blocks = documentBlocksFromHtml(
      '<h2>序</h2><p>第一段</p><p>第二段</p><ul><li>甲</li><li>乙</li></ul><img src="/a.png" alt="图">',
    );
    expect(blocks).toHaveLength(5);
    expect(blocks[0]).toContain('序');
    expect(blocks[1]).toContain('第一段');
    expect(blocks[3]).toContain('<ul>');
    expect(blocks[4]).toContain('<img');
  });

  it('只含块级子节点的 div 拆开，不把整篇当成一块', () => {
    const blocks = documentBlocksFromHtml('<div><p>甲</p><p>乙</p></div>');
    expect(blocks).toEqual(['<p>甲</p>', '<p>乙</p>']);
  });

  it('没有标签的正文收成一段', () => {
    expect(documentBlocksFromHtml('开篇一句')).toEqual(['<p>开篇一句</p>']);
  });

  it('空正文没有块', () => {
    expect(documentBlocksFromHtml('')).toEqual([]);
    expect(documentBlocksFromHtml('<p> </p><p><br></p>')).toEqual([]);
  });

  it('一段内部的换行不拆开', () => {
    const blocks = documentBlocksFromHtml('<p>前句<br>后句</p>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('前句');
    expect(blocks[0]).toContain('后句');
  });
});
