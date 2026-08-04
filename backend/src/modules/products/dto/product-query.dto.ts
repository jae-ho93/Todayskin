import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ProductCategory } from '../enums/product-category.enum';

/**
 * GET /products 쿼리 — category 필터.
 */
export class ProductQueryDto {
  @ApiPropertyOptional({ enum: ProductCategory, description: '제품 카테고리 필터' })
  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;
}
