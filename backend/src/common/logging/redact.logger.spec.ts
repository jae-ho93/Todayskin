import {
  maskPhoneNumber,
  maskBirthDate,
  maskJwtToken,
  maskCoordinates,
  maskSensitiveData,
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

  describe('maskSensitiveData (통합)', () => {
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
});
