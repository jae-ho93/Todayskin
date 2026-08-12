import { Module } from '@nestjs/common';
import { ProductCatalogService } from './product-catalog.service';

/**
 * R9: 카탈로그 읽기/캐시만 담은 작은 모듈.
 *
 * 추천·관리자 모듈도 카탈로그가 필요한데 `ProductModule`을 통째로 import하면
 * Gemini·Weather·Jobs 그래프까지 딸려온다. 공유되는 것은 카탈로그 하나뿐이라
 * 그것만 노출한다.
 */
@Module({
  providers: [ProductCatalogService],
  exports: [ProductCatalogService],
})
export class ProductCatalogModule {}
