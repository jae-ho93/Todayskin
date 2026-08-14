import { CARE_PRODUCT_CATEGORY_ORDER, categoryFromSlug, categoryToSlug } from '../care-products';

describe('care-products slug mapping', () => {
  it('모든 카테고리가 왕복 변환된다(카테고리 → 슬러그 → 카테고리)', () => {
    for (const category of CARE_PRODUCT_CATEGORY_ORDER) {
      const slug = categoryToSlug(category);
      expect(categoryFromSlug(slug)).toBe(category);
    }
  });

  it('"에센스/세럼/앰플"처럼 "/"가 섞인 카테고리도 라우트에 쓸 수 있는 슬러그로 바뀐다', () => {
    const slug = categoryToSlug('에센스/세럼/앰플');
    expect(slug).not.toContain('/');
    expect(categoryFromSlug(slug)).toBe('에센스/세럼/앰플');
  });

  it('모르는 슬러그나 undefined는 null을 반환한다', () => {
    expect(categoryFromSlug('no-such-category')).toBeNull();
    expect(categoryFromSlug(undefined)).toBeNull();
  });
});
