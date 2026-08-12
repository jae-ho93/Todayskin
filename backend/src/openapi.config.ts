import { DocumentBuilder } from '@nestjs/swagger';

/**
 * R28: OpenAPI 문서 정의 단일 출처.
 *
 * 개발용 Swagger UI(main.ts)와 프론트 타입 생성용 스펙 덤프(scripts/export-openapi.ts)가
 * 같은 정의를 쓰게 해서, 문서와 생성 타입이 서로 다른 스펙을 보는 일이 없게 한다.
 */
export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('Todayskin API')
    .setDescription('날씨 연동 AI 피부 진단 및 맞춤형 화장품 추천 서비스')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
}
