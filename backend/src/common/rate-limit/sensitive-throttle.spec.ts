import type { ExecutionContext } from '@nestjs/common';
import {
  SensitiveThrottle,
  isSensitiveThrottledRoute,
} from './sensitive-throttle';

/**
 * N47: sensitive throttler 라우트 판별 테스트.
 * ThrottlerModule skipIf가 데코레이터 유무로 정확히 갈리는지 확인한다.
 */
describe('isSensitiveThrottledRoute (N47)', () => {
  const contextFor = (handler: object, cls: object): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => cls,
    }) as unknown as ExecutionContext;

  @SensitiveThrottle()
  class MarkedController {
    send(): void {}
  }

  class PlainController {
    @SensitiveThrottle()
    login(): void {}

    profile(): void {}
  }

  it('클래스 데코레이터가 붙은 컨트롤러의 모든 핸들러는 sensitive다', () => {
    const ctx = contextFor(MarkedController.prototype.send, MarkedController);
    expect(isSensitiveThrottledRoute(ctx)).toBe(true);
  });

  it('핸들러 데코레이터가 붙은 라우트만 sensitive다', () => {
    const marked = contextFor(PlainController.prototype.login, PlainController);
    const plain = contextFor(
      PlainController.prototype.profile,
      PlainController,
    );
    expect(isSensitiveThrottledRoute(marked)).toBe(true);
    expect(isSensitiveThrottledRoute(plain)).toBe(false);
  });
});
