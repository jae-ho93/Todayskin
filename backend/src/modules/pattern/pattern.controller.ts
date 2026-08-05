import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PatternService } from './pattern.service';
import { PatternSummaryDto } from './dto/pattern-summary.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';

/**
 * PatternController — 개인 패턴 분석 API (T10).
 *
 * GET /diagnosis/pattern — 로그인한 사용자의 시계열 상관 분석.
 *
 * 데이터 부족은 404가 아니라 200 + LOCKED로 반환한다.
 * 기존 FastAPI에는 없던 새 API이며, 프론트 trend.tsx의 mock을 이 계약으로 교체한다.
 */
@ApiTags('diagnosis')
@Controller('diagnosis')
export class PatternController {
  constructor(private readonly patternService: PatternService) {}

  @Get('pattern')
  @ApiOperation({
    summary: '개인 패턴 분석 (본인 시계열)',
    description:
      '진단+날씨 시계열을 모아 피부 지표와 환경 지표 사이의 상관관계를 분석한다. ' +
      '데이터가 부족하면 404가 아닌 200 + LOCKED로 반환한다. ' +
      '상관관계는 인과관계가 아님을 고정 문구로 표시한다.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getPattern(@CurrentUser() user: JwtPayload): Promise<PatternSummaryDto> {
    return this.patternService.getPattern(user.sub);
  }
}
