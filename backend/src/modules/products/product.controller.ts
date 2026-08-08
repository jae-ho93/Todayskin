import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { WeatherBasedRequestDto } from './dto/weather-based-request.dto';
import { WeatherProductsResponseDto } from './dto/weather-products-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/strategies/jwt.strategy';

/**
 * ProductController — 기존 FastAPI /products 이식.
 * HTTP 처리만 담당하고 비즈니스 로직은 ProductService에 둔다.
 */
@ApiTags('products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({
    summary: '제품 카탈로그 목록',
    description: '제품 카탈로그. category(moisture/elasticity/brightening/barrier) 필터 가능.',
  })
  async list(@Query() query: ProductQueryDto) {
    return this.productService.list(query.category, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Post('weather-based')
  @ApiOperation({
    summary: '날씨 기반 제품 추천 빠른 경로 (피부 측정값 없음, N32/N29)',
    description:
      'N12: 인증 필요. 좌표만 받아 서버가 오늘 날씨를 직접 조회해 세 상황(세안 후/외출 전/외출 후)별 실제 화장품을 하나씩 즉시 반환(source: CACHED | FALLBACK | LIVE). ' +
      'CACHED/FALLBACK이면 jobId가 함께 반환되고 GET /jobs/:id polling으로 LIVE 결과로 교체한다. ' +
      '응답 items는 전부 DB 실제품(+purchaseUrl)이며 가상 gemini-product-*가 없다. 날씨 조회 불가 시 503.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async weatherBased(
    @CurrentUser() user: JwtPayload,
    @Body() query: WeatherBasedRequestDto,
  ): Promise<WeatherProductsResponseDto> {
    if ((query.lat === undefined) !== (query.lon === undefined)) {
      throw new BadRequestException('lat과 lon은 함께 보내야 합니다');
    }
    return this.productService.generateWeatherBasedFast(user.sub, {
      lat: query.lat,
      lon: query.lon,
    });
  }
}
