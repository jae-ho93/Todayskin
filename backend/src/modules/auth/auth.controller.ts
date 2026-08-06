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
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: '회원가입 (전화번호/이름/생년월일, 비밀번호 없음 — MVP)' })
  @HttpCode(201)
  async signup(@Body() dto: SignupDto): Promise<UserResponseDto> {
    return this.authService.signup(dto);
  }

  @Post('login')
  @ApiOperation({ summary: '로그인 (전화번호만, 비밀번호 없음 — MVP)' })
  @HttpCode(200)
  // 기존 FastAPI /auth/login 호환: 프론트는 응답 전체를 User 세션 객체로 저장한다.
  // User 필드 + accessToken + refreshToken + expiresIn을 함께 반환한다.
  async login(@Body() dto: LoginDto): Promise<UserResponseDto> {
    return this.authService.login(dto);
  }

  @Post('logout')
  @ApiOperation({ summary: '로그아웃 (모든 세션 폐기)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async logout(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.authService.logout(user.sub);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Access Token 갱신 (Refresh Token 회전)' })
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<TokenResponseDto> {
    return this.authService.refresh(dto.refreshToken, req.headers['user-agent'], req.ip);
  }

  @Get('me')
  @ApiOperation({ summary: '현재 사용자 정보' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    return this.authService.getMe(user.sub);
  }

  @Post('withdraw')
  @ApiOperation({
    summary: '회원 탈퇴 Soft Delete (N6)',
    description:
      'PII 즉시 스크럽, 원본 이미지 물리 삭제, 진단 결과 익명 보존. purgeAfter 이후 최종 물리 삭제.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async withdraw(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ deletedAt: string; purgeAfter: string }> {
    return this.authService.withdraw(user.sub);
  }
}
