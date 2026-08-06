import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * JWT key rotation(kid) 서비스.
 *
 * N2: 현재 단일 secret에서 kid 기반 rotation으로 확장.
 * - DB JwtKeyRotation 테이블에 active 키를 둔다.
 * - DB에 active 키가 없으면 환경변수(JWT_ACCESS_SECRET/JWT_REFRESH_SECRET)를
 *   기본 kid("v1")로 자동 등록해 기존 동작을 유지한다.
 * - verify 시 token의 kid 헤더를 읽어 해당 secret으로 검증한다.
 * - rotate()로 새 kid를 active로 올리고 기존 키는 비활성(verify 전용)으로 둔다.
 *
 * 운영 운용: 새 secret을 DB에 active로 등록하면 신규 토큰은 새 키로 서명되고,
 * 기존 토큰은 만료될 때까지 기존 키로 검증된다.
 */
@Injectable()
export class JwtKeyService {
  private readonly logger = new Logger(JwtKeyService.name);
  private cache: Map<
    string,
    { secret: string; purpose: string; active: boolean }
  > | null = null;
  private cacheAt = 0;
  private readonly cacheTtlMs = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 현재 active 서명 키(kid + secret)를 반환한다.
   * DB에 없으면 환경변수 기반 기본 키를 자동 등록한다.
   */
  async getSigningKey(purpose: 'access' | 'refresh'): Promise<{
    kid: string;
    secret: string;
  }> {
    await this.ensureDefaultKey(purpose);
    const keys = await this.loadKeys();
    const active = keys.find((k) => k.purpose === purpose && k.active === true);
    if (!active) {
      throw new Error(`활성 JWT ${purpose} 키가 없습니다`);
    }
    return { kid: active.kid, secret: active.secret };
  }

  /**
   * 특정 kid의 검증용 secret을 반환한다.
   * 서명은 active 키로, 검증은 kid 헤더에 맞는 키로 수행한다.
   */
  async getVerifyKey(
    kid: string,
    purpose: 'access' | 'refresh',
  ): Promise<string | null> {
    const keys = await this.loadKeys();
    const key = keys.find((k) => k.kid === kid && k.purpose === purpose);
    return key ? key.secret : null;
  }

  /**
   * 새 키를 active로 등록하고 기존 active 키를 비활성화한다.
   * 운영자가 호출하는 rotation API에서 사용한다.
   */
  async rotate(
    kid: string,
    secret: string,
    purpose: 'access' | 'refresh',
 ): Promise<void> {
    // Prisma 7: 콜백 형식 $transaction으로 원자성 보장.
    await this.prisma.$transaction(async (tx) => {
      await tx.jwtKeyRotation.updateMany({
        where: { purpose, active: true },
        data: { active: false },
      });
      await tx.jwtKeyRotation.create({
        data: { kid, secret, purpose, active: true },
      });
    });
   this.invalidateCache();
   this.logger.log(`JWT ${purpose} 키 회전: kid=${kid}`);
  }

  /**
   * DB에 해당 purpose 키가 없으면 환경변수 기반 기본 키(v1)를 등록한다.
   * 기존 단일 secret 환경과의 호환성 유지.
   */
  private async ensureDefaultKey(purpose: 'access' | 'refresh'): Promise<void> {
    const envVar =
      purpose === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET';
    const secret = this.config.get<string>(envVar);
    if (!secret) return;

    // kid는 unique 제약이 있으므로 purpose별로 분리한다.
    const kid = `v1-${purpose}`;
    const existing = await this.prisma.jwtKeyRotation.findFirst({
      where: { purpose, kid },
    });
    if (existing) return;

    // 동시에 여러 요청이 ensureDefaultKey를 통과할 수 있으므로,
    // create 중 P2002(중복 kid)는 이미 등록된 것으로 간주하고 무시한다.
    try {
      await this.prisma.jwtKeyRotation.create({
        data: { kid, secret, purpose, active: true },
      });
      this.invalidateCache();
      this.logger.log(`JWT ${purpose} 기본 키(${kid}) 자동 등록`);
    } catch (e) {
      if (this.prismaErrorCode(e) === 'P2002') {
        // 이미 등록됨 — 무시.
        return;
      }
      throw e;
    }
  }

  private async loadKeys(): Promise<
    { kid: string; secret: string; purpose: string; active: boolean }[]
  > {
    const now = Date.now();
    if (this.cache && now - this.cacheAt < this.cacheTtlMs) {
      return Array.from(this.cache.entries()).map(([kid, v]) => ({
        kid,
        secret: v.secret,
        purpose: v.purpose,
        active: v.active,
      }));
    }
    const rows = await this.prisma.jwtKeyRotation.findMany();
    this.cache = new Map(
      rows.map((r) => [
        r.kid,
        { secret: r.secret, purpose: r.purpose, active: r.active },
      ]),
    );
    this.cacheAt = now;
    return rows.map((r) => ({
      kid: r.kid,
      secret: r.secret,
      purpose: r.purpose,
      active: r.active,
    }));
  }

  invalidateCache(): void {
    this.cache = null;
    this.cacheAt = 0;
  }

  private prismaErrorCode(exception: unknown): string | undefined {
    if (!exception || typeof exception !== 'object') return undefined;
    const code = (exception as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
}
