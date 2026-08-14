import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { CareProduct, CareProductCategory } from '../types';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** 제품명으로 네이버 검색 결과를 연다 — 특정 판매처 하나로 고정하지 않는다. */
export function productSearchUrl(name: string): string {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(name)}`;
}

/** 카테고리별 아이콘 + 파스텔 팔레트 — CareRoutineTimeline의 phase 카드와 같은 톤. */
const CATEGORY_STYLE: Record<CareProductCategory, { icon: IoniconName; bg: string; accent: string }> = {
  클렌저: { icon: 'water-outline', bg: '#DCEEDC', accent: '#4F8F5B' },
  토너: { icon: 'flask-outline', bg: '#DCEAFB', accent: '#3F6FA6' },
  '에센스/세럼': { icon: 'eyedrop-outline', bg: '#FBE7EF', accent: '#B0567F' },
  앰플: { icon: 'medical-outline', bg: '#F3E3FB', accent: '#8A4FB0' },
  로션: { icon: 'contrast-outline', bg: '#E7F3FB', accent: '#4A87A8' },
  크림: { icon: 'cube-outline', bg: '#FCEEE0', accent: '#C07A3E' },
  선크림: { icon: 'sunny-outline', bg: '#FDF3D3', accent: '#B99327' },
  마스크팩: { icon: 'happy-outline', bg: '#DCF1EE', accent: '#2E8F86' },
  기타: { icon: 'ellipsis-horizontal-outline', bg: '#EDEBE3', accent: '#8C8A80' },
};

export function categoryStyle(category: CareProductCategory): { icon: IoniconName; bg: string; accent: string } {
  return CATEGORY_STYLE[category] ?? CATEGORY_STYLE['기타'];
}

export interface CareProductGroup {
  category: CareProductCategory;
  products: CareProduct[];
}

/** 화면에 보여줄 카테고리 순서 — 실제 스킨케어 순서(클렌저→토너→...→선크림)에 가깝게 고정. */
const CATEGORY_ORDER: CareProductCategory[] = [
  '클렌저',
  '토너',
  '에센스/세럼',
  '앰플',
  '로션',
  '크림',
  '선크림',
  '마스크팩',
  '기타',
];

/** products를 카테고리별로 묶는다 — 제품이 없는 카테고리는 결과에서 빠진다. */
export function groupProductsByCategory(products: CareProduct[]): CareProductGroup[] {
  const byCategory = new Map<CareProductCategory, CareProduct[]>();
  for (const product of products) {
    const list = byCategory.get(product.category);
    if (list) list.push(product);
    else byCategory.set(product.category, [product]);
  }
  return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => ({
    category,
    products: byCategory.get(category)!,
  }));
}
