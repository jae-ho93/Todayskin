import {
  anonymizedPhone,
  computePurgeAfter,
  notDeletedWhere,
} from './soft-delete.policy';

describe('soft-delete.policy', () => {
  it('notDeletedWhere merges deletedAt null', () => {
    expect(notDeletedWhere({ userId: 1 })).toEqual({
      userId: 1,
      deletedAt: null,
    });
  });

  it('computePurgeAfter adds retention days', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const after = computePurgeAfter(from, 30);
    expect(after.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('anonymizedPhone includes user id', () => {
    expect(anonymizedPhone(42)).toMatch(/^deleted:42:/);
  });
});
