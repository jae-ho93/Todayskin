import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecommendationService } from './recommendation.service';
import { RecommendationDto } from './dto/recommendation.dto';
import { RecommendationQueryDto } from './dto/recommendation-query.dto';
import { GenerateRecommendationDto } from './dto/generate-recommendation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';
import { JobService } from '../jobs/job.service';
import { JobType } from '../jobs/enums/job-type.enum';
import { EnqueueJobResponseDto } from '../jobs/dto/job-response.dto';

/**
 * RecommendationController — 기존 FastAPI /recommendations 이식.
 * sync generate는 프론트 호환 유지, async generate는 N4 job enqueue.
 */
@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly jobService: JobService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '전역 추천 카탈로그 (user 비종속)',
    description:
      '오늘의 추천 카탈로그(전역, 유저 비종속). 근거등급(A/B/C) 필터 가능. A=공인 가이드라인, B=개별 임상/관찰 연구, C=개인 시계열 통계적 관찰.',
  })
  async list(@Query() query: RecommendationQueryDto) {
    return this.recommendationService.listGlobal(query.grade, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Post('generate')
  @ApiOperation({
    summary: 'B등급 추천 생성 (피부 측정값 + 날씨) — sync 호환',
    description:
      '기존 프론트 계약 유지. Gemini 실패 시 503. 동일 진단 중복 생성 방지. 비동기는 POST /recommendations/generate/async 사용.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async generate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateRecommendationDto,
  ): Promise<RecommendationDto[]> {
    return this.recommendationService.generate(user.sub, dto);
  }

  @Post('generate/async')
  @ApiOperation({
    summary: 'B등급 추천 생성 비동기 enqueue (N4)',
    description:
      '즉시 jobId를 반환한다. 결과는 GET /jobs/:id 또는 SSE /jobs/:id/events로 조회한다.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(202)
  async generateAsync(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateRecommendationDto,
  ): Promise<EnqueueJobResponseDto> {
    return this.jobService.enqueue(user.sub, JobType.RECOMMENDATION_GENERATE, {
      diagnosisId: dto.diagnosisId,
      skinScore: dto.skinScore,
      weather: dto.weather,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: '추천 상세',
    description: '전역 템플릿 또는 사용자 생성 추천. 생성 추천은 소유권 검사.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<RecommendationDto> {
    return this.recommendationService.getById(user.sub, id);
  }
}
