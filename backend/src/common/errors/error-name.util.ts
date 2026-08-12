/**
 * R23: 로그용 에러 요약 헬퍼.
 *
 * 같은 함수가 7개 파일에 복제돼 있었고, 그 사이에 차이가 하나 생겼다 —
 * `diagnosis.service.ts`만 `e.name` 대신 `e.message`를 반환했다. 이름은 같은데
 * 출력이 다르면 로그를 읽는 쪽이 형식을 신뢰할 수 없으므로, 두 의도를 각각
 * 다른 이름으로 노출한다.
 */

/** 에러 타입 이름만 남긴다. 메시지에 섞일 수 있는 사용자 입력·URL을 로그에 흘리지 않는다. */
export function errorName(e: unknown): string {
  return e instanceof Error ? e.name : String(e);
}

/** 원인 파악에 메시지가 필요한 경로에서 쓴다(외부 API 응답 등). */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
