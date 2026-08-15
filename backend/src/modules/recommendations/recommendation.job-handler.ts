import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobHandlerRegistry } from '../jobs/handlers/job-handler.registry';
import {
  requiredString,
  toJobError,
} from '../jobs/handlers/job-error';
import { JobType } from '../jobs/enums/job-type.enum';
import { RecommendationService } from './recommendation.service';

/**
 * R12: 추천 생성 잡 핸들러.
 *
 * 이전에는 `jobs` 모듈이 도메인 서비스 4개를 주입받아(`DomainJobHandlers`) 인프라가
 * 도메인을 아는 역방향 의존이 생겼고, 잡 타입이 늘 때마다 `forwardRef`가 하나씩
 * 붙었다. 이제 각 도메인이 자기 핸들러를 등록하므로 의존은 도메인 → jobs 한 방향이다.
 */
@Injectable()
export class RecommendationJobHandler implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly recommendations: RecommendationService,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      JobType.RECOMMENDATION_GENERATE,
      async (_jobId, userId, payload) => {
        try {
          const items = await this.recommendations.generate(userId, {
            diagnosisId: requiredString(payload, 'diagnosisId'),
          });
          return { recommendations: items };
        } catch (e) {
          throw toJobError(e);
        }
      },
    );
  }
}
