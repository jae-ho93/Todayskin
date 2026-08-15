import type { ExecutionContext } from '@nestjs/common';
import { isSensitiveThrottledRoute } from './sensitive-throttle';
import { RecommendationController } from '../../modules/recommendations/recommendation.controller';
import { ProductController } from '../../modules/products/product.controller';
import { CareController } from '../../modules/care/care.controller';
import { DiagnosisController } from '../../modules/diagnosis/diagnosis.controller';

/**
 * N57: 비용·리소스가 발생하는 엔드포인트(OpenAI 호출·AI 추론)는 Redis 장애 시
 * fail-open(통과)이 아니라 fail-closed(503)여야 한다. 데코레이터 등록을
 * 실제 컨트롤러 핸들러 기준으로 고정한다 — 라우트가 추가/이동돼도 놓치지 않는다.
 */
describe('N57: 비용 민감 엔드포인트 fail-closed 등록', () => {
  const ctxFor = (handler: unknown, cls: unknown): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => cls,
    }) as unknown as ExecutionContext;

  it.each([
    ['POST /recommendations/generate', RecommendationController.prototype.generate, RecommendationController],
    ['POST /recommendations/generate/fast', RecommendationController.prototype.generateFast, RecommendationController],
    ['POST /recommendations/generate/async', RecommendationController.prototype.generateAsync, RecommendationController],
    ['POST /products/weather-based', ProductController.prototype.weatherBased, ProductController],
    ['GET /care/weather', CareController.prototype.weather, CareController],
    ['POST /care/skin', CareController.prototype.skin, CareController],
    ['POST /care/combined', CareController.prototype.combined, CareController],
    ['POST /care/morning', CareController.prototype.morning, CareController],
    ['POST /diagnosis (추론)', DiagnosisController.prototype.submit, DiagnosisController],
  ])('%s는 sensitive(fail-closed) throttler다', (_label, handler, cls) => {
    expect(isSensitiveThrottledRoute(ctxFor(handler, cls))).toBe(true);
  });

  it.each([
    ['GET /recommendations (읽기)', RecommendationController.prototype.list, RecommendationController],
    ['GET /recommendations/:id (읽기)', RecommendationController.prototype.getById, RecommendationController],
    ['GET /products (읽기)', ProductController.prototype.list, ProductController],
    ['GET /diagnosis/latest (읽기)', DiagnosisController.prototype.getLatest, DiagnosisController],
    ['GET /diagnosis/history (읽기)', DiagnosisController.prototype.getHistory, DiagnosisController],
  ])('%s는 fail-open 유지', (_label, handler, cls) => {
    expect(isSensitiveThrottledRoute(ctxFor(handler, cls))).toBe(false);
  });
});
