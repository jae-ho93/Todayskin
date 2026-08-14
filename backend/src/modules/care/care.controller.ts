import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CareService } from './care.service';
import {
  CareDiagnosisRequestDto,
  CareMorningRequestDto,
  CareWeatherQueryDto,
} from './dto/care-request.dto';
import { CarePlanFastResponseDto } from './dto/care-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';

/**
 * CareController — 케어 루틴+제품 빠른 경로(N32/N29 패턴).
 * 세 careType(weather/skin/combined) 모두 인증 필요. HTTP 처리만 하고
 * 생성·후처리·캐싱은 CareService/CareJobHandler가 담당한다.
 */
@ApiTags('care')
@Controller('care')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class CareController {
  constructor(private readonly careService: CareService) {}

  @Get('weather')
  @ApiOperation({
    summary: '날씨 기반 케어 루틴+제품 빠른 경로',
    description:
      '좌표만 받아 서버가 오늘 날씨를 직접 조회하고 케어 루틴+실제 제품을 즉시 반환한다 ' +
      '(source: CACHED | FALLBACK | LIVE). CACHED/FALLBACK이면 jobId로 GET /jobs/:id polling해 LIVE로 교체한다.',
  })
  @ApiOkResponse({ type: CarePlanFastResponseDto })
  async weather(
    @CurrentUser() user: JwtPayload,
    @Query() query: CareWeatherQueryDto,
  ): Promise<CarePlanFastResponseDto> {
    return this.careService.getWeatherFast(user.sub, {
      lat: query.lat,
      lon: query.lon,
      refresh: query.refresh,
    });
  }

  @Post('skin')
  @HttpCode(200)
  @ApiOperation({
    summary: '피부 상태 기반 케어 루틴+제품 빠른 경로',
    description: '지정한 진단의 피부 측정값을 기준으로 케어 루틴+실제 제품을 생성한다.',
  })
  @ApiOkResponse({ type: CarePlanFastResponseDto })
  async skin(
    @CurrentUser() user: JwtPayload,
    @Body() body: CareDiagnosisRequestDto,
  ): Promise<CarePlanFastResponseDto> {
    return this.careService.getSkinFast(user.sub, body.diagnosisId, {
      refresh: body.refresh,
      routine: body.routine,
      medicalDisclaimer: body.medicalDisclaimer,
    });
  }

  @Post('combined')
  @HttpCode(200)
  @ApiOperation({
    summary: '날씨+피부 상태 복합 케어 루틴+제품 빠른 경로',
    description:
      '지정한 진단의 피부 측정값과 그 진단에 연결된 날씨(diagnosis.weatherSnapshotId)를 함께 반영한다.',
  })
  @ApiOkResponse({ type: CarePlanFastResponseDto })
  async combined(
    @CurrentUser() user: JwtPayload,
    @Body() body: CareDiagnosisRequestDto,
  ): Promise<CarePlanFastResponseDto> {
    return this.careService.getCombinedFast(user.sub, body.diagnosisId, {
      refresh: body.refresh,
      routine: body.routine,
      medicalDisclaimer: body.medicalDisclaimer,
    });
  }

  @Post('morning')
  @HttpCode(200)
  @ApiOperation({
    summary: '다음날 아침 케어 루틴+제품 빠른 경로',
    description:
      '지정한 진단(어젯밤 측정)의 피부 상태는 그대로 두고 날씨만 오늘 좌표 기준 실시간 값으로 ' +
      '갱신해 외출 전/외출 중 케어를 생성한다.',
  })
  @ApiOkResponse({ type: CarePlanFastResponseDto })
  async morning(
    @CurrentUser() user: JwtPayload,
    @Body() body: CareMorningRequestDto,
  ): Promise<CarePlanFastResponseDto> {
    if ((body.lat === undefined) !== (body.lon === undefined)) {
      throw new BadRequestException('lat과 lon은 함께 보내야 합니다');
    }
    return this.careService.getMorningFast(user.sub, body.diagnosisId, {
      lat: body.lat,
      lon: body.lon,
      refresh: body.refresh,
      routine: body.routine,
      medicalDisclaimer: body.medicalDisclaimer,
    });
  }
}
