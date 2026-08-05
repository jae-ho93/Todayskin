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

/**
 * RecommendationController — 기존 FastAPI /recommendations 이식.
 * HTTP 처리만 담당하고 비즈니스 로직은 RecommendationService에 둔다.
 */
@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get()
  @ApiOperation({
    summary: '전역 추천 카탈로그 (user 비종속)',
    description:
      '오늘의 추천 카탈로그(전역, 유저 비종속). 근거등급(A/B/C) 필터 가능. A=공인 가이드라인, B=개별 임상/관찰 연구, C=개인 시계열 통계적 관찰.',
  })
  async list(@Query() query: RecommendationQueryDto): Promise<RecommendationDto[]> {
    return this.recommendationService.listGlobal(query.grade);
  }

  @Post('generate')
  @ApiOperation({
    summary: 'B등급 추천 생성 (피부 측정값 + 날씨)',
    description:
      'B등급(사진 기반) 매칭: 오늘 피부 측정값 + 날씨를 Gemini에 전달해 근거 기반 추천을 생성한다. grade=B, sourceLabel은 서버가 고정. Gemini 실패 시 503. 동일 진단 중복 생성 방지. diagnosisId(최종 계약) 또는 skinScore+weather(기존 호환)를 받는다.',
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
