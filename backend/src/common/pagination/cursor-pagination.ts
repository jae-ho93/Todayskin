import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** 커서 페이지 요청 공통 쿼리. limit이 없으면 전체(호환) 모드. */
export class CursorPaginationQueryDto {
  @ApiPropertyOptional({
    description: '페이지 크기. 지정 시 커서 페이지 응답({items,nextCursor})',
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: '이전 응답의 nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class CursorPageDto<T> {
  @ApiProperty({ isArray: true })
  items!: T[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '다음 페이지 커서. 없으면 null',
  })
  nextCursor!: string | null;
}

export function decodeCursor(cursor?: string): { id: string; at?: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { id?: string; at?: string };
    if (!parsed?.id) return null;
    return { id: parsed.id, at: parsed.at };
  } catch {
    return null;
  }
}

export function encodeCursor(id: string, at?: string | Date): string {
  const payload = {
    id,
    at: at instanceof Date ? at.toISOString() : at,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * createdAt/capturedAt asc + id 복합 커서.
 * take limit+1 로 nextCursor 판별.
 */
export function buildCursorPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  getAt: (row: T) => Date | string | undefined,
): CursorPageDto<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.id, getAt(last)) : null,
  };
}
