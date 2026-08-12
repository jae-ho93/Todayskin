import { ApiProperty } from '@nestjs/swagger';
import { CursorPageDto } from '../../../common/pagination/cursor-pagination';
import { ProductDto } from './product.dto';

/**
 * R28: OpenAPI에 items 타입을 드러내기 위한 구체 페이지 DTO.
 * 제네릭 CursorPageDto<T>는 런타임 타입 정보가 없어 스펙에 T가 나오지 않는다.
 */
export class ProductPageDto extends CursorPageDto<ProductDto> {
  @ApiProperty({ type: [ProductDto] })
  declare items: ProductDto[];
}
