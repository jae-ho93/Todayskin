import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';
import { ConsentService } from './consent.service';
import {
  ConsentPurposeDto,
  ConsentRecordDto,
  UpsertConsentDto,
} from './dto/consent.dto';

@ApiTags('consents')
@Controller('consents')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get('registry')
  @ApiOperation({ summary: '동의 목적·version registry 조회 (인증 불필요)' })
  listRegistry(): ConsentPurposeDto[] {
    return this.consentService.listRegistry();
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '내 동의 상태 목록' })
  async listMine(
    @CurrentUser() user: JwtPayload,
  ): Promise<ConsentRecordDto[]> {
    return this.consentService.listUserConsents(user.sub);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiOperation({ summary: '동의/철회 upsert' })
  async upsert(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpsertConsentDto,
    @Req() req: Request,
  ): Promise<ConsentRecordDto> {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    return this.consentService.upsert(user.sub, dto, { ipAddress: ip });
  }
}
