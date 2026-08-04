import { Module } from '@nestjs/common';
import { PatternController } from './pattern.controller';
import { PatternService } from './pattern.service';

/**
 * PatternModule — T10 개인 패턴 분석 API.
 *
 * Diagnosis+WeatherSnapshot 조인 시계열 상관 분석을 담당한다.
 * PrismaService(PrismaModule 전역)만 주입받는다.
 * 별도 외부 API/Gemini 호출은 없다.
 */
@Module({
  controllers: [PatternController],
  providers: [PatternService],
  exports: [PatternService],
})
export class PatternModule {}
