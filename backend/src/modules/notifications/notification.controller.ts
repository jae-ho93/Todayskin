 import { Body, Controller, Get, HttpCode, Put, UseGuards } from '@nestjs/common';
 import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
 import { NotificationService } from './notification.service';
 import { NotificationPreferenceDto, UpdateNotificationPreferenceDto } from './dto/notification-preference.dto';
 import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
 import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';
 
 /**
  * NotificationController — 알림 설정 저장 (T11).
  *
  * GET  /notifications/preferences — 본인 설정 조회 (row 없으면 기본값)
  * PUT  /notifications/preferences — 본인 설정 부분 갱신
  *
  * USER는 자기 설정만 조회·수정할 수 있다.
  * 인증은 JwtAuthGuard가 담당하고, 서비스는 인증된 userId만 다룬다.
  *
  * 이번 단계에서는 DB 저장만 구현한다. 푸시 발송·WebSocket/SSE는 별도 작업.
  */
 @ApiTags('notifications')
 @Controller('notifications')
 @UseGuards(JwtAuthGuard)
 export class NotificationController {
   constructor(private readonly notificationService: NotificationService) {}
 
   @Get('preferences')
   @ApiOperation({
     summary: '알림 설정 조회',
     description:
       '본인 알림 설정을 반환한다. DB에 row가 없으면 기본값을 반환한다(404가 아님).',
   })
   @ApiBearerAuth()
   async getPreference(@CurrentUser() user: JwtPayload): Promise<NotificationPreferenceDto> {
     return this.notificationService.getPreference(user.sub);
   }
 
   @Put('preferences')
   @ApiOperation({
     summary: '알림 설정 부분 갱신',
     description:
       '본인 알림 설정을 부분 갱신한다. 전달된 필드만 갱신하고, row가 없으면 기본값에서 생성한다. 사용자별 1 row를 보장한다.',
   })
   @ApiBearerAuth()
   @HttpCode(200)
   async updatePreference(
     @CurrentUser() user: JwtPayload,
     @Body() dto: UpdateNotificationPreferenceDto,
   ): Promise<NotificationPreferenceDto> {
     return this.notificationService.updatePreference(user.sub, dto);
   }
 }
