import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { RecommendationService } from '../../recommendations/recommendation.service';
import { ProductService } from '../../products/product.service';
import { PatternService } from '../../pattern/pattern.service';
import { NotificationService } from '../../notifications/notification.service';
import { JobHandlerRegistry } from './job-handler.registry';
import { JobType } from '../enums/job-type.enum';

/**
 * 도메인 서비스를 JobType 핸들러로 등록한다.
 * HttpException은 job FAILED 메시지로 변환한다.
 */
@Injectable()
export class DomainJobHandlers implements OnModuleInit {
  private readonly logger = new Logger(DomainJobHandlers.name);

  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly recommendationService: RecommendationService,
    private readonly productService: ProductService,
    private readonly patternService: PatternService,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      JobType.RECOMMENDATION_GENERATE,
      async (_jobId, userId, payload) => {
        try {
          const items = await this.recommendationService.generate(userId, {
            diagnosisId: payload.diagnosisId as string | undefined,
            skinScore: payload.skinScore as Record<string, unknown> | undefined,
            weather: payload.weather as object | undefined,
          });
          return { recommendations: items };
        } catch (e) {
          throw toJobError(e);
        }
      },
    );

    // N31/N29: 날씨 기반 제품 LIVE 생성 — FALLBACK/CACHED 응답의 교체 결과를 생산한다.
    // 완료 시 { products }를 job result로 저장하고, ProductService가 Redis SWR에도 캐시한다.
    this.registry.register(
      JobType.WEATHER_PRODUCTS_GENERATE,
      async (_jobId, _userId, payload) => {
        try {
          const products = await this.productService.generateWeatherBased({
            lat: payload.lat as number | undefined,
            lon: payload.lon as number | undefined,
          });
          return { products, source: 'LIVE' };
        } catch (e) {
          throw toJobError(e);
        }
      },
    );

    this.registry.register(
      JobType.PATTERN_ANALYZE,
      async (_jobId, userId) => {
        try {
          const summary = await this.patternService.getPattern(userId);
          return { pattern: summary };
        } catch (e) {
          throw toJobError(e);
        }
      },
    );

    this.registry.register(
      JobType.NOTIFICATION_SEND,
      async (_jobId, userId, payload) => {
        try {
          const kind = String(payload.kind ?? '');
          const result = await this.notificationService.send(userId, kind, {
            title: payload.title as string | undefined,
            body: payload.body as string | undefined,
          });
          return { notification: result };
        } catch (e) {
          throw toJobError(e);
        }
      },
    );

    this.logger.log('Domain job handlers registered');
  }
}

function toJobError(e: unknown): Error {
  if (e instanceof HttpException) {
    const res = e.getResponse();
    const message =
      typeof res === 'string'
        ? res
        : typeof res === 'object' && res !== null && 'message' in res
          ? Array.isArray((res as { message: unknown }).message)
            ? (res as { message: string[] }).message.join(', ')
            : String((res as { message: unknown }).message)
          : e.message;
    return new Error(message);
  }
  if (e instanceof Error) return e;
  return new Error(String(e));
}
