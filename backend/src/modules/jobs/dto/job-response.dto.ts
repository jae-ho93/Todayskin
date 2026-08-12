import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus } from '../enums/job-status.enum';
import { JobType } from '../enums/job-type.enum';

/** POST enqueue 응답 — 즉시 jobId만 반환 */
export class EnqueueJobResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  jobId!: string;

  @ApiProperty({ enum: JobStatus, example: JobStatus.PENDING })
  status!: JobStatus;
}

/** GET /jobs/:id · SSE 이벤트 본문 */
export class JobResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: JobType })
  type!: JobType;

  @ApiProperty({ enum: JobStatus })
  status!: JobStatus;

  @ApiProperty({ description: '낮을수록 높은 우선순위' })
  priority!: number;

  @ApiProperty()
  attempts!: number;

  @ApiProperty()
  maxAttempts!: number;

  @ApiProperty()
  queueName!: string;

  @ApiPropertyOptional({ description: 'COMPLETED 시 결과 페이로드' })
  result?: unknown;

  @ApiPropertyOptional({ type: String, description: 'FAILED 시 에러 메시지', nullable: true })
  error?: string | null;

  @ApiProperty({ description: '최종 실패 후 DLQ 이동 여부' })
  deadLetter!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  startedAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  finishedAt?: string | null;
}
