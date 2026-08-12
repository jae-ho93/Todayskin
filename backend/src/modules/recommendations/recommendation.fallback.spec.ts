import { Product } from '@prisma/client';
import {
  buildRuleRecommendations,
  pickMatchlessProducts,
  pickRuleProducts,
  ruleWeatherPhrase,
} from './recommendation.fallback';
import {
  FALLBACK_SOURCE_LABEL,
  WEATHER_PHRASE_UNAVAILABLE,
} from './content/fallback-content';
import { EvidenceGrade } from './enums/evidence-grade.enum';

/**
 * R7: 규칙 기반 선택은 순수 함수라 Prisma·Redis·Gemini 목킹 없이 검증한다.
 * 이전에는 같은 로직을 확인하려면 서비스 전체를 부팅해야 했다.
 */
describe('recommendation.fallback', () => {
  const product = (over: Partial<Product>): Product =>
    ({
      id: 'prod-1',
      name: '제품',
      brand: '브랜드',
      imageUri: null,
      purchaseUrl: null,
      matchedGrade: EvidenceGrade.B,
      matchedIngredients: ['히알루론산'],
      category: 'moisture',
      reason: null,
      timing: null,
      createdAt: new Date(),
      ...over,
    }) as Product;

  describe('pickRuleProducts', () => {
    it('A등급을 먼저, 같은 등급이면 카테고리 우선순위대로 고른다', () => {
      const catalog = [
        product({ id: 'b-barrier', matchedGrade: EvidenceGrade.B, category: 'barrier' }),
        product({ id: 'a-moisture', matchedGrade: EvidenceGrade.A, category: 'moisture' }),
        product({ id: 'b-moisture', matchedGrade: EvidenceGrade.B, category: 'moisture' }),
      ];

      const picked = pickRuleProducts(catalog, ['barrier', 'moisture'], new Set(), 3);

      expect(picked.map((p) => p.id)).toEqual(['a-moisture', 'b-barrier', 'b-moisture']);
    });

    it('이미 쓴 제품은 제외하고 count만큼만 반환한다', () => {
      const catalog = [
        product({ id: 'p1' }),
        product({ id: 'p2' }),
        product({ id: 'p3' }),
      ];

      const picked = pickRuleProducts(catalog, ['moisture'], new Set(['p1']), 1);

      expect(picked.map((p) => p.id)).toEqual(['p2']);
    });

    it('우선순위에 없는 카테고리는 뒤로 밀린다', () => {
      const catalog = [
        product({ id: 'unknown', category: 'elasticity' }),
        product({ id: 'known', category: 'moisture' }),
      ];

      const picked = pickRuleProducts(catalog, ['moisture'], new Set(), 2);

      expect(picked.map((p) => p.id)).toEqual(['known', 'unknown']);
    });
  });

  describe('pickMatchlessProducts', () => {
    it("'외출 후'는 barrier를 먼저 본다", () => {
      const catalog = [
        product({ id: 'moisture', category: 'moisture' }),
        product({ id: 'barrier', category: 'barrier' }),
      ];

      const picked = pickMatchlessProducts(catalog, '외출 후', new Set(), 1);

      expect(picked.map((p) => p.id)).toEqual(['barrier']);
    });

    it('그 밖의 timing은 moisture를 먼저 본다', () => {
      const catalog = [
        product({ id: 'barrier', category: 'barrier' }),
        product({ id: 'moisture', category: 'moisture' }),
      ];

      const picked = pickMatchlessProducts(catalog, '자기 전', new Set(), 1);

      expect(picked.map((p) => p.id)).toEqual(['moisture']);
    });
  });

  describe('ruleWeatherPhrase', () => {
    it('존재하는 수치만 언급한다', () => {
      expect(ruleWeatherPhrase({ uvIndex: 7, pm25: 30 })).toBe(
        '자외선지수 7, 미세먼지 30',
      );
    });

    it('수치가 하나도 없으면 측정 불가로 표기한다 (값을 지어내지 않는다)', () => {
      expect(ruleWeatherPhrase({ uvIndex: null })).toBe(WEATHER_PHRASE_UNAVAILABLE);
    });
  });

  describe('buildRuleRecommendations', () => {
    const catalog = [
      product({ id: 'p1', category: 'barrier', matchedIngredients: ['판테놀'] }),
      product({ id: 'p2', category: 'moisture', matchedIngredients: ['히알루론산'] }),
    ];

    it('세 timing 슬롯을 만들고 제품을 중복 없이 배분한다', () => {
      const recs = buildRuleRecommendations(catalog, {}, {});

      expect(recs.map((r) => r.timing)).toEqual(['외출 후', '자기 전', '언제든']);
      // 카탈로그 2건이 첫 슬롯에서 모두 쓰이면 나머지 슬롯은 제품 없이 남는다.
      expect(recs[0].relatedProductIds).toEqual(['p1', 'p2']);
      expect(recs[1].relatedProductIds).toEqual([]);
    });

    it('AI 결과가 아님을 sourceLabel로 명시하고 관측 노트를 비운다', () => {
      const [rec] = buildRuleRecommendations(catalog, {}, {});

      expect(rec.sourceLabel).toBe(FALLBACK_SOURCE_LABEL);
      expect(rec.grade).toBe(EvidenceGrade.B);
      expect(rec.observationalNote).toBeNull();
      expect(rec.id.startsWith('fast-')).toBe(true);
    });

    it('측정 점수가 있으면 설명에 반영하고, 없으면 생략한다', () => {
      const withScore = buildRuleRecommendations(catalog, { overallScore: 72.4 }, {});
      const withoutScore = buildRuleRecommendations(catalog, {}, {});

      expect(withScore[0].explanation).toContain('측정 점수 72점');
      expect(withoutScore[0].explanation).not.toContain('측정 점수');
    });

    it('날씨 수치를 설명 문구에 넣는다', () => {
      const recs = buildRuleRecommendations(catalog, {}, { uvIndex: 7 });

      expect(recs[0].explanation).toContain('자외선지수 7');
    });
  });
});
