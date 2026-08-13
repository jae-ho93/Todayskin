import { EvidencePolicy } from './evidence.policy';

/**
 * EvidencePolicy 단위 테스트 (T8).
 * 의료적 확정 표현/허위 인용 위반을 정확히 감지하고, 정상 텍스트는 통과시키는지 검증.
 */
describe('EvidencePolicy', () => {
  const policy = new EvidencePolicy();

  describe('validateRecommendations', () => {
    it('정상 텍스트는 통과', () => {
      const result = policy.validateRecommendations([
        {
          title: '오늘은 이중 세안을 권장해요',
          explanation: '초미세먼지 노출로 잔여 오염물질 제거에 도움될 수 있어요.',
        },
      ]);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('title에 의료 확정 표현이 있으면 위반', () => {
      const result = policy.validateRecommendations([
        { title: '피부 질환 진단 결과', explanation: '정상 설명' },
      ]);
      expect(result.ok).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].field).toBe('title');
    });

    it('explanation에 의료 확정 표현이 있으면 위반', () => {
      const result = policy.validateRecommendations([
        { title: '정상 제목', explanation: '이 성분은 치료에 도움됩니다.' },
      ]);
      expect(result.ok).toBe(false);
      expect(result.violations[0].field).toBe('explanation');
      expect(result.violations[0].term).toBe('치료');
    });

    it('허위 인용 표현(논문/학회)이 있으면 위반', () => {
      const result = policy.validateRecommendations([
        { title: '정상', explanation: '한 연구결과에 따르면 보습에 도움됩니다.' },
      ]);
      expect(result.ok).toBe(false);
      expect(result.violations[0].term).toBe('연구결과');
    });

    it('여러 위반이 섞여도 모두 감지', () => {
      const result = policy.validateRecommendations([
        { title: '진단 필요', explanation: '치료 효과 있음' },
      ]);
      expect(result.ok).toBe(false);
      // title/explanation 각각 1건씩 위반
      expect(result.violations).toHaveLength(2);
    });

    it('빈 배열은 통과', () => {
      const result = policy.validateRecommendations([]);
      expect(result.ok).toBe(true);
    });

    it('null/undefined 텍스트는 통과(빈 취급)', () => {
      const result = policy.validateRecommendations([
        { title: undefined, explanation: null },
      ]);
      expect(result.ok).toBe(true);
    });
  });

  describe('validateWeatherProducts', () => {
    it('정상 제품 설명은 통과', () => {
      const result = policy.validateWeatherProducts([
        { explanation: '오늘 미세먼지 수치가 보통이라 보습에 도움될 수 있어요.' },
      ]);
      expect(result.ok).toBe(true);
    });

    it('제품 설명에 의료 표현이 있으면 위반', () => {
      const result = policy.validateWeatherProducts([
        { explanation: '이 제품은 염증 치료에 효과적입니다.' },
      ]);
      expect(result.ok).toBe(false);
      expect(result.violations[0].field).toBe('explanation');
    });

    it('빈 배열은 통과', () => {
      const result = policy.validateWeatherProducts([]);
      expect(result.ok).toBe(true);
    });
  });
});
