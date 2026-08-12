import { JobType } from './enums/job-type.enum';

/**
 * R10: 중복 enqueue 방지 키.
 *
 * 이전에는 `payload: { path: ['diagnosisId'], equals: ... }`로 JSON 경로를 비교했다.
 * 이 비교는 후보 행마다 평가되므로 `async_jobs`가 커지면 그대로 느려진다.
 * (fast path는 홈 화면 진입마다 이 쿼리를 탄다.)
 *
 * 키를 만드는 곳과 찾는 곳이 갈라지면 "쓸 때는 A, 찾을 때는 B" 같은 조용한 dedupe
 * 실패가 생긴다. 그래서 job 종류 → payload 키 매핑을 여기 한 곳에만 두고,
 * enqueue와 조회가 같은 함수를 쓴다.
 */
const DEDUPE_PAYLOAD_KEY: Partial<Record<JobType, string>> = {
  [JobType.RECOMMENDATION_GENERATE]: 'diagnosisId',
  [JobType.WEATHER_PRODUCTS_GENERATE]: 'regionKey',
};

/**
 * payload에서 dedupe 키를 뽑는다. 해당 job 종류에 dedupe 대상이 없거나
 * payload에 값이 없으면(예: diagnosisId 없이 skinScore+weather를 직접 보낸 호환 경로)
 * null — 이 경우 dedupe 없이 매번 새 job을 만든다(기존 동작과 같다).
 */
export function buildJobDedupeKey(
  type: JobType,
  payload: Record<string, unknown> | null | undefined,
): string | null {
  const payloadKey = DEDUPE_PAYLOAD_KEY[type];
  if (!payloadKey || !payload) return null;
  const value = payload[payloadKey];
  if (typeof value !== 'string' || value.length === 0) return null;
  return `${payloadKey}:${value}`;
}

/** 조회 측에서 값만 알고 있을 때 같은 형식의 키를 만든다. */
export function jobDedupeKeyOf(payloadKey: string, value: string): string {
  return `${payloadKey}:${value}`;
}
