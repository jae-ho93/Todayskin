/**
 * N45: 근거 출처 레지스트리.
 *
 * 기존에는 `sourceLabel`이라는 자유 문자열 하나가 출처 역할을 했다. 문자열은
 * 무엇이든 주장할 수 있어서 "피부과학 일반 지식 기반"처럼 **출처가 없다는 말을
 * 완곡하게 쓴 문구**가 출처 칸에 들어가 있었다. 확인할 방법이 없는 표기는
 * 없는 것보다 나쁘다 — 사용자는 근거가 있다고 읽는다.
 *
 * 그래서 출처를 발행기관·연도·URL을 가진 레코드로 만들고, 추천은 그 id만
 * 참조한다. 여기 없는 출처는 화면에 뜰 수 없다.
 *
 * **여기 등록하는 항목은 사람이 원문을 확인한 것만이다.** LLM이 이 레지스트리에
 * 항목을 추가하거나 자유 텍스트로 인용을 만들지 못하게 하는 것이 이 구조의 목적이다.
 * `claim`에는 원문이 실제로 말하는 범위를 적는다 — 추천 문구가 그 범위를 넘으면
 * 출처가 뒷받침하지 못한다는 뜻이다.
 */
export interface EvidenceSource {
  id: string;
  /** 문서 제목 (원문 표기). */
  title: string;
  /** 발행기관. */
  publisher: string;
  /** 발행연도. 개정되는 웹 기준은 최초 게시 연도가 아니라 확인 연도를 쓴다. */
  year: number;
  url: string;
  /** 이 문서가 실제로 뒷받침하는 범위. 추천 문구를 검토할 때의 기준선. */
  claim: string;
}

export const EVIDENCE_SOURCES: readonly EvidenceSource[] = [
  {
    id: 'who-uv-index-2002',
    title: 'Global Solar UV Index: A Practical Guide (WHO/SDE/OEH/02.2)',
    publisher: 'World Health Organization',
    year: 2002,
    url: 'https://www.who.int/publications/i/item/9241590076',
    claim:
      '자외선지수 3 이상에서 차단이 필요하고 8 이상에서 강화해야 하며, SPF 15+ 광범위 차단제를 충분히 바르고 덧바를 것을 권고한다. 자외선 노출은 피부 노화를 앞당긴다.',
  },
  {
    id: 'kma-uv-index-grade',
    title: '생활기상지수 — 자외선지수 단계별 대응요령',
    publisher: '기상청',
    year: 2026,
    url: 'https://www.weather.go.kr/w/forecast/life/index-info.do',
    claim:
      '자외선지수를 낮음(3 미만)·보통(3~5)·높음(6~7)·매우높음(8~10)·위험(11 이상) 5단계로 구분하고 단계별 대응요령을 제시한다. 보통 단계부터 차단제를 바르고, 높음 이상에서는 정기적으로 덧바를 것을 권고한다.',
  },
  {
    id: 'airkorea-cai-grade',
    title: '통합대기환경지수(CAI) 산출 기준',
    publisher: '한국환경공단 에어코리아',
    year: 2026,
    url: 'https://www.airkorea.or.kr/web/khaiInfo?pMENU_NO=129',
    claim:
      '통합대기환경지수를 좋음(0~50)·보통(51~100)·나쁨(101~250)·매우나쁨(251 이상) 4단계로 구분한다. 대기오염물질 6종 중 가장 높은 지수를 통합 지수로 사용한다.',
  },
] as const;

const BY_ID = new Map(EVIDENCE_SOURCES.map((s) => [s.id, s]));

export function findEvidenceSource(id: string): EvidenceSource | undefined {
  return BY_ID.get(id);
}

/**
 * id 목록을 출처 레코드로 바꾼다. 레지스트리에 없는 id는 조용히 버린다 —
 * 확인되지 않은 출처를 화면에 내보내는 것보다 출처 없음으로 보이는 편이 낫다.
 *
 * OpenAI 마이그레이션: Recommendation.sourceIds는 DB 기본값이 `[]`이지만,
 * 이 컬럼이 생기기 전에 만들어진 목(mock) fixture나 부분 객체는 필드 자체가
 * 없을 수 있다 — undefined/null도 빈 배열로 다룬다.
 */
export function resolveEvidenceSources(ids: string[] | null | undefined): EvidenceSource[] {
  return (ids ?? [])
    .map((id) => BY_ID.get(id))
    .filter((s): s is EvidenceSource => s !== undefined);
}
