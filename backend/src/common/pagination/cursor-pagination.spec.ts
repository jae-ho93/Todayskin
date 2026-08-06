import {
  buildCursorPage,
  decodeCursor,
  encodeCursor,
} from './cursor-pagination';

describe('cursor-pagination', () => {
  it('encodes and decodes cursor', () => {
    const c = encodeCursor('abc', '2026-08-01T00:00:00.000Z');
    expect(decodeCursor(c)).toEqual({
      id: 'abc',
      at: '2026-08-01T00:00:00.000Z',
    });
  });

  it('buildCursorPage returns nextCursor when more rows', () => {
    const rows = [
      { id: '1', createdAt: new Date('2026-01-01') },
      { id: '2', createdAt: new Date('2026-01-02') },
      { id: '3', createdAt: new Date('2026-01-03') },
    ];
    const page = buildCursorPage(rows, 2, (r) => r.createdAt);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    expect(decodeCursor(page.nextCursor!)?.id).toBe('2');
  });

  it('buildCursorPage nextCursor null at end', () => {
    const rows = [{ id: '1' }, { id: '2' }];
    const page = buildCursorPage(rows, 2, () => undefined);
    expect(page.nextCursor).toBeNull();
  });
});
