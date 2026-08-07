import type { ConsentPurpose } from '../types';

// 온보딩 동의 화면(consent.tsx)에서 고른 선택을, 뒤이은 위치 권한 화면을 거쳐 회원가입
// 화면(signup.tsx)까지 들고 간다. 동의 등록 API(POST /consents)는 로그인 상태여야 호출할 수
// 있어서 — 가입 전엔 토큰이 없으므로 — 가입이 성공해 토큰을 받은 직후에야 실제로 전송한다.
// 화면 전환이 항상 이 순서(consent → location → signup)로만 일어나는 선형 마법사라 전역 상태
// 없이 모듈 레벨 변수로 충분하다.
let pending: Partial<Record<ConsentPurpose, boolean>> = {};

export function setPendingConsent(purpose: ConsentPurpose, agreed: boolean) {
  pending = { ...pending, [purpose]: agreed };
}

export function getPendingConsents(): Partial<Record<ConsentPurpose, boolean>> {
  return pending;
}

export function clearPendingConsents() {
  pending = {};
}
