import { ConfigService } from '@nestjs/config';
import { WeatherWarmupService } from './weather-warmup.service';
import { WeatherService } from './weather.service';

/**
 * WeatherWarmupService 단위 테스트 (N25).
 * 부팅 직후 기본 지역 날씨를 1회 수집해 응답 캐시를 워밍하는지 검증한다.
 * - test 환경 / collector 비활성화 시 워밍하지 않는다.
 * - 지연 후 getCurrentWeather를 정확히 1회 호출한다.
 * - 실패해도 예외를 밖으로 던지지 않는다(fire-and-forget).
 */
describe('WeatherWarmupService', () => {
  function makeConfig(over: Record<string, string> = {}): ConfigService {
    const map: Record<string, string> = {
      NODE_ENV: 'development',
      WEATHER_COLLECTOR_ENABLED: 'true',
      ...over,
    };
    return {
      get: (key: string, def?: string) => map[key] ?? def,
    } as unknown as ConfigService;
  }

  function makeService(
    weather: { getCurrentWeather: jest.Mock },
    config: ConfigService,
  ): WeatherWarmupService {
    return new WeatherWarmupService(
      weather as unknown as WeatherService,
      config,
    );
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('NODE_ENV=test면 워밍하지 않는다', () => {
    jest.useFakeTimers();
    const weather = { getCurrentWeather: jest.fn() };
    const service = makeService(weather, makeConfig({ NODE_ENV: 'test' }));
    service.onModuleInit();
    jest.advanceTimersByTime(5_000);
    expect(weather.getCurrentWeather).not.toHaveBeenCalled();
  });

  it('WEATHER_COLLECTOR_ENABLED=false면 워밍하지 않는다 (정부 API 호출 절약)', () => {
    jest.useFakeTimers();
    const weather = { getCurrentWeather: jest.fn() };
    const service = makeService(
      weather,
      makeConfig({ WEATHER_COLLECTOR_ENABLED: 'false' }),
    );
    service.onModuleInit();
    jest.advanceTimersByTime(5_000);
    expect(weather.getCurrentWeather).not.toHaveBeenCalled();
  });

  it('부팅 후 1초 뒤 기본 지역 날씨를 정확히 1회 수집한다', () => {
    jest.useFakeTimers();
    const weather = {
      getCurrentWeather: jest
        .fn()
        .mockResolvedValue({ source: 'LIVE', regionName: '서울특별시' }),
    };
    const service = makeService(weather, makeConfig({}));
    service.onModuleInit();

    jest.advanceTimersByTime(999);
    expect(weather.getCurrentWeather).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(weather.getCurrentWeather).toHaveBeenCalledTimes(1);
    expect(weather.getCurrentWeather).toHaveBeenCalledWith();
  });

  it('워밍 실패(외부 API 다운)해도 예외를 밖으로 던지지 않는다', async () => {
    jest.useFakeTimers();
    const weather = {
      getCurrentWeather: jest.fn().mockRejectedValue(new Error('gov api down')),
    };
    const service = makeService(weather, makeConfig({}));
    service.onModuleInit();

    jest.advanceTimersByTime(2_000);
    // fire-and-forget 내부에서 실패를 삼키므로 여기까지 도달하면 성공이다.
    await Promise.resolve();
    expect(weather.getCurrentWeather).toHaveBeenCalledTimes(1);
  });
});
