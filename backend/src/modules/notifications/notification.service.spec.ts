import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_DEFAULTS } from './enums/notification-defaults';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * NotificationService 단위 테스트.
 * Prisma를 mock하여 get-or-default, upsert 1-row 보장, 부분 갱신을 검증한다.
 * N34: pushDeliveryAvailable 플래그가 환경변수(PUSH_DELIVERY_AVAILABLE)를 반영하는지 검증.
 */
describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: Record<string, any>;
  let config: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      notificationPreference: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    config = { get: jest.fn().mockReturnValue('false') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(NotificationService);
  });
 
   describe('getPreference', () => {
     it('row가 없으면 기본값을 반환한다 (DB 부작용 없음)', async () => {
       prisma.notificationPreference.findUnique.mockResolvedValue(null);
       const result = await service.getPreference(1);
 
       expect(result.userId).toBe(1);
       expect(result.pushEnabled).toBe(NOTIFICATION_DEFAULTS.pushEnabled);
       expect(result.uvAlertEnabled).toBe(NOTIFICATION_DEFAULTS.uvAlertEnabled);
       expect(result.dustAlertEnabled).toBe(NOTIFICATION_DEFAULTS.dustAlertEnabled);
      expect(result.morningReminder).toBe(NOTIFICATION_DEFAULTS.morningReminder);
      expect(result.pushDeliveryAvailable).toBe(false);
      expect(result.updatedAt).toBeUndefined();
      // 읽기 시 DB에 row를 생성하지 않는다.
      expect(prisma.notificationPreference.upsert).not.toHaveBeenCalled();
    });
 
     it('row가 있으면 DB 값을 반환한다', async () => {
       prisma.notificationPreference.findUnique.mockResolvedValue({
         userId: 1,
         pushEnabled: true,
         uvAlertEnabled: false,
         dustAlertEnabled: true,
         morningReminder: true,
         updatedAt: new Date('2026-08-05T10:00:00.000Z'),
       });
       const result = await service.getPreference(1);
 
      expect(result.userId).toBe(1);
      expect(result.pushEnabled).toBe(true);
      expect(result.uvAlertEnabled).toBe(false);
      expect(result.pushDeliveryAvailable).toBe(false);
      expect(result.updatedAt).toBe('2026-08-05T10:00:00.000Z');
    });
  });

  describe('pushDeliveryAvailable (N34)', () => {
    /** config는 생성자에서 읽으므로 새 인스턴스로 검증한다. */
    async function makeService(pushDelivery: string) {
      config.get.mockImplementation((key: string) =>
        key === 'PUSH_DELIVERY_AVAILABLE' ? pushDelivery : undefined,
      );
      const moduleRef = await Test.createTestingModule({
        providers: [
          NotificationService,
          { provide: PrismaService, useValue: prisma },
          { provide: ConfigService, useValue: config },
        ],
      }).compile();
      return moduleRef.get<NotificationService>(NotificationService);
    }

    it('PUSH_DELIVERY_AVAILABLE=false → false (기본: 게이트웨이 미연동)', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      const s = await makeService('false');
      const result = await s.getPreference(1);
      expect(result.pushDeliveryAvailable).toBe(false);
    });

    it('PUSH_DELIVERY_AVAILABLE=true → true (게이트웨이 연동 시 flip)', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      const s = await makeService('true');
      const result = await s.getPreference(1);
      expect(result.pushDeliveryAvailable).toBe(true);
    });
  });
 
   describe('updatePreference', () => {
    it('row가 없으면 기본값에서 시작해 전달된 필드만 갱신해 upsert로 1 row를 만든다', async () => {
      prisma.notificationPreference.upsert.mockImplementation((args: any) =>
        Promise.resolve({
          userId: 1,
           ...args.create,
           updatedAt: new Date('2026-08-05T10:00:00.000Z'),
         }),
       );
 
       const result = await service.updatePreference(1, { pushEnabled: true });
 
       expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 1 },
        update: {
          pushEnabled: true,
        },
         create: {
           userId: 1,
           pushEnabled: true,
           uvAlertEnabled: NOTIFICATION_DEFAULTS.uvAlertEnabled,
           dustAlertEnabled: NOTIFICATION_DEFAULTS.dustAlertEnabled,
           morningReminder: NOTIFICATION_DEFAULTS.morningReminder,
         },
       });      expect(result.pushEnabled).toBe(true);
      expect(result.pushDeliveryAvailable).toBe(false);
    });

    it('기존 row가 있으면 전달된 필드만 갱신한다', async () => {
      prisma.notificationPreference.upsert.mockImplementation((args: any) =>
        Promise.resolve({
          userId: 1,
          pushEnabled: false,
          uvAlertEnabled: true,
          dustAlertEnabled: true,
          morningReminder: args.update.morningReminder,
          updatedAt: new Date('2026-08-05T10:00:00.000Z'),
        }),
       );
 
       const result = await service.updatePreference(1, { morningReminder: true });
 
       expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 1 },
        update: {
          morningReminder: true,
        },
         create: {
           userId: 1,
           pushEnabled: false,
           uvAlertEnabled: true,
           dustAlertEnabled: true,
           morningReminder: true,
         },
       });
       expect(result.morningReminder).toBe(true);
       expect(result.pushEnabled).toBe(false);
     });
 
    it('빈 DTO면 기본값으로 신규 row를 만든다', async () => {
      prisma.notificationPreference.upsert.mockImplementation(() =>
        Promise.resolve({
          userId: 1,
          pushEnabled: NOTIFICATION_DEFAULTS.pushEnabled,
          uvAlertEnabled: NOTIFICATION_DEFAULTS.uvAlertEnabled,
          dustAlertEnabled: NOTIFICATION_DEFAULTS.dustAlertEnabled,
          morningReminder: NOTIFICATION_DEFAULTS.morningReminder,
          updatedAt: new Date('2026-08-05T10:00:00.000Z'),
        }),
       );
 
       const result = await service.updatePreference(1, {});
 
      expect(result.pushEnabled).toBe(NOTIFICATION_DEFAULTS.pushEnabled);
      expect(result.uvAlertEnabled).toBe(NOTIFICATION_DEFAULTS.uvAlertEnabled);
      expect(result.dustAlertEnabled).toBe(NOTIFICATION_DEFAULTS.dustAlertEnabled);
      expect(result.morningReminder).toBe(NOTIFICATION_DEFAULTS.morningReminder);
    });
   });
 });
