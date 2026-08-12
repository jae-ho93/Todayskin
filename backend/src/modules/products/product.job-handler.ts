import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobHandlerRegistry } from '../jobs/handlers/job-handler.registry';
import { optionalNumber, toJobError } from '../jobs/handlers/job-error';
import { JobType } from '../jobs/enums/job-type.enum';
import { ProductService } from './product.service';

/**
 * R12: 날씨 기반 제품 LIVE 생성 잡 핸들러(N31/N29).
 * 완료 결과 `{ products, source }`는 fast-path의 FALLBACK/CACHED 응답을 교체한다.
 */
@Injectable()
export class ProductJobHandler implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly products: ProductService,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      JobType.WEATHER_PRODUCTS_GENERATE,
      async (_jobId, _userId, payload) => {
        try {
          const products = await this.products.generateWeatherBased({
            lat: optionalNumber(payload, 'lat'),
            lon: optionalNumber(payload, 'lon'),
          });
          return { products, source: 'LIVE' };
        } catch (e) {
          throw toJobError(e);
        }
      },
    );
  }
}
