import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import {
  NotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
} from './dto/notification-preference.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';
import { JobService } from '../jobs/job.service';
import { JobType } from '../jobs/enums/job-type.enum';
import { EnqueueJobResponseDto } from '../jobs/dto/job-response.dto';

/**
 * NotificationController — 알림 설정(T11) + 비동기 발송 enqueue(N4).
 */
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly jobService: JobService,
  ) {}

  @Get('preferences')
  @ApiOperation({
    summary: '알림 설정 조회',
    description:
      '본인 알림 설정을 반환한다. DB에 row가 없으면 기본값을 반환한다(404가 아님).',
  })
  @ApiBearerAuth()
  async getPreference(
    @CurrentUser() user: JwtPayload,
  ): Promise<NotificationPreferenceDto> {
    return this.notificationService.getPreference(user.sub);
  }

  @Put('preferences')
  @ApiOperation({
    summary: '알림 설정 부분 갱신',
    description:
      '본인 알림 설정을 부분 갱신한다. 전달된 필드만 갱신하고, row가 없으면 기본값에서 생성한다.',
  })
  @ApiBearerAuth()
  @HttpCode(200)
  async updatePreference(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceDto> {
    return this.notificationService.updatePreference(user.sub, dto);
  }

  @Post('send/async')
  @ApiOperation({
    summary: '알림 발송 비동기 enqueue (N4)',
    description:
      '즉시 jobId를 반환한다. 결과는 GET /jobs/:id 또는 SSE /jobs/:id/events로 조회한다.',
  })
  @ApiBearerAuth()
  @HttpCode(202)
  async sendAsync(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendNotificationDto,
  ): Promise<EnqueueJobResponseDto> {
    return this.jobService.enqueue(user.sub, JobType.NOTIFICATION_SEND, {
      kind: dto.kind,
      title: dto.title,
      body: dto.body,
    });
  }
}
