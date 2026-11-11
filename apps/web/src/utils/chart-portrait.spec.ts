import { describe, expect, it } from 'vitest';
import { chartPortraitUrl } from '@/utils/chart-portrait';

describe('chartPortraitUrl', () => {
  it('保留本地肖像和普通图片地址', () => {
    expect(chartPortraitUrl('/portraits/zhu-xi.jpg')).toBe('/portraits/zhu-xi.jpg');
    expect(chartPortraitUrl(' https://cdn.example.com/a.jpg ')).toBe('https://cdn.example.com/a.jpg');
  });

  it('空值、占位图和生成头像都不渲染', () => {
    expect(chartPortraitUrl('')).toBe('');
    expect(chartPortraitUrl(null)).toBe('');
    expect(chartPortraitUrl('https://picsum.photos/seed/geneasphere-male-1/200/200')).toBe('');
    expect(chartPortraitUrl('https://api.dicebear.com/7.x/initials/svg?seed=朱')).toBe('');
    expect(chartPortraitUrl('data:image/svg+xml,abc')).toBe('');
  });
});
