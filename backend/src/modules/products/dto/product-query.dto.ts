import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ProductCategory } from '../enums/product-category.enum';
import { CursorPaginationQueryDto } from '../../../common/pagination/cursor-pagination';

/**
 * GET /products 쿼리 — category 필터 + 커서 pagination(N6).
 */
export class ProductQueryDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductCategory, description: '제품 카테고리 필터' })
  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;
}
