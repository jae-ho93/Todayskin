import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { WeatherModule } from './modules/weather/weather.module';
import { RecommendationModule } from './modules/recommendations/recommendation.module';
import { ProductModule } from './modules/products/product.module';
import { DiagnosisModule } from './modules/diagnosis/diagnosis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    WeatherModule,
    RecommendationModule,
    ProductModule,
    DiagnosisModule,
  ],
})
export class AppModule {}
