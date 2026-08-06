import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PatternService } from './pattern.service';
import { PatternSummaryDto } from './dto/pattern-summary.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';
import { JobService } from '../jobs/job.service';
import { JobType } from '../jobs/enums/job-type.enum';
import { EnqueueJobResponseDto } from '../jobs/dto/job-response.dto';

/**
 * PatternController — 개인 패턴 분석 API (T10) + 비동기 enqueue (N4).
 *
 * GET /diagnosis/pattern — sync 조회 (LOCKED/READY 계약 유지)
 * POST /diagnosis/pattern/async — job enqueue
 */
@ApiTags('diagnosis')
@Controller('diagnosis')
export class PatternController {
  constructor(
    private readonly patternService: PatternService,
    private readonly jobService: JobService,
  ) {}

  @Get('pattern')
  @ApiOperation({
    summary: '개인 패턴 분석 (본인 시계열) — sync',
    description:
      '진단+날씨 시계열을 모아 피부 지표와 환경 지표 사이의 상관관계를 분석한다. ' +
      '데이터가 부족하면 404가 아닌 200 + LOCKED로 반환한다. ' +
      '비동기는 POST /diagnosis/pattern/async 사용.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getPattern(@CurrentUser() user: JwtPayload): Promise<PatternSummaryDto> {
    return this.patternService.getPattern(user.sub);
  }

  @Post('pattern/async')
  @ApiOperation({
    summary: '개인 패턴 분석 비동기 enqueue (N4)',
    description:
      '즉시 jobId를 반환한다. 결과는 GET /jobs/:id 또는 SSE /jobs/:id/events로 조회한다.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(202)
  async analyzeAsync(
    @CurrentUser() user: JwtPayload,
  ): Promise<EnqueueJobResponseDto> {
    return this.jobService.enqueue(user.sub, JobType.PATTERN_ANALYZE, {});
  }
}
