import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { ProductDto } from './dto/product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { WeatherInputDto } from '../weather/dto/weather-snapshot.dto';

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
  async list(@Query() query: ProductQueryDto): Promise<ProductDto[]> {
    return this.productService.list(query.category);
  }

  @Post('weather-based')
  @ApiOperation({
    summary: '날씨 기반 제품 추천 (피부 측정값 없음)',
    description:
      '오늘 날씨/대기질만으로 세 상황(세안 후/외출 전/외출 후)별 화장품을 하나씩 생성. 응답에 reason, timing 포함. 유저 비종속이라 DB에 저장하지 않는다. Gemini 실패 시 503.',
  })
  @HttpCode(200)
  async weatherBased(@Body() weather: WeatherInputDto): Promise<ProductDto[]> {
    return this.productService.generateWeatherBased(weather);
  }
}
