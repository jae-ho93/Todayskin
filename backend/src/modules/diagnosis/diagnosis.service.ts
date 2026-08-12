import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { notDeletedWhere } from '../../common/soft-delete/soft-delete.policy';
import { errorMessage } from '../../common/errors/error-name.util';
import { metricsFromSnapshot } from '../weather/mappers/weather-snapshot.mapper';
import {
  buildCursorPage,
  CursorPageDto,
  decodeCursor,
} from '../../common/pagination/cursor-pagination';
import {
  InferenceImage,
  InferenceImages,
  InferredPartMetric,
  INFERENCE_PROVIDER,
} from './providers/inference-provider.interface';
import type { InferenceProvider } from './providers/inference-provider.interface';
import { WeatherService } from '../weather/weather.service';
import { ConsentService } from '../consent/consent.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ConsentPurpose } from '../consent/enums/consent-purpose.enum';
import { ImageStorageService } from '../storage/image-storage.service';
import { AuditLogService } from '../admin/audit-log.service';
import { SkinScoreSnapshotDto } from './dto/skin-score-snapshot.dto';
import { HistoryEntryDto } from './dto/history-entry.dto';
import { SkinPartMetricDto } from './dto/skin-part-metric.dto';
import {
  CalendarDayHistoryDto,
  CalendarDiagnosisDto,
  CalendarImageDto,
  CalendarProductDto,
  CalendarRecommendationDto,
  CalendarWeatherDto,
  LandmarksDto,
  ScoreSeriesDto,
  ScoreSeriesPointDto,
} from './dto/calendar-history.dto';
import {
  formatKstDate,
  isValidDateParam,
  kstDayRange,
  kstDaysAgo,
  kstInclusiveRange,
  todayKst,
} from './calendar-date.util';
import { Diagnosis, DiagnosisStatus, Prisma, SkinMetric, WeatherSnapshot } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DEFAULT_PRESIGN_EXPIRES_SECONDS } from '../storage/image-storage.service';
import type { PresignedImage } from '../storage/image-storage.service';

type CalendarDiagnosisRow = Prisma.DiagnosisGetPayload<{
  include: {
    skinMetrics: true;
    weatherSnapshot: true;
    recommendations: {
      include: {
        products: {
          include: { product: true };
          orderBy: { displayOrder: 'asc' };
        };
      };
      orderBy: { createdAt: 'desc' };
    };
    image: true;
  };
}>;

/**
 * 허용 MIME 집합. 이미지 파일이 아닌 업로드를 거부한다.
 */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * 단일 파일 최대 크기(10MB). 모바일 촬영 원본을 수용하되 과도한 업로드를 막는다.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * overallScore 허용 범위. 추론 결과가 이 범위를 벗어나면 범위 검증 실패로 처리한다.
 */
const SCORE_MIN = 0;
const SCORE_MAX = 100;

/**
 * 프론트가 사용하는 6개 부위. 추론 결과가 다른 부위를 반환하면 거부한다.
 */
const ALLOWED_PARTS = new Set([
  'forehead',
  'glabella',
  'eyeArea',
  'cheek',
  'lips',
  'jaw',
]);

/**
 * DiagnosisService — 진단 도메인 비즈니스 로직.
 *
 * T9 완료 기준:
 * - multipart 필드(front) 검증: 필드 존재, MIME, 크기, 빈 파일.
 * - InferenceProvider 인터페이스를 통해 추론(Mock 구현체, 실제 AI는 보류).
 * - 추론 결과 범위 검증(overallScore 0~100, 부위 6개 일치).
 * - Diagnosis + SkinMetric을 하나의 transaction으로 저장(부분 저장 방지).
 * - modelVersion 저장.
 * - weatherSnapshotId 연결(위치 좌표가 있으면 getOrCreateSnapshot, 실패해도 진단은 진행).
 * - N3: processing 동의 필수. storage 동의 시에만 S3 저장, 미동의면 버퍼 폐기.
 * - 최신 진단/이력 조회 시 사용자 소유권 검사.
 * - 중복 요청 방지 정책: 동일 사용자의 최근 진단(예: 60초 이내)이 있으면 거부.
 *
 * 보류: 실제 Python AI 서버 호출, 실제 모델 추론, 모델 운영·배포 정책.
 */
@Injectable()
export class DiagnosisService {
  private readonly logger = new Logger(DiagnosisService.name);

  /** 동일 사용자의 최근 진단 제출 간 중복 요청 방지 윈도(초). */
  private static readonly DEDUP_WINDOW_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INFERENCE_PROVIDER) private readonly inferenceProvider: InferenceProvider,
    private readonly weatherService: WeatherService,
    private readonly consentService: ConsentService,
    private readonly imageStorage: ImageStorageService,
    private readonly idempotency: IdempotencyService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * N43: 진단 기록 한 건을 삭제한다. 얼굴에서 나온 데이터라 삭제 수단은 선택이 아니다.
   *
   * **물리 삭제다.** 탈퇴(N44)와 같은 기준을 쓴다. soft delete로 두면 진단 row를
   * 지우는 주체가 어디에도 없어(retention sweep은 세션·job·날씨만 본다) 사실상
   * "화면에서만 감추기"가 되고, "철회 시 지체 없이 파기"라는 처리방침과 어긋난다.
   *
   * 이미지를 먼저 지우는 순서가 중요하다 — 이유는 `deleteForDiagnosis` 주석 참고.
   * S3 삭제가 실패하면 예외가 올라와 진단 row는 남는다. 사용자에게는 삭제가 실패한
   * 것으로 보이고 재시도할 수 있다. 반대로 row를 먼저 지우면 사진만 남고 기록은
   * 사라져, 가장 지우고 싶었던 것이 남는다.
   */
  async deleteDiagnosis(userId: number, diagnosisId: string): Promise<void> {
    const diagnosis = await this.prisma.diagnosis.findFirst({
      where: notDeletedWhere({ id: diagnosisId }),
      select: { id: true, userId: true },
    });
    if (!diagnosis) {
      throw new NotFoundException('진단을 찾을 수 없습니다');
    }
    if (diagnosis.userId !== userId) {
      throw new ForbiddenException('해당 진단에 대한 접근 권한이 없습니다');
    }

    const imagesDeleted = await this.imageStorage.deleteForDiagnosis(userId, diagnosisId);

    await this.prisma.$transaction(async (tx) => {
      // Recommendation.diagnosisId는 SetNull이라 진단만 지우면 추천이 사용자에게
      // 그대로 남는다. 그 문장은 지운 진단을 설명하는 글이므로 같이 지운다.
      await tx.recommendation.deleteMany({ where: { diagnosisId, userId } });
      // SkinMetric·DiagnosisImage는 Cascade로 함께 사라진다.
      await tx.diagnosis.delete({ where: { id: diagnosisId } });
    });

    await this.auditLog.log({
      actorId: userId,
      action: 'diagnosis.deleted',
      targetType: 'Diagnosis',
      targetId: diagnosisId,
      result: 'success',
      metadata: { imagesDeleted },
    });
  }

  /**
   * 진단 제출: 정면 이미지 검증 → 추론 → 날씨 스냅샷 확보 → transaction 저장.
   *
   * 좌표가 없으면 WeatherService가 기본 지역을 사용한다. getOrCreateSnapshot 실패
   * 또는 UNAVAILABLE(null)이면 weatherSnapshotId를 null로 두고 진단을 완료한다
   * (환경 데이터 부재가 진단을 막지 않는다).
   * wentOutside가 false(기본값)면 그날 외부 환경 노출이 없었다는 뜻이므로 날씨 스냅샷을
   * 아예 연결하지 않는다 — 실내에만 있었는데 그 시각 날씨를 엮으면 개인 패턴 분석에 노이즈가 된다.
   * 단, InferenceProvider 실패는 진단 자체를 실패시킨다(503).
   */
  async submit(
    userId: number,
    images: InferenceImages,
    opts?: { lat?: number; lon?: number; wentOutside?: boolean },
  ): Promise<SkinScoreSnapshotDto> {
    // 0. N3: 진단 이미지 처리 동의 필수 (version registry).
    await this.consentService.requireActive(
      userId,
      ConsentPurpose.DIAGNOSIS_IMAGE_PROCESSING,
    );
    const storeImage = await this.consentService.hasActive(
      userId,
      ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE,
    );

    // 1. 업로드 파일 검증 (MIME, 크기, 빈 파일).
    this.validateImage('front', images.front);

    // 2. 중복 요청 방지 — 동일 사용자의 최근 PENDING/COMPLETED 진단이 DEDUP_WINDOW 이내면 거부.
    await this.guardDuplicate(userId);

    // 3. N14: 동시 요청 in-flight 예약 — 추론 호출 전에 unique 예약을 잡아
    //    같은 사용자의 동시 재시도가 외부 추론을 중복 호출하지 않게 한다.
    //    (성공·실패 모두 finally에서 release — 순수 in-flight 가드)
    const reservation = await this.idempotency.acquire(`diagnosis:${userId}`, userId);
    if (reservation.outcome !== 'acquired') {
      throw new ConflictException('이미 진행 중인 진단 요청이 있습니다');
    }
    try {
      return await this.runReservedSubmit(userId, images, storeImage, opts);
    } finally {
      await this.idempotency.release(`diagnosis:${userId}`);
    }
  }

  /**
   * N14 예약 획득 이후의 진단 본체 — 추론 → 결과 검증 → 날씨 → transaction 저장 → DTO.
   * 예약은 호출부(submit)의 finally에서 해제된다.
   */
  private async runReservedSubmit(
    userId: number,
    images: InferenceImages,
    storeImage: boolean,
    opts?: { lat?: number; lon?: number; wentOutside?: boolean },
  ): Promise<SkinScoreSnapshotDto> {
    // 4. 추론. Provider 실패(실제 서버 장애)는 503으로 전파.
    let inference;
    try {
      inference = await this.inferenceProvider.infer(images);
    } catch (e) {
      this.logger.warn(`Inference failed: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableException(
        '진단 추론을 수행할 수 없어요. 잠시 후 다시 시도해주세요.',
      );
    }

    // 4. 추론 결과 범위 검증.
    this.validateInference(inference.overallScore, inference.parts);

    // 5. 날씨 스냅샷 확보. wentOutside가 true일 때만 연결한다 — 실내에만 있었다면
    // 그 시각 날씨를 엮을 이유가 없다. 좌표가 없으면 WeatherService가 기본 지역으로 조회한다.
    // 실패해도 진단 자체는 진행한다.
    let weatherSnapshotId: string | null = null;
    if (opts?.wentOutside) {
      try {
        const snapshot = await this.weatherService.getOrCreateSnapshot(
          opts?.lat,
          opts?.lon,
        );
        weatherSnapshotId = snapshot?.id ?? null;
      } catch (e) {
        this.logger.warn(
          `Weather snapshot unavailable, continuing without: ${errorMessage(e)}`,
        );
      }
    }

    // 6. transaction 저장 — Diagnosis + SkinMetric을 원자적으로 기록.
    const diagnosisId = `snap-${shortId()}`;
    const capturedAt = new Date();

    const diagnosis = await this.prisma.$transaction(async (tx) => {
      // 사전 조회(guardDuplicate)와 저장 사이의 경쟁 조건을 닫는다.
      // PostgreSQL transaction advisory lock은 사용자별로 짧게 유지되고
      // transaction 종료 시 자동 해제된다.
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`todayskin:diagnosis:${userId}`}))`;
      }

      const recent = await tx.diagnosis.findFirst({
        where: this.recentDiagnosisWhere(userId),
        select: { id: true },
      });
      if (recent) {
        throw new BadRequestException(
          '최근 진단 제출이 처리 중입니다. 잠시 후 다시 시도해주세요.',
        );
      }

      const created = await tx.diagnosis.create({
        data: {
          id: diagnosisId,
          userId,
          capturedAt,
          overallScore: inference.overallScore,
          status: 'COMPLETED',
          modelVersion: inference.modelVersion,
          weatherSnapshotId,
          // N8: 저장 동의 시에만 랜드마크 보존(얼굴 기하 정보).
          // N26: 랜드마크 영속화 조건 = 저장 동의(storeImage) && 추론이 랜드마크 제공.
          // 미동의면 DB에 아예 기록하지 않는다 (N8 미노출 계약의 근거).
          landmarks:
            storeImage && inference.landmarks
              ? (inference.landmarks as unknown as Prisma.InputJsonValue)
              : undefined,
          // 신규(검증 단계): YOLO 여드름 구역 리포트 + 5클래스 질환 분류.
          // 얼굴 이미지 자체가 아니라 파생 텍스트/라벨이라 랜드마크와 달리 저장 동의와
          // 무관하게 항상 보존한다.
          acneReport: inference.acneReport ?? undefined,
          diseaseClassification: inference.diseaseClassification
            ? (inference.diseaseClassification as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });

      // SkinMetric은 부위별로 하나씩. unique(diagnosisId, part) 제약이 중복을 막는다.
      await tx.skinMetric.createMany({
        data: inference.parts.map((p) => ({
          diagnosisId,
          part: p.part,
          label: p.label,
          grade: p.grade,
          moisture: p.moisture,
          elasticity: p.elasticity,
          note: p.note,
        })),
      });

      return created;
    });

    // 7. N3: 저장 동의가 있으면 S3(또는 개발용 memory)에 암호화 저장.
    // 미동의면 원본을 디스크/객체저장소에 쓰지 않고 버퍼만 GC 대상으로 둔다.
    let thumbnailUri: string | null = diagnosis.thumbnailUri ?? null;
    if (storeImage) {
      try {
        const stored = await this.imageStorage.storeDiagnosisImage({
          userId,
          diagnosisId: diagnosis.id,
          image: images.front,
        });
        thumbnailUri = stored.uri;
      } catch (e) {
        this.logger.warn(
          `이미지 저장 실패(진단은 유지): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // parts는 transaction 밖에서 다시 조회하지 않고 inference 결과를 그대로 매핑한다.
    // 원본 이미지 버퍼는 더 이상 참조하지 않아 GC 대상이 된다.
    const dto = this.toSnapshotDto(
      { ...diagnosis, thumbnailUri },
      inference.parts,
    );
    return dto;
  }

  /**
   * 최신 진단 조회. 사용자 소유권은 userId 필터로 자연스럽게 보장된다.
   * 진단이 없으면 404(기존 FastAPI 계약 유지).
   */
  async getLatest(userId: number): Promise<SkinScoreSnapshotDto> {
    const diagnosis = await this.prisma.diagnosis.findFirst({
      where: notDeletedWhere({ userId }),
      orderBy: { capturedAt: 'desc' },
      include: { skinMetrics: true },
    });
    if (!diagnosis) {
      throw new NotFoundException('아직 촬영한 기록이 없습니다');
    }
    return this.toSnapshotDtoFromDb(diagnosis, diagnosis.skinMetrics);
  }

  /**
   * 진단 이력 조회. 사용자별 최신순.
   */
  async getHistory(
    userId: number,
    opts?: { limit?: number; cursor?: string },
  ): Promise<HistoryEntryDto[] | CursorPageDto<HistoryEntryDto>> {
    const decoded = decodeCursor(opts?.cursor);
    const where: Record<string, unknown> = notDeletedWhere({ userId });
    if (decoded) {
      const at = decoded.at ? new Date(decoded.at) : null;
      where.OR = at
        ? [
            { capturedAt: { lt: at } },
            { capturedAt: at, id: { lt: decoded.id } },
          ]
        : [{ id: { lt: decoded.id } }];
    }

    const take = opts?.limit;
    const diagnoses = await this.prisma.diagnosis.findMany({
      where,
      orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
      take: take ? take + 1 : undefined,
    });
    const items = diagnoses.map((d) => ({
      id: d.id,
      capturedAt: d.capturedAt.toISOString(),
      overallScore: d.overallScore,
      thumbnailUri: d.thumbnailUri,
    }));
    if (!take) return items;
    return buildCursorPage(items, take, (row) => row.capturedAt);
  }

  /**
   * 진단 상세 + 부위 측정값 조회. 추천 생성(diagnosisId 기반)에서 사용.
   * 소유권 검사를 포함한다.
   */
  async getDiagnosisWithMetrics(userId: number, diagnosisId: string): Promise<{
    diagnosis: Diagnosis;
    metrics: SkinMetric[];
  }> {
    const diagnosis = await this.prisma.diagnosis.findFirst({
      where: notDeletedWhere({ id: diagnosisId }),
      include: { skinMetrics: true },
    });
    if (!diagnosis) {
      throw new NotFoundException('진단을 찾을 수 없습니다');
    }
    if (diagnosis.userId !== userId) {
      throw new ForbiddenException('해당 진단에 대한 접근 권한이 없습니다');
    }
    return { diagnosis, metrics: diagnosis.skinMetrics };
  }

  /**
   * N8: 특정 날짜(Asia/Seoul)의 통합 히스토리.
   * 날씨·부위 점수·추천 제품 + (저장 동의 시) 이미지 presigned URL·랜드마크.
   */
  async getHistoryByDate(
    userId: number,
    date: string,
  ): Promise<CalendarDayHistoryDto> {
    if (!isValidDateParam(date)) {
      throw new BadRequestException('date는 YYYY-MM-DD 형식이어야 합니다');
    }

    const { start, endExclusive } = kstDayRange(date);
    const canViewMedia = await this.consentService.hasActive(
      userId,
      ConsentPurpose.DIAGNOSIS_IMAGE_STORAGE,
    );

    const diagnoses = await this.prisma.diagnosis.findMany({
      where: notDeletedWhere({
        userId,
        capturedAt: { gte: start, lt: endExclusive },
        status: DiagnosisStatus.COMPLETED,
      }),
      orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
      include: {
        skinMetrics: true,
        weatherSnapshot: true,
        recommendations: {
          include: {
            products: {
              include: { product: true },
              orderBy: { displayOrder: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        image: true,
      },
    });

    // R20: 노출 대상 이미지를 한 번에 서명한다. 이전에는 진단마다 presign 헬퍼가
    // 같은 DiagnosisImage row를 다시 조회했다(위 include로 이미 갖고 있는 데이터).
    const signedByDiagnosisId = canViewMedia
      ? await this.presignCalendarImages(diagnoses)
      : new Map<string, PresignedImage>();

    const items = diagnoses.map((diagnosis) =>
      this.toCalendarDiagnosisDto(
        diagnosis,
        canViewMedia,
        signedByDiagnosisId.get(diagnosis.id) ?? null,
      ),
    );

    const dto = new CalendarDayHistoryDto();
    dto.date = date;
    dto.diagnoses = items;
    return dto;
  }

  /**
   * N8: overallScore 시계열 (기간별 추이).
   * 기본 기간: 최근 90일(Asia/Seoul).
   */
  async getScoreSeries(
    userId: number,
    opts?: { from?: string; to?: string },
  ): Promise<ScoreSeriesDto> {
    const to = opts?.to ?? todayKst();
    const from = opts?.from ?? kstDaysAgo(90, to);

    if (!isValidDateParam(from) || !isValidDateParam(to)) {
      throw new BadRequestException('from/to는 YYYY-MM-DD 형식이어야 합니다');
    }
    if (from > to) {
      throw new BadRequestException('from은 to보다 이후일 수 없습니다');
    }

    const { start, endExclusive } = kstInclusiveRange(from, to);
    const rows = await this.prisma.diagnosis.findMany({
      where: notDeletedWhere({
        userId,
        status: DiagnosisStatus.COMPLETED,
        capturedAt: { gte: start, lt: endExclusive },
      }),
      orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        capturedAt: true,
        overallScore: true,
      },
    });

    const dto = new ScoreSeriesDto();
    dto.from = from;
    dto.to = to;
    dto.points = rows.map((r) => {
      const point = new ScoreSeriesPointDto();
      point.date = formatKstDate(r.capturedAt);
      point.diagnosisId = r.id;
      point.capturedAt = r.capturedAt.toISOString();
      point.overallScore = r.overallScore;
      return point;
    });
    return dto;
  }

  // ── 검증 헬퍼 ──────────────────────────────────

  /**
   * 단일 업로드 이미지 검증.
   * - 빈 파일(size 0 / 버퍼 길이 0) 거부.
   * - MIME 허용 집합 외 거부.
   * - 최대 크기 초과 거부.
   */
  private validateImage(field: string, img: InferenceImage): void {
    if (!img || !img.buffer || img.buffer.length === 0 || img.size === 0) {
      throw new BadRequestException(`${field} 이미지가 비어 있거나 누락되었습니다`);
    }
    if (!ALLOWED_MIME.has(img.mimetype)) {
      throw new BadRequestException(
        `${field} 이미지 형식이 지원되지 않습니다 (jpeg, png, webp만 가능)`,
      );
    }
    if (img.size > MAX_FILE_BYTES || img.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException(
        `${field} 이미지가 너무 큽니다 (최대 10MB)`,
      );
    }
    if (img.size !== img.buffer.length) {
      throw new BadRequestException(`${field} 이미지 크기 정보가 올바르지 않습니다`);
    }
    if (!hasImageSignature(img.buffer, img.mimetype)) {
      throw new BadRequestException(`${field} 이미지 내용이 MIME 형식과 일치하지 않습니다`);
    }
  }

  /**
   * 추론 결과 범위 검증.
   * - overallScore: 0~100.
   * - parts: 6개이며 허용 부위 집합과 정확히 일치(중복/누락/과잉 금지).
   */
  private validateInference(overallScore: number, parts: InferredPartMetric[]): void {
    if (
      typeof overallScore !== 'number' ||
      Number.isNaN(overallScore) ||
      overallScore < SCORE_MIN ||
      overallScore > SCORE_MAX
    ) {
      throw new BadRequestException('추론 결과 점수가 유효 범위를 벗어났습니다');
    }
    if (!Array.isArray(parts) || parts.length !== 6) {
      throw new BadRequestException('추론 결과 부위 개수가 올바르지 않습니다');
    }
    const seen = new Set<string>();
    for (const p of parts) {
      if (!p || typeof p.part !== 'string' || !ALLOWED_PARTS.has(p.part)) {
        throw new BadRequestException(`알 수 없는 부위: ${p?.part}`);
      }
      if (seen.has(p.part)) {
        throw new BadRequestException(`중복 부위: ${p.part}`);
      }
      seen.add(p.part);
      if (typeof p.grade !== 'string' || p.grade.length === 0) {
        throw new BadRequestException(`${p.part} 등급이 비어 있습니다`);
      }
      if (typeof p.label !== 'string' || p.label.length === 0) {
        throw new BadRequestException(`${p.part} 라벨이 비어 있습니다`);
      }
    }
  }

  /**
   * 중복 요청 방지 — 동일 사용자가 DEDUP_WINDOW 이내에 진단을 제출했는지 확인.
   *
   * R35: 정본은 트랜잭션 안의 같은 검사(advisory lock 아래)다. 이 사전 검사는
   * 경쟁 조건을 막기 위한 게 아니라 **추론 호출 앞에서 빠르게 실패**하기 위한 것이다.
   * 이걸 빼면 60초 안의 재제출이 비싼 추론을 끝까지 돌린 뒤에야 거부된다.
   * in-flight 예약(idempotency)은 동시 요청만 막고, 앞 요청이 끝난 뒤의 재제출은
   * 이 창(window)만 막는다.
   */
  private async guardDuplicate(userId: number): Promise<void> {
    const recent = await this.prisma.diagnosis.findFirst({
      where: this.recentDiagnosisWhere(userId),
      select: { id: true },
    });
    if (recent) {
      throw new BadRequestException(
        '최근 진단 제출이 처리 중입니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  /**
   * 중복 판정 대상 조건 — 사전 검사와 트랜잭션 검사가 같은 기준을 쓰도록 한 곳에 둔다.
   *
   * R35: 삭제된 진단은 제외한다. 사용자가 진단을 지우고 다시 찍는 흐름이 이유 없이
   * 막히지 않게 하기 위해서이고, 이 파일의 다른 조회들과도 규칙이 같아진다.
   */
  private recentDiagnosisWhere(userId: number): Prisma.DiagnosisWhereInput {
    return notDeletedWhere({
      userId,
      createdAt: {
        gte: new Date(Date.now() - DiagnosisService.DEDUP_WINDOW_SECONDS * 1000),
      },
    });
  }

  // ── 매핑 헬퍼 ──────────────────────────────────

  private toSnapshotDto(diagnosis: Diagnosis, parts: InferredPartMetric[]): SkinScoreSnapshotDto {
    const dto = new SkinScoreSnapshotDto();
    dto.id = diagnosis.id;
    dto.capturedAt = diagnosis.capturedAt.toISOString();
    dto.overallScore = diagnosis.overallScore;
    // BE-2026-08-12: 저장된 논리 URI(memory://)는 RN Image가 로드 가능한 http로 정규화
    dto.thumbnailUri = this.toPublicThumbnailUri(diagnosis.thumbnailUri);
    dto.parts = parts.map((p) => this.partToDto(p));
    dto.acneReport = diagnosis.acneReport ?? null;
    dto.diseaseClassification = this.toDiseaseClassificationDto(diagnosis.diseaseClassification);
    return dto;
  }

  private toSnapshotDtoFromDb(diagnosis: Diagnosis, metrics: SkinMetric[]): SkinScoreSnapshotDto {
    const dto = new SkinScoreSnapshotDto();
    dto.id = diagnosis.id;
    dto.capturedAt = diagnosis.capturedAt.toISOString();
    dto.overallScore = diagnosis.overallScore;
    dto.thumbnailUri = this.toPublicThumbnailUri(diagnosis.thumbnailUri);
    dto.parts = metrics.map((m) => this.metricToDto(m));
    dto.acneReport = diagnosis.acneReport ?? null;
    dto.diseaseClassification = this.toDiseaseClassificationDto(diagnosis.diseaseClassification);
    return dto;
  }

  private toDiseaseClassificationDto(
    raw: Prisma.JsonValue | null,
  ): SkinScoreSnapshotDto['diseaseClassification'] {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const obj = raw as { label?: unknown; confidence?: unknown };
    if (typeof obj.label !== 'string' || typeof obj.confidence !== 'number') return null;
    return { label: obj.label, confidence: obj.confidence };
  }

  /** BE-2026-08-12: 레거시 DB의 memory:// 논리 URI까지 http로 정규화해 내보낸다. */
  private toPublicThumbnailUri(uri: string | null): string | null {
    return uri ? this.imageStorage.toPublicUrl(uri) : null;
  }

  private partToDto(p: InferredPartMetric): SkinPartMetricDto {
    const dto = new SkinPartMetricDto();
    dto.part = p.part;
    dto.label = p.label;
    dto.grade = p.grade;
    dto.moisture = p.moisture;
    dto.elasticity = p.elasticity;
    dto.note = p.note;
    return dto;
  }

  private metricToDto(m: SkinMetric): SkinPartMetricDto {
    const dto = new SkinPartMetricDto();
    dto.part = m.part;
    dto.label = m.label;
    dto.grade = m.grade;
    dto.moisture = m.moisture;
    dto.elasticity = m.elasticity;
    dto.note = m.note;
    return dto;
  }

  /**
   * R20: 저장 동의가 있는 요청에서 노출 가능한 이미지만 모아 한 번에 서명한다.
   * 서명 실패는 항목별 null로 남고(기존 동작), 나머지 항목은 그대로 응답한다.
   */
  private async presignCalendarImages(
    diagnoses: CalendarDiagnosisRow[],
  ): Promise<Map<string, PresignedImage>> {
    const visible = diagnoses.filter(
      (d): d is CalendarDiagnosisRow & { image: NonNullable<CalendarDiagnosisRow['image']> } =>
        d.image != null && d.image.deletedAt == null,
    );
    if (visible.length === 0) return new Map();

    const signed = await this.imageStorage.presignImages(
      visible.map((d) => d.image),
      DEFAULT_PRESIGN_EXPIRES_SECONDS,
    );

    const byId = new Map<string, PresignedImage>();
    visible.forEach((d, i) => {
      const s = signed[i];
      if (s) byId.set(d.id, s);
    });
    return byId;
  }

  private toCalendarDiagnosisDto(
    d: CalendarDiagnosisRow,
    canViewMedia: boolean,
    signedImage: PresignedImage | null,
  ): CalendarDiagnosisDto {
    const dto = new CalendarDiagnosisDto();
    dto.id = d.id;
    dto.capturedAt = d.capturedAt.toISOString();
    dto.overallScore = d.overallScore;
    dto.status = d.status;
    dto.modelVersion = d.modelVersion;
    dto.parts = d.skinMetrics.map((m) => this.metricToDto(m));
    dto.weather = d.weatherSnapshot
      ? this.toCalendarWeatherDto(d.weatherSnapshot)
      : null;
    dto.recommendations = d.recommendations.map((r) =>
      this.toCalendarRecommendationDto(r),
    );

    if (canViewMedia) {
      const hasImage = d.image != null && d.image.deletedAt == null;
      if (hasImage) {
        dto.image = signedImage ? this.toCalendarImageDto(signedImage) : null;
        // N26: 랜드마크(얼굴 기하 정보)는 저장된 이미지와 함께만 노출한다.
        // 이미지가 없으면(저장 실패·soft delete·철회 잔재) landmarks도 노출하지 않는다.
        // 저장 동의 계약(diagnosis_image_storage)과 영속화·노출 조건을 일치시킨다.
        // 노출 기준은 이미지 row 존재(hasImage)다 — presigned URL 생성 실패(일시적 스토리지
        // 장애)로 dto.image가 null이어도 row가 있으면 landmarks는 노출한다(의도된 트레이드오프).
        dto.landmarks = this.toLandmarksDto(d.landmarks);
      } else {
        // 이미지 없음 → image/landmarks 모두 미노출.
        dto.image = null;
        dto.landmarks = null;
      }
    } else {
      dto.image = null;
      dto.landmarks = null;
    }

    return dto;
  }

  private toCalendarWeatherDto(w: WeatherSnapshot): CalendarWeatherDto {
    const dto = new CalendarWeatherDto();
    dto.observedAt = w.observedAt.toISOString();
    dto.regionName = w.regionName;
    dto.districtName = w.districtName ?? null;
    dto.source = w.source;
    // N42/F70: 화면이 "값 없음"과 "수집 실패"를 구별하려면 이유가 함께 내려가야 한다.
    dto.uvCollectionFailed = w.uvCollectionFailed;
    dto.airCollectionFailed = w.airCollectionFailed;
    // R22: 지표 16개 복사는 공용 매퍼가 한다.
    return Object.assign(dto, metricsFromSnapshot(w));
  }

  private toCalendarRecommendationDto(r: {
    id: string;
    title: string;
    grade: string;
    sourceLabel: string;
    explanation: string;
    observationalNote: string | null;
    ingredientTags: string[];
    timing: string | null;
    products: Array<{
      product: {
        id: string;
        name: string;
        brand: string;
        imageUri: string | null;
        purchaseUrl: string | null;
        category: string;
        reason: string | null;
        timing: string | null;
      };
    }>;
  }): CalendarRecommendationDto {
    const dto = new CalendarRecommendationDto();
    dto.id = r.id;
    dto.title = r.title;
    dto.grade = r.grade;
    dto.sourceLabel = r.sourceLabel;
    dto.explanation = r.explanation;
    dto.observationalNote = r.observationalNote;
    dto.ingredientTags = r.ingredientTags;
    dto.timing = r.timing;
    dto.products = r.products.map((rp) => {
      const p = new CalendarProductDto();
      p.id = rp.product.id;
      p.name = rp.product.name;
      p.brand = rp.product.brand;
      p.imageUri = rp.product.imageUri;
      p.purchaseUrl = rp.product.purchaseUrl;
      p.category = rp.product.category;
      p.reason = rp.product.reason;
      p.timing = rp.product.timing;
      return p;
    });
    return dto;
  }

  private toCalendarImageDto(signed: {
    url: string;
    contentType: string;
    expiresAt: string;
  }): CalendarImageDto {
    const dto = new CalendarImageDto();
    dto.url = signed.url;
    dto.contentType = signed.contentType;
    dto.expiresAt = signed.expiresAt;
    return dto;
  }

  private toLandmarksDto(raw: Prisma.JsonValue | null): LandmarksDto | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const obj = raw as { version?: unknown; points?: unknown };
    if (typeof obj.version !== 'string' || !Array.isArray(obj.points)) {
      return null;
    }
    const points: number[][] = [];
    for (const p of obj.points) {
      if (!Array.isArray(p) || p.length < 2) continue;
      const x = Number(p[0]);
      const y = Number(p[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push([x, y]);
    }
    if (points.length === 0) return null;
    const dto = new LandmarksDto();
    dto.version = obj.version;
    dto.points = points;
    return dto;
  }
}

function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 20);
}

function hasImageSignature(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimetype === 'image/webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}