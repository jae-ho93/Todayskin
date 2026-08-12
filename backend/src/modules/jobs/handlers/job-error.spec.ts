import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
  optionalNumber,
  optionalObject,
  optionalString,
  toJobError,
} from './job-error';

describe('job-error (R12)', () => {
  describe('toJobError', () => {
    it('HttpException은 상태 코드 대신 메시지를 남긴다', () => {
      const error = toJobError(new ServiceUnavailableException('Gemini 응답 없음'));

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Gemini 응답 없음');
    });

    it('검증 실패처럼 message가 배열이면 이어 붙인다', () => {
      const error = toJobError(new BadRequestException(['a는 필수', 'b는 숫자']));

      expect(error.message).toBe('a는 필수, b는 숫자');
    });

    it('Error가 아닌 값도 Error로 감싼다', () => {
      expect(toJobError('boom').message).toBe('boom');
    });
  });

  describe('payload 검증', () => {
    it('없거나 null이면 undefined다 (선택 필드)', () => {
      expect(optionalString({}, 'diagnosisId')).toBeUndefined();
      expect(optionalString({ diagnosisId: null }, 'diagnosisId')).toBeUndefined();
      expect(optionalNumber({}, 'lat')).toBeUndefined();
      expect(optionalObject({}, 'weather')).toBeUndefined();
    });

    it('타입이 맞으면 값을 그대로 돌려준다', () => {
      expect(optionalString({ kind: 'daily' }, 'kind')).toBe('daily');
      expect(optionalNumber({ lat: 37.5 }, 'lat')).toBe(37.5);
      expect(optionalObject({ weather: { uvIndex: 3 } }, 'weather')).toEqual({ uvIndex: 3 });
    });

    it('타입이 어긋나면 진입점에서 실패한다', () => {
      // 큐를 거쳐 온 JSON은 타입 보장이 없다. 단언만 하고 넘기면 도메인 서비스
      // 깊은 곳에서 터져 원인 파악이 어려워진다.
      expect(() => optionalString({ diagnosisId: 12 }, 'diagnosisId')).toThrow(
        '잡 payload의 diagnosisId는 문자열이어야 합니다',
      );
      expect(() => optionalNumber({ lat: '37.5' }, 'lat')).toThrow(
        '잡 payload의 lat는 숫자여야 합니다',
      );
      expect(() => optionalNumber({ lat: Number.NaN }, 'lat')).toThrow();
      expect(() => optionalObject({ weather: [1, 2] }, 'weather')).toThrow(
        '잡 payload의 weather는 객체여야 합니다',
      );
    });
  });
});
