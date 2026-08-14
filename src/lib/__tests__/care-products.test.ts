import { groupProductsByCategory } from '../care-products';
import type { CareProduct } from '../../types';

function product(overrides: Partial<CareProduct>): CareProduct {
  return {
    name: '제품',
    url: 'https://example.com',
    reason: '이유',
    category: '기타',
    evidence: null,
    ...overrides,
  };
}

describe('groupProductsByCategory', () => {
  it('스킨케어 순서(클렌저→...→선크림)로 카테고리를 정렬한다', () => {
    const products = [
      product({ name: '크림A', category: '크림' }),
      product({ name: '클렌저A', category: '클렌저' }),
      product({ name: '선크림A', category: '선크림' }),
      product({ name: '토너A', category: '토너' }),
    ];

    const groups = groupProductsByCategory(products);

    expect(groups.map((g) => g.category)).toEqual(['클렌저', '토너', '크림', '선크림']);
  });

  it('같은 카테고리의 제품을 한 그룹에 순서대로 담는다', () => {
    const products = [
      product({ name: '토너A', category: '토너' }),
      product({ name: '토너B', category: '토너' }),
    ];

    const groups = groupProductsByCategory(products);

    expect(groups).toHaveLength(1);
    expect(groups[0].products.map((p) => p.name)).toEqual(['토너A', '토너B']);
  });

  it('제품이 없는 카테고리는 결과에 나오지 않는다', () => {
    const groups = groupProductsByCategory([product({ category: '앰플' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('앰플');
  });

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(groupProductsByCategory([])).toEqual([]);
  });
});
