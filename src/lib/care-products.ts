import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { CareProductCategory } from '../types';

export type CareCategoryIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** 제품명으로 네이버 검색 결과를 연다 — 특정 판매처 하나로 고정하지 않는다. */
export function productSearchUrl(name: string): string {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(name)}`;
}

/**
 * 카테고리별 아이콘 + 파스텔 팔레트. 아이콘은 MaterialCommunityIcons에서 고른다 —
 * Ionicons엔 "로션"/"토너"/"마스크팩"처럼 실제 화장품 모양의 아이콘이 없어서
 * 추상적으로만 표현됐는데, MaterialCommunityIcons엔 lotion-outline/bottle-tonic-outline
 * 처럼 그 화장품을 그대로 그린 아이콘이 있다.
 */
const CATEGORY_STYLE: Record<CareProductCategory, { icon: CareCategoryIconName; bg: string; accent: string }> = {
  클렌저: { icon: 'hand-wash-outline', bg: '#DCEEDC', accent: '#4F8F5B' },
  토너: { icon: 'bottle-tonic-outline', bg: '#DCEAFB', accent: '#3F6FA6' },
  '에센스/세럼/앰플': { icon: 'eyedropper-variant', bg: '#F3E7F5', accent: '#9C5B96' },
  로션: { icon: 'lotion-outline', bg: '#E7F3FB', accent: '#4A87A8' },
  크림: { icon: 'bowl-outline', bg: '#FCEEE0', accent: '#C07A3E' },
  선크림: { icon: 'weather-sunny', bg: '#FDF3D3', accent: '#B99327' },
  마스크팩: { icon: 'face-woman-shimmer-outline', bg: '#DCF1EE', accent: '#2E8F86' },
  기타: { icon: 'dots-horizontal', bg: '#EDEBE3', accent: '#8C8A80' },
};

export function categoryStyle(
  category: CareProductCategory,
): { icon: CareCategoryIconName; bg: string; accent: string } {
  return CATEGORY_STYLE[category] ?? CATEGORY_STYLE['기타'];
}

/**
 * 카테고리 메뉴에 보여줄 고정 순서.
 */
export const CARE_PRODUCT_CATEGORY_ORDER: CareProductCategory[] = [
  '클렌저',
  '토너',
  '에센스/세럼/앰플',
  '로션',
  '선크림',
  '크림',
  '기타',
  '마스크팩',
];

/** "에센스/세럼/앰플"처럼 "/"가 섞인 카테고리명을 라우트 파라미터로 못 쓰므로 슬러그로 변환한다. */
const SLUG_BY_CATEGORY: Record<CareProductCategory, string> = {
  클렌저: 'cleanser',
  토너: 'toner',
  '에센스/세럼/앰플': 'essence-serum-ampoule',
  로션: 'lotion',
  크림: 'cream',
  선크림: 'sunscreen',
  마스크팩: 'mask-pack',
  기타: 'etc',
};
const CATEGORY_BY_SLUG: Record<string, CareProductCategory> = Object.fromEntries(
  Object.entries(SLUG_BY_CATEGORY).map(([category, slug]) => [slug, category as CareProductCategory]),
);

export function categoryToSlug(category: CareProductCategory): string {
  return SLUG_BY_CATEGORY[category];
}

export function categoryFromSlug(slug: string | undefined): CareProductCategory | null {
  if (!slug) return null;
  return CATEGORY_BY_SLUG[slug] ?? null;
}
