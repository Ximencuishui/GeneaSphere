import { CepuService } from '../cepu/cepu.service';
import type { ShiluEntry } from '../cepu/cepu.service';
import {
  preparePreviewEntries,
  renderGenealogyPreviewDocument,
  type GenealogyPreviewParams,
} from './genealogy-preview';

jest.mock('puppeteer-core', () => ({}));

const father: ShiluEntry = {
  person_id: '1',
  generation: 0,
  rank: 1,
  full_name: '始祖',
  gender: 'male',
  courtesy_name: '伯安',
  birth_year: 1800,
  death_year: 1860,
  is_living: false,
  biography: '始祖生平不应在默认预览出现',
  achievements: '开基',
  spouses: [{ name: '始祖配', gender: 'female', marriage_order: 1 }],
  children: [{ person_id: '2', name: '二世', gender: 'male', rank: 1 }],
  premature: false,
};

const son: ShiluEntry = {
  person_id: '2',
  generation: 1,
  rank: 1,
  full_name: '二世',
  gender: 'male',
  is_living: true,
  spouses: [],
  children: [],
  father_id: '1',
  premature: false,
};

function params(overrides: Partial<GenealogyPreviewParams> = {}): GenealogyPreviewParams {
  return {
    layout: 'su',
    style: 'traditional',
    include_options: {
      basic_info: true,
      spouse_info: true,
      children_list: true,
      bio_text: false,
      photo: false,
      migration: false,
    },
    ...overrides,
  };
}

describe('册谱生成预览版式', () => {
  it('苏式、欧式、世系表产出的 HTML 互不相同', () => {
    const entries = [father, son];
    const su = renderGenealogyPreviewDocument({
      clanName: '测试族',
      entries,
      params: params({ layout: 'su' }),
    });
    const ou = renderGenealogyPreviewDocument({
      clanName: '测试族',
      entries,
      params: params({ layout: 'ou' }),
    });
    const shixiFragment = new CepuService({} as never, {} as never).renderShixiPreview(entries, '测试族世系表');
    const shixi = renderGenealogyPreviewDocument({
      clanName: '测试族',
      entries,
      params: params({ layout: 'shixi_table' }),
      shixi: shixiFragment,
    });

    expect(su.html).toContain('data-layout="su"');
    expect(su.html).toContain('su-book');
    expect(ou.html).toContain('data-layout="ou"');
    expect(ou.html).toContain('ou-book');
    expect(shixi.html).toContain('data-layout="shixi_table"');
    expect(shixi.html).toContain('shixi-page');
    expect(su.html).not.toBe(ou.html);
    expect(ou.html).not.toBe(shixi.html);
    expect(su.html).not.toContain('genealogy.hbs');
  });

  it('风格、封面、迁徙勾选不改变版式 HTML', () => {
    const entries = [father, son];
    const base = renderGenealogyPreviewDocument({
      clanName: '测试族',
      entries,
      params: params(),
    }).html;
    const changed = renderGenealogyPreviewDocument({
      clanName: '测试族',
      entries,
      params: params({
        style: 'modern',
        cover_image_url: 'https://example.com/cover.jpg',
        include_options: { ...params().include_options, migration: true },
      }),
    }).html;
    expect(changed).toBe(base);
    expect(changed).not.toContain('cover.jpg');
  });

  it('世代、支系和内容勾选会裁切交给版式函数的条目', () => {
    const ranged = preparePreviewEntries([father, son], params({ generation_start: 2, generation_end: 2 }));
    expect(ranged.map((entry) => entry.full_name)).toEqual(['二世']);

    const branched = preparePreviewEntries(
      [father, son],
      params({ branch: '南支' }),
      new Set(['2']),
    );
    expect(branched.map((entry) => entry.person_id)).toEqual(['2']);

    const stripped = preparePreviewEntries([father], params({
      include_options: {
        basic_info: false,
        spouse_info: false,
        children_list: false,
        bio_text: false,
        photo: false,
      },
    }));
    expect(stripped[0]).toMatchObject({
      full_name: '始祖',
      courtesy_name: undefined,
      birth_year: undefined,
      spouses: [],
      children: [],
      biography: undefined,
      achievements: undefined,
    });
  });
});
