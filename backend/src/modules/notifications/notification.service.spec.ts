 import { Test } from '@nestjs/testing';
 import { NotificationService } from './notification.service';
 import { PrismaService } from '../../prisma/prisma.service';
 import { NOTIFICATION_DEFAULTS } from './enums/notification-defaults';
 
 /* eslint-disable @typescript-eslint/no-explicit-any */
 
 /**
  * NotificationService 단위 테스트.
  * Prisma를 mock하여 get-or-default, upsert 1-row 보장, 부분 갱신을 검증한다.
  */
 describe('NotificationService', () => {
   let service: NotificationService;
   let prisma: Record<string, any>;
 
   beforeEach(async () => {
     prisma = {
       notificationPreference: {
         findUnique: jest.fn(),
         upsert: jest.fn(),
       },
     };
 
     const moduleRef = await Test.createTestingModule({
       providers: [
         NotificationService,
         { provide: PrismaService, useValue: prisma },
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
       expect(result.updatedAt).toBe('2026-08-05T10:00:00.000Z');
     });
   });
 
   describe('updatePreference', () => {
     it('row가 없으면 기본값에서 시작해 전달된 필드만 갱신해 upsert로 1 row를 만든다', async () => {
       prisma.notificationPreference.findUnique.mockResolvedValue(null);
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
           uvAlertEnabled: NOTIFICATION_DEFAULTS.uvAlertEnabled,
           dustAlertEnabled: NOTIFICATION_DEFAULTS.dustAlertEnabled,
           morningReminder: NOTIFICATION_DEFAULTS.morningReminder,
         },
         create: {
           userId: 1,
           pushEnabled: true,
           uvAlertEnabled: NOTIFICATION_DEFAULTS.uvAlertEnabled,
           dustAlertEnabled: NOTIFICATION_DEFAULTS.dustAlertEnabled,
           morningReminder: NOTIFICATION_DEFAULTS.morningReminder,
         },
       });
       expect(result.pushEnabled).toBe(true);
     });
 
     it('기존 row가 있으면 전달된 필드만 갱신한다', async () => {
       const existing = {
         userId: 1,
         pushEnabled: false,
         uvAlertEnabled: true,
         dustAlertEnabled: true,
         morningReminder: false,
         updatedAt: new Date('2026-08-04T00:00:00.000Z'),
       };
       prisma.notificationPreference.findUnique.mockResolvedValue(existing);
       prisma.notificationPreference.upsert.mockImplementation((args: any) =>
         Promise.resolve({
           ...args.update,
           userId: 1,
           updatedAt: new Date('2026-08-05T10:00:00.000Z'),
         }),
       );
 
       const result = await service.updatePreference(1, { morningReminder: true });
 
       expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
         where: { userId: 1 },
         update: {
           pushEnabled: false,
           uvAlertEnabled: true,
           dustAlertEnabled: true,
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
 
     it('빈 DTO면 기존값을 그대로 유지한다', async () => {
       const existing = {
         userId: 1,
         pushEnabled: true,
         uvAlertEnabled: false,
         dustAlertEnabled: false,
         morningReminder: true,
         updatedAt: new Date('2026-08-04T00:00:00.000Z'),
       };
       prisma.notificationPreference.findUnique.mockResolvedValue(existing);
       prisma.notificationPreference.upsert.mockImplementation((args: any) =>
         Promise.resolve({
           ...args.update,
           userId: 1,
           updatedAt: new Date('2026-08-05T10:00:00.000Z'),
         }),
       );
 
       const result = await service.updatePreference(1, {});
 
       expect(result.pushEnabled).toBe(true);
       expect(result.uvAlertEnabled).toBe(false);
       expect(result.dustAlertEnabled).toBe(false);
       expect(result.morningReminder).toBe(true);
     });
   });
 });
