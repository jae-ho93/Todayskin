import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceGrade } from '../../recommendations/enums/evidence-grade.enum';
import { ProductCategory } from '../enums/product-category.enum';

export type ProductTiming = '세안 후' | '외출 전' | '외출 후';

/**
 * Product 응답 — 기존 FastAPI Product(camelCase) 계약 유지.
 * 날씨 기반 제품은 reason, timing을 포함한다.
 */
export class ProductDto {
  @ApiProperty({ example: 'prod-1' })
  id!: string;

  @ApiProperty({ example: '데일리 UV 디펜스 선크림' })
  name!: string;

  @ApiProperty({ example: '닥터지' })
  brand!: string;

  @ApiPropertyOptional({
    type: String,
    example: null,
    description: '제품 이미지 URI',
    nullable: true,
  })
  imageUri?: string | null;

  // N24: 실제 구매 URL — FE가 Linking.openURL로 연다. 카탈로그 제품은 사실상 필수.
  @ApiPropertyOptional({
    type: String,
    example:
      'https://www.oliveyoung.co.kr/store/search/getSearch.do?query=%EC%84%A0%ED%81%AC%EB%A6%BC',
    description: '구매 페이지 URL (Linking.openURL로 직접 열 수 있는 값)',
    nullable: true,
  })
  purchaseUrl?: string | null;

  @ApiProperty({ enum: EvidenceGrade, example: EvidenceGrade.A })
  matchedGrade!: EvidenceGrade;

  @ApiProperty({
    type: [String],
    example: ['징크옥사이드', '나이아신아마이드'],
  })
  matchedIngredients!: string[];

  @ApiProperty({ enum: ProductCategory, example: ProductCategory.BARRIER })
  category!: ProductCategory;

  @ApiPropertyOptional({
    type: String,
    description: '연결된 추천 ID (카탈로그 제품용, 호환)',
    nullable: true,
  })
  recommendationId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: '날씨 기반 제품의 근거 설명',
    nullable: true,
  })
  reason?: string | null;

  @ApiPropertyOptional({
    enum: ['세안 후', '외출 전', '외출 후'],
    description: '하루 중 이 제품을 쓰면 좋은 상황',
    nullable: true,
  })
  timing?: ProductTiming | null;
}
