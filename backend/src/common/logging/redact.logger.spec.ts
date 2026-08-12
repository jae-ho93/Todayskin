import {
  maskPhoneNumber,
  maskBirthDate,
  maskJwtToken,
  maskCoordinates,
  maskApiKeys,
  maskSensitiveData,
  maskMetadataDeep,
} from './redact.logger';

describe('민감정보 마스킹', () => {
  describe('maskPhoneNumber', () => {
    it('하이픈 없는 전화번호 마스킹', () => {
      expect(maskPhoneNumber('01012345678')).toBe('010****5678');
    });

    it('하이픈 있는 전화번호 마스킹', () => {
      expect(maskPhoneNumber('010-1234-5678')).toBe('010****5678');
    });

    it('문자열 내 전화번호 마스킹', () => {
      const result = maskPhoneNumber('사용자 전화번호는 01012345678 입니다');
      expect(result).toBe('사용자 전화번호는 010****5678 입니다');
    });

    it('전화번호가 없으면 원본 반환', () => {
      expect(maskPhoneNumber('전화번호 없음')).toBe('전화번호 없음');
    });
  });

  describe('maskBirthDate', () => {
    it('생년월일 마스킹 (월/일만)', () => {
      expect(maskBirthDate('1990-01-15')).toBe('1990-**-**');
    });

    it('문자열 내 생년월일 마스킹', () => {
      const result = maskBirthDate('생일: 2000-12-25 입니다');
      expect(result).toBe('생일: 2000-**-** 입니다');
    });
  });

  describe('maskJwtToken', () => {
    it('JWT 토큰 마스킹', () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = maskJwtToken(`Bearer ${token}`);
      expect(result).toBe('Bearer [REDACTED_JWT]');
    });
  });

  describe('maskCoordinates', () => {
    it('좌표 마스킹 (소수점 이후)', () => {
      const result = maskCoordinates('위도 37.5665 경도 126.9780');
      expect(result).toContain('37.[REDACTED]');
      expect(result).toContain('126.[REDACTED]');
    });
  });

  describe('maskApiKeys (R2)', () => {
    it('쿼리스트링 key 마스킹', () => {
      const result = maskApiKeys(
        'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=AIzaSyRealSecret',
      );
      expect(result).toContain('?key=[REDACTED]');
      expect(result).not.toContain('AIzaSyRealSecret');
    });

    it('헤더 표기의 API key 값 마스킹', () => {
      expect(maskApiKeys('x-goog-api-key: AIzaSyRealSecret')).toBe(
        'x-goog-api-key: [REDACTED]',
      );
      expect(maskApiKeys('x-inference-key=shared-secret-value')).toBe(
        'x-inference-key=[REDACTED]',
      );
    });

    it('key가 없으면 원본 반환', () => {
      expect(maskApiKeys('Gemini request failed: HTTP 500')).toBe(
        'Gemini request failed: HTTP 500',
      );
    });
  });

  describe('maskSensitiveData (통합)', () => {
    it('API key도 함께 마스킹된다', () => {
      const result = maskSensitiveData(
        'Gemini 호출 실패: POST https://x/y?key=AIzaSyRealSecret (x-goog-api-key: AIzaSyRealSecret)',
      );
      expect(result).not.toContain('AIzaSyRealSecret');
    });

    it('모든 민감정보를 한 번에 마스킹', () => {
      const input = '전화: 01012345678, 생일: 1990-01-15, 토큰: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature123, 좌표: 37.5665';
      const result = maskSensitiveData(input);
      expect(result).toContain('010****5678');
      expect(result).toContain('1990-**-**');
      expect(result).toContain('[REDACTED_JWT]');
      expect(result).toContain('37.[REDACTED]');
      // 원본 민감정보가 노출되지 않아야 함
      expect(result).not.toContain('12345678');
      expect(result).not.toContain('01-15');
      expect(result).not.toContain('eyJhbGci');
    });

    it('민감정보가 없으면 원본 반환', () => {
      expect(maskSensitiveData('일반 메시지입니다')).toBe('일반 메시지입니다');
    });
  });

  // N48: 감사 로그 metadata 저장 직전에 강제되는 재귀 마스킹.
  describe('maskMetadataDeep', () => {
    it('중첩 객체·배열 안의 문자열 패턴을 마스킹한다', () => {
      const result = maskMetadataDeep({
        note: '전화 01012345678',
        nested: { list: ['생일 1990-01-15'] },
      }) as { note: string; nested: { list: string[] } };

      expect(result.note).toBe('전화 010****5678');
      expect(result.nested.list[0]).toBe('생일 1990-**-**');
    });

    it('민감 키는 패턴이 못 잡는 값이어도 통째로 가린다', () => {
      const result = maskMetadataDeep({
        refreshToken: 'opaque-random-value',
        otpCode: 123456,
        phoneNumber: '01012345678',
      }) as Record<string, unknown>;

      expect(result.refreshToken).toBe('[REDACTED]');
      expect(result.otpCode).toBe('[REDACTED]');
      // 패턴이 잡는 값은 부분 마스킹을 유지해 추적 가능성을 남긴다.
      expect(result.phoneNumber).toBe('010****5678');
    });

    it('statusCode 같은 일반 키는 건드리지 않는다', () => {
      const result = maskMetadataDeep({
        statusCode: 404,
        from: 'USER',
        to: 'ADMIN',
        imagesDeleted: 3,
      });

      expect(result).toEqual({
        statusCode: 404,
        from: 'USER',
        to: 'ADMIN',
        imagesDeleted: 3,
      });
    });

    it('원본 객체를 변경하지 않는다', () => {
      const original = { phoneNumber: '01012345678' };
      maskMetadataDeep(original);
      expect(original.phoneNumber).toBe('01012345678');
    });

    it('과도한 중첩은 잘라낸다 (순환·폭탄 방어)', () => {
      let nested: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 12; i += 1) nested = { child: nested };

      const json = JSON.stringify(maskMetadataDeep(nested));
      expect(json).toContain('[REDACTED_DEPTH]');
    });
  });
});
