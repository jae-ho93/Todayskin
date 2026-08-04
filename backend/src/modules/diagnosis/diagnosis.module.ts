import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiagnosisController } from './diagnosis.controller';
import { DiagnosisService } from './diagnosis.service';
import {
  InferenceProvider,
  INFERENCE_PROVIDER,
} from './providers/inference-provider.interface';
import { MockInferenceProvider } from './providers/mock-inference.provider';
import { WeatherModule } from '../weather/weather.module';

/**
 * DiagnosisModule — T9.
 *
 * InferenceProvider는 환경 변수로 선택한다:
 *   - MOCK_INFERENCE=true (기본) → MockInferenceProvider (개발/통합 테스트용)
 *   - MOCK_INFERENCE=false → 현재는 실제 PythonInferenceProvider가 없으므로
 *     폴백으로 MockInferenceProvider를 반환하되 경고 로그를 남긴다.
 *     운영 환경에서 mock이 실제 추론처럼 보이지 않도록 T13 테스트가 이 계약을 검증한다.
 *   Python AI 서버가 준비되면 useFactory에 PythonInferenceProvider 분기를 추가한다.
 *
 * DiagnosisService는 PrismaService(PrismaModule 전역), WeatherService(WeatherModule),
 * InferenceProvider(토큰)를 주입받는다.
 */
@Module({
  imports: [WeatherModule],
  controllers: [DiagnosisController],
  providers: [
    {
      provide: INFERENCE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): InferenceProvider => {
        const logger = new Logger('DiagnosisModule');
        const useMock =
          config.get<string>('MOCK_INFERENCE', 'true') === 'true';
        // Python AI 서버 준비 전까지는 두 분기 모두 mock을 반환한다.
        // useMock === false인 경우는 운영 테스트(T13)가 503 계약을 검증하는 대상이다.
        if (!useMock) {
          logger.warn(
            'MOCK_INFERENCE=false 이지만 실제 InferenceProvider가 아직 준비되지 않아 MockInferenceProvider로 폴백합니다. 운영에서는 PythonInferenceProvider 추가 후 이 폴백을 제거해야 합니다.',
          );
        }
        return new MockInferenceProvider();
      },
    },
    DiagnosisService,
  ],
  exports: [DiagnosisService],
})
export class DiagnosisModule {}
