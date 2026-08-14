import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobHandlerRegistry } from '../jobs/handlers/job-handler.registry';
import { optionalNumber, optionalString, toJobError } from '../jobs/handlers/job-error';
import { JobType } from '../jobs/enums/job-type.enum';
import { CareService } from './care.service';
import { CARE_TYPES, CarePlanDto, CareType } from './dto/care-plan.dto';

/** routine 그대로 넘겨받은 job payload 필드 — 있으면 CareService가 products만 재생성한다. */
function optionalRoutine(payload: Record<string, unknown>): CarePlanDto['routine'] | undefined {
  const value = payload.routineOverride;
  return Array.isArray(value) ? (value as CarePlanDto['routine']) : undefined;
}

function requireCareType(payload: Record<string, unknown>): CareType {
  const value = payload.careType;
  if (typeof value !== 'string' || !(CARE_TYPES as readonly string[]).includes(value)) {
    throw new Error('잡 payload의 careType이 유효하지 않습니다');
  }
  return value as CareType;
}

function requireCareKey(payload: Record<string, unknown>): string {
  const value = payload.careKey;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('잡 payload의 careKey가 없습니다');
  }
  return value;
}

/**
 * 케어 루틴+제품 LIVE 생성 잡 핸들러. 완료 결과 `{ plan, source: 'LIVE' }`는
 * fast-path의 FALLBACK/CACHED 응답을 교체한다 (ProductJobHandler와 동일 패턴).
 */
@Injectable()
export class CareJobHandler implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly care: CareService,
  ) {}

  onModuleInit(): void {
    this.registry.register(JobType.CARE_GENERATE, async (_jobId, userId, payload) => {
      try {
        const careType = requireCareType(payload);
        const careKey = requireCareKey(payload);
        const plan = await this.care.generateLive(userId, careType, {
          careKey,
          careType,
          diagnosisId: optionalString(payload, 'diagnosisId'),
          lat: optionalNumber(payload, 'lat'),
          lon: optionalNumber(payload, 'lon'),
          routineOverride: optionalRoutine(payload),
          medicalDisclaimerOverride: optionalString(payload, 'medicalDisclaimerOverride') ?? null,
        });
        return { plan, source: 'LIVE' };
      } catch (e) {
        throw toJobError(e);
      }
    });
  }
}
