import { AuditLogService } from './audit-log.service';

/**
 * N48: 감사 로그 저장 시 metadata 마스킹 강제 테스트.
 * 호출자가 민감정보를 넣어도 DB에 평문으로 저장되지 않는지 확인한다.
 */
describe('AuditLogService (N48)', () => {
  let prisma: { auditLog: { create: jest.Mock } };
  let service: AuditLogService;

  beforeEach(() => {
    prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    service = new AuditLogService(prisma as never);
  });

  it('metadata의 전화번호·토큰이 마스킹된 채 저장된다', async () => {
    await service.log({
      actorId: 1,
      action: 'user_role_changed',
      metadata: {
        phoneNumber: '01012345678',
        refreshToken: 'opaque-token-value',
        note: '변경 요청자 연락처 010-1234-5678',
      },
    });

    const stored = prisma.auditLog.create.mock.calls[0][0].data
      .metadata as Record<string, unknown>;
    expect(stored.phoneNumber).toBe('010****5678');
    expect(stored.refreshToken).toBe('[REDACTED]');
    expect(stored.note).toBe('변경 요청자 연락처 010****5678');
    expect(JSON.stringify(stored)).not.toContain('01012345678');
    expect(JSON.stringify(stored)).not.toContain('opaque-token-value');
  });

  it('metadata가 없으면 undefined로 저장한다', async () => {
    await service.log({ actorId: null, action: 'user.purge_triggered' });

    expect(
      prisma.auditLog.create.mock.calls[0][0].data.metadata,
    ).toBeUndefined();
  });

  it('일반 운영 metadata(카운트·enum)는 그대로 저장된다', async () => {
    await service.log({
      actorId: 1,
      action: 'user_role_changed',
      metadata: { from: 'USER', to: 'ADMIN', imagesDeleted: 3 },
    });

    expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toEqual({
      from: 'USER',
      to: 'ADMIN',
      imagesDeleted: 3,
    });
  });

  it('저장 실패는 삼켜서 비즈니스 요청을 깨지 않는다', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.log({ actorId: 1, action: 'x' }),
    ).resolves.toBeUndefined();
  });
});
