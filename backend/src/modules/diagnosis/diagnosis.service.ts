import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InferenceImage,
  InferenceImages,
  InferredPartMetric,
  INFERENCE_PROVIDER,
} from './providers/inference-provider.interface';
import type { InferenceProvider } from './providers/inference-provider.interface';
import { WeatherService } from '../weather/weather.service';
import { ConsentService } from '../consent/consent.service';
import { ConsentPurpose } from '../consent/enums/consent-purpose.enum';
import { ImageStorageService } from '../storage/image-storage.service';
import { SkinScoreSnapshotDto } from './dto/skin-score-snapshot.dto';
import { HistoryEntryDto } from './dto/history-entry.dto';
import { SkinPartMetricDto } from './dto/skin-part-metric.dto';
import { Diagnosis, SkinMetric } from '@prisma/client';
import { randomUUID } from 'node:crypto';

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
  ) {}

  /**
   * 진단 제출: 정면 이미지 검증 → 추론 → 날씨 스냅샷 확보 → transaction 저장.
   *
   * 좌표가 없으면 WeatherService가 기본 지역을 사용한다. getOrCreateSnapshot 실패
   * 또는 UNAVAILABLE(null)이면 weatherSnapshotId를 null로 두고 진단을 완료한다
   * (환경 데이터 부재가 진단을 막지 않는다).
   * 단, InferenceProvider 실패는 진단 자체를 실패시킨다(503).
   */
  async submit(
    userId: number,
    images: InferenceImages,
    opts?: { lat?: number; lon?: number },
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

    // 3. 추론. Provider 실패(실제 서버 장애)는 503으로 전파.
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

    // 5. 날씨 스냅샷 확보. 좌표가 없으면 WeatherService가 기본 지역으로 조회한다.
    // 실패해도 진단 자체는 진행한다.
    let weatherSnapshotId: string | null = null;
    try {
      const snapshot = await this.weatherService.getOrCreateSnapshot(
        opts?.lat,
        opts?.lon,
      );
      weatherSnapshotId = snapshot?.id ?? null;
    } catch (e) {
      this.logger.warn(`Weather snapshot unavailable, continuing without: ${errorName(e)}`);
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
        where: {
          userId,
          createdAt: {
            gte: new Date(
              Date.now() - DiagnosisService.DEDUP_WINDOW_SECONDS * 1000,
            ),
          },
        },
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
      where: { userId },
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
  async getHistory(userId: number): Promise<HistoryEntryDto[]> {
    const diagnoses = await this.prisma.diagnosis.findMany({
      where: { userId },
      orderBy: { capturedAt: 'desc' },
    });
    return diagnoses.map((d) => ({
      id: d.id,
      capturedAt: d.capturedAt.toISOString(),
      overallScore: d.overallScore,
      thumbnailUri: d.thumbnailUri,
    }));
  }

  /**
   * 진단 상세 + 부위 측정값 조회. 추천 생성(diagnosisId 기반)에서 사용.
   * 소유권 검사를 포함한다.
   */
  async getDiagnosisWithMetrics(userId: number, diagnosisId: string): Promise<{
    diagnosis: Diagnosis;
    metrics: SkinMetric[];
  }> {
    const diagnosis = await this.prisma.diagnosis.findUnique({
      where: { id: diagnosisId },
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
   * 빠른 연속 터치/재시도로 인한 중복 진단 row 생성을 막는다.
   */
  private async guardDuplicate(userId: number): Promise<void> {
    const since = new Date(Date.now() - DiagnosisService.DEDUP_WINDOW_SECONDS * 1000);
    const recent = await this.prisma.diagnosis.findFirst({
      where: {
        userId,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) {
      throw new BadRequestException(
        '최근 진단 제출이 처리 중입니다. 잠시 후 다시 시도해주세요.',
      );
    }
  }

  // ── 매핑 헬퍼 ──────────────────────────────────

  private toSnapshotDto(diagnosis: Diagnosis, parts: InferredPartMetric[]): SkinScoreSnapshotDto {
    const dto = new SkinScoreSnapshotDto();
    dto.id = diagnosis.id;
    dto.capturedAt = diagnosis.capturedAt.toISOString();
    dto.overallScore = diagnosis.overallScore;
    dto.thumbnailUri = diagnosis.thumbnailUri;
    dto.parts = parts.map((p) => this.partToDto(p));
    return dto;
  }

  private toSnapshotDtoFromDb(diagnosis: Diagnosis, metrics: SkinMetric[]): SkinScoreSnapshotDto {
    const dto = new SkinScoreSnapshotDto();
    dto.id = diagnosis.id;
    dto.capturedAt = diagnosis.capturedAt.toISOString();
    dto.overallScore = diagnosis.overallScore;
    dto.thumbnailUri = diagnosis.thumbnailUri;
    dto.parts = metrics.map((m) => this.metricToDto(m));
    return dto;
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

function errorName(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
