import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { SocialLoginResponseDto } from './dto/social-login-response.dto';
import { LinkPhoneDto } from './dto/link-phone.dto';
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

  @Post('social')
  @ApiOperation({
    summary: '소셜 로그인 (Kakao·Google·Apple) — N33',
    description:
      '제공자 토큰을 서버에서 검증한다 (kakao: access token REST 검증, google/apple: id_token JWKS RS256 서명 검증). ' +
      '연결된 계정이 있으면 기존 refresh 세션으로 로그인, 미가입이면 계정을 생성하고 isNewUser=true로 온보딩(동의 + 선택 전화 연결)을 안내한다. ' +
      '비밀번호 API는 없으며 세션은 기존 /auth/refresh 흐름을 그대로 사용한다.',
  })
  @HttpCode(200)
  async socialLogin(
    @Body() dto: SocialLoginDto,
  ): Promise<SocialLoginResponseDto> {
    return this.authService.socialLogin(dto);
  }

  @Post('social/link-phone')
  @ApiOperation({
    summary: '소셜 계정 전화번호 연결 (N33 온보딩)',
    description:
      'OTP(social_link) 본인확인 후 소셜 계정에 전화번호(+선택 생년월일)를 연결한다. ' +
      '이미 다른 계정이 사용 중인 번호는 409. 연결 전까지 phoneNumber/birthDate는 null이다.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async linkPhone(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LinkPhoneDto,
  ): Promise<UserResponseDto> {
    return this.authService.linkPhone(user.sub, dto);
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

  @Patch('me')
  @ApiOperation({
    summary: '내 프로필 수정 (N28)',
    description:
      'name, gender만 수정 가능. phoneNumber 변경은 OTP 본인확인이 필요해 범위 밖. ' +
      '소유자 본인(JWT)만 수정할 수 있고 GET /auth/me와 동일한 형태를 반환한다.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMeDto,
  ): Promise<UserResponseDto> {
    return this.authService.updateMe(user.sub, dto);
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
