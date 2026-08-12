import {
  EVIDENCE_SOURCES,
  findEvidenceSource,
  resolveEvidenceSources,
} from './evidence-sources';
import { TEMPLATES } from '../../../../prisma/seed-data';

/**
 * N45: 출처 레지스트리 규칙을 강제한다.
 *
 * 이 테스트의 목적은 "A등급인데 근거가 없는 상태"가 조용히 배포되는 걸 막는 것이다.
 * 화면에 `A · 공인 가이드라인`이라고 뜨는데 가리킬 문서가 없으면 그 등급 자체가
 * 과장이므로, 레지스트리와 시드가 어긋나는 순간 CI에서 깨져야 한다.
 */
describe('EVIDENCE_SOURCES 레지스트리', () => {
  it('id가 중복되지 않는다', () => {
    const ids = EVIDENCE_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 항목이 확인 가능한 형태를 갖춘다 — 기관·연도·https URL', () => {
    for (const source of EVIDENCE_SOURCES) {
      expect(source.title.length).toBeGreaterThan(0);
      expect(source.publisher.length).toBeGreaterThan(0);
      expect(source.year).toBeGreaterThan(1990);
      expect(source.url).toMatch(/^https:\/\//);
      // claim은 "원문이 실제로 말하는 범위"라 비어 있으면 검토 기준이 사라진다.
      expect(source.claim.length).toBeGreaterThan(0);
    }
  });

  it('없는 id는 조용히 버린다 — 미확인 출처를 화면에 내보내지 않는다', () => {
    expect(resolveEvidenceSources(['who-uv-index-2002', 'made-up-id'])).toEqual([
      findEvidenceSource('who-uv-index-2002'),
    ]);
  });

  it('빈 목록은 빈 배열이 된다', () => {
    expect(resolveEvidenceSources([])).toEqual([]);
  });
});

describe('추천 템플릿의 근거 연결', () => {
  it('A등급 템플릿은 실제 참조를 최소 1개 가진다', () => {
    const aGrade = TEMPLATES.filter((t) => t.grade === 'A');
    expect(aGrade.length).toBeGreaterThan(0);

    for (const template of aGrade) {
      expect(resolveEvidenceSources(template.sourceIds).length).toBeGreaterThan(0);
    }
  });

  it('시드가 참조하는 id는 모두 레지스트리에 있다', () => {
    for (const template of TEMPLATES) {
      for (const id of template.sourceIds) {
        expect(findEvidenceSource(id)).toBeDefined();
      }
    }
  });
});
