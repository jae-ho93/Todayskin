import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiagnosisController } from './diagnosis.controller';
import { DiagnosisService } from './diagnosis.service';
import {
  InferenceProvider,
  INFERENCE_PROVIDER,
  InferenceUnavailable,
} from './providers/inference-provider.interface';
import { MockInferenceProvider } from './providers/mock-inference.provider';
import { PythonInferenceProvider } from './providers/python-inference.provider';
import { WeatherModule } from '../weather/weather.module';
import { ConsentModule } from '../consent/consent.module';
import { StorageModule } from '../storage/storage.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { AdminModule } from '../admin/admin.module';

/**
 * DiagnosisModule — T9.
 *
 * InferenceProvider는 환경 변수로 선택한다:
 *   - MOCK_INFERENCE=true (개발/통합 테스트용) → MockInferenceProvider
 *   - INFERENCE_SERVICE_URL이 설정됨 → PythonInferenceProvider
 *     (backend/inference-service — 학습된 MobileNetV3 모델을 감싼 FastAPI 서버)
 *   - 그 외 → 실제 provider가 준비되지 않았음을 나타내는 fail-closed provider
 *     (진단 API는 503을 반환한다.)
 *
 * DiagnosisService는 PrismaService(PrismaModule 전역), WeatherService(WeatherModule),
 * InferenceProvider(토큰)를 주입받는다.
 */
@Module({
  // AdminModule: 기록 삭제(N43) 감사 로그. 되돌릴 수 없는 개인정보 삭제라 흔적을 남긴다.
  imports: [WeatherModule, ConsentModule, StorageModule, IdempotencyModule, AdminModule],
  controllers: [DiagnosisController],
  providers: [
    {
      provide: INFERENCE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): InferenceProvider => {
        const logger = new Logger('DiagnosisModule');
        const useMock = config.get<string>('MOCK_INFERENCE', 'false') === 'true';
        const isProduction =
          config.get<string>('NODE_ENV') === 'production' ||
          process.env.NODE_ENV === 'production';

        if (useMock && !isProduction) {
          return new MockInferenceProvider();
        }

        if (useMock && isProduction) {
          logger.error(
            'production 환경에서는 MOCK_INFERENCE를 사용할 수 없습니다. 진단 API는 실제 provider가 연결될 때까지 503을 반환합니다.',
          );
        }

        const inferenceServiceUrl = config.get<string>('INFERENCE_SERVICE_URL');
        if (inferenceServiceUrl) {
          const inferenceSecret = config.get<string>('INFERENCE_SHARED_SECRET', '');
          if (!inferenceSecret) {
            logger.warn(
              'INFERENCE_SHARED_SECRET 미설정 — inference-service가 401/503을 반환합니다. 운영에서는 반드시 설정하세요 (N13).',
            );
          }
          logger.log(`PythonInferenceProvider 연결: ${inferenceServiceUrl}`);
          return new PythonInferenceProvider(inferenceServiceUrl, inferenceSecret);
        }

        logger.warn(
          '실제 InferenceProvider가 아직 연결되지 않았습니다(INFERENCE_SERVICE_URL 미설정). 진단 API는 provider가 준비될 때까지 503을 반환합니다.',
        );
        return {
          infer: async () => {
            throw new InferenceUnavailable();
          },
        };
      },
    },
    DiagnosisService,
  ],
  exports: [DiagnosisService],
})
export class DiagnosisModule {}
