import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';
import {
  HealthLiveResponseDto,
  HealthReadyResponseDto,
  HealthResponseDto,
} from './dto/health-response.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: '서버 상태 확인 (호환 — live와 동일 계약)' })
  check(): HealthResponseDto {
    return this.healthService.check();
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process event loop' })
  live(): HealthLiveResponseDto {
    return this.healthService.live();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe — DB·필수 config·migration (Redis는 선택)',
  })
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthReadyResponseDto> {
    const body = await this.healthService.ready();
    if (body.status === 'error') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}
