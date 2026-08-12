import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { maskMetadataDeep } from '../../common/logging/redact.logger';

/**
 * 감사 로그 서비스.
 *
 * N1 구조화 로깅(JSON)과 별개로 DB에 영구 보존하는 보안 감사 이력.
 * ADMIN role policy: ADMIN endpoint 만들 때 @Roles(Role.ADMIN) + 감사 로그.
 *
 * 응답 본문·secret은 저장하지 않고 행위 종류·대상·결과·메타만 저장한다.
 * N48: metadata는 저장 직전에 재귀 마스킹을 강제한다 — 호출자가 실수로
 * 전화번호·토큰을 넣어도 감사 테이블에 평문으로 남지 않는다 (Pino 로그와 동일 규칙).
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorId: number | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    result?: 'success' | 'failure';
    metadata?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: params.actorId,
          action: params.action,
          targetType: params.targetType ?? null,
          targetId: params.targetId ? String(params.targetId) : null,
          result: params.result ?? 'success',
          // N48: 호출자 주석 규율에 의존하지 않고 서비스가 마스킹을 보장한다.
          metadata: params.metadata
            ? (maskMetadataDeep(params.metadata) as never)
            : undefined,
          ipAddress: params.ipAddress ?? null,
        },
      });
    } catch (e) {
      // 감사 로그 실패가 비즈니스 요청을 실패시키지 않도록 로깅만 남긴다.
      this.logger.error(
        `감사 로그 기록 실패 action=${params.action}: ${(e as Error).message}`,
      );
    }
  }
}
