import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
} from './dto/notification-preference.dto';
import { NOTIFICATION_DEFAULTS } from './enums/notification-defaults';

export type NotificationKind = 'uv' | 'dust' | 'morning' | 'generic';

export interface SendNotificationResult {
  delivered: boolean;
  skipped: boolean;
  reason: string;
  kind: NotificationKind;
  title: string;
  body: string;
  sentAt: string;
}

/**
 * NotificationService — 알림 설정 저장(T11) + 발송 시뮬레이션(N4).
 *
 * 사용자별 NotificationPreference 1 row를 보장하고 조회·수정 API를 제공한다.
 * N4에서 비동기 job 핸들러가 send()를 호출한다.
 * 실제 푸시 게이트웨이는 후속 작업이며, 현재는 선호설정 게이트만 적용한다.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    // N34: 서버가 실제 푸시 발송(FCM/APNs)을 지원하는지 여부.
    // env.registry의 PUSH_DELIVERY_AVAILABLE에서 읽는다 (기본 false).
    this.pushDeliveryAvailable =
      (this.config.get<string>('PUSH_DELIVERY_AVAILABLE') ?? 'false') ===
      'true';
  }

  /** N34: 읽기 전용 플래그 — 푸시 실제 발송 지원 여부. */
  private readonly pushDeliveryAvailable: boolean;

  /**
   * 사용자 알림 설정 조회.
   * row가 없으면 DB에 생성하지 않고 기본값을 응답으로 반환한다(읽기 부작용 방지).
   */
  async getPreference(userId: number): Promise<NotificationPreferenceDto> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!row) {
      return {
        userId,
        ...NOTIFICATION_DEFAULTS,
        pushDeliveryAvailable: this.pushDeliveryAvailable,
      };
    }

    return this.toDto(row);
  }

  /**
   * 사용자 알림 설정 부분 갱신.
   * row가 없으면 기본값에서 시작해 upsert로 1 row를 보장한다.
   */
  async updatePreference(
    userId: number,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceDto> {
    const update = {
      ...(dto.pushEnabled !== undefined
        ? { pushEnabled: dto.pushEnabled }
        : {}),
      ...(dto.uvAlertEnabled !== undefined
        ? { uvAlertEnabled: dto.uvAlertEnabled }
        : {}),
      ...(dto.dustAlertEnabled !== undefined
        ? { dustAlertEnabled: dto.dustAlertEnabled }
        : {}),
      ...(dto.morningReminder !== undefined
        ? { morningReminder: dto.morningReminder }
        : {}),
    };

    const row = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update,
      create: { userId, ...NOTIFICATION_DEFAULTS, ...update },
    });

    this.logger.log(`알림 설정 갱신: userId=${userId}`);
    return this.toDto(row);
  }

  /**
   * N4: 알림 발송(시뮬레이션).
   * pushEnabled=false 또는 종류별 알림 off면 skipped=true로 반환한다.
   * 실제 FCM/APNs 연동은 후속 작업.
   */
  async send(
    userId: number,
    kind: string,
    options?: { title?: string; body?: string },
  ): Promise<SendNotificationResult> {
    const normalized = this.normalizeKind(kind);
    const pref = await this.getPreference(userId);
    const title = options?.title?.trim() || this.defaultTitle(normalized);
    const body = options?.body?.trim() || this.defaultBody(normalized);
    const sentAt = new Date().toISOString();

    if (!pref.pushEnabled) {
      return {
        delivered: false,
        skipped: true,
        reason: 'push_disabled',
        kind: normalized,
        title,
        body,
        sentAt,
      };
    }

    if (normalized === 'uv' && !pref.uvAlertEnabled) {
      return {
        delivered: false,
        skipped: true,
        reason: 'uv_alert_disabled',
        kind: normalized,
        title,
        body,
        sentAt,
      };
    }

    if (normalized === 'dust' && !pref.dustAlertEnabled) {
      return {
        delivered: false,
        skipped: true,
        reason: 'dust_alert_disabled',
        kind: normalized,
        title,
        body,
        sentAt,
      };
    }

    if (normalized === 'morning' && !pref.morningReminder) {
      return {
        delivered: false,
        skipped: true,
        reason: 'morning_reminder_disabled',
        kind: normalized,
        title,
        body,
        sentAt,
      };
    }

    // 푸시 게이트웨이 연동 전: 발송 가능 상태로 기록만 남긴다.
    this.logger.log(
      `notification send simulated: userId=${userId} kind=${normalized}`,
    );
    return {
      delivered: true,
      skipped: false,
      reason: 'simulated',
      kind: normalized,
      title,
      body,
      sentAt,
    };
  }

  private normalizeKind(kind: string): NotificationKind {
    if (kind === 'uv' || kind === 'dust' || kind === 'morning' || kind === 'generic') {
      return kind;
    }
    return 'generic';
  }

  private defaultTitle(kind: NotificationKind): string {
    switch (kind) {
      case 'uv':
        return '자외선 주의';
      case 'dust':
        return '미세먼지 주의';
      case 'morning':
        return '아침 스킨케어 리마인더';
      default:
        return 'Todayskin 알림';
    }
  }

  private defaultBody(kind: NotificationKind): string {
    switch (kind) {
      case 'uv':
        return '오늘 자외선 지수가 높아요. 외출 전 선크림을 챙기세요.';
      case 'dust':
        return '미세먼지 농도가 높아요. 외출 시 마스크를 권장합니다.';
      case 'morning':
        return '아침 루틴 시간이에요. 클렌징과 보습을 진행해 보세요.';
      default:
        return '오늘의 피부 관리 알림입니다.';
    }
  }

  private toDto(row: {
    userId: number;
    pushEnabled: boolean;
    uvAlertEnabled: boolean;
    dustAlertEnabled: boolean;
    morningReminder: boolean;
    updatedAt: Date;
  }): NotificationPreferenceDto {
    return {
      userId: row.userId,
      pushEnabled: row.pushEnabled,
      uvAlertEnabled: row.uvAlertEnabled,
      dustAlertEnabled: row.dustAlertEnabled,
      morningReminder: row.morningReminder,
      pushDeliveryAvailable: this.pushDeliveryAvailable,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
