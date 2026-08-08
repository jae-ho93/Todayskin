# Todayskin Backend Decision Register

아키텍처 원칙은 `docs/ARCHITECTURE.md`, Task·완료 기록은 `docs/BACKEND_TASKS.md` /
`docs/FRONTEND_TASKS.md`를 본다. 구현 세부(Soft Delete·캘린더·landmarks·N10 등)는
코드·스키마·해당 Task 섹션이 기준이며, 여기에 다시 적지 않는다.

## 확정 결정 (요약)

| 항목 | 결정 |
|---|---|
| Soft Delete (T2-03) | User·Diagnosis Soft Delete + 보존 기간. 개인정보/이미지는 물리 삭제, 진단은 익명 보존 |
| OTP (T3-04) | 가입·새 디바이스 OTP 필수. 개발 mock/allowlist, 운영 알리고 SMS |
| Role (T3-05) | Role 기반 유지. 3개+ 독립 action 시 Permission 검토 |
| Consent (T9-03) | 목적 enum/registry. 필수 version 없으면 기능 거부. storage는 S3 게이트 |
| 제품 | 실제품 + `purchaseUrl`만. 허구 시드·가상 `gemini-product-*`·크롤링 금지 |
| 추천 | `rec-fast-path`: CACHED / FALLBACK 즉시 → job 후 LIVE |
| 인증 | 전화+OTP + Kakao/Google/Apple. 비밀번호·아이디/비번 찾기 없음 |
| 설정(FE) | F16 전면 재구성. 가짜 구독 카드 삭제. `pushDeliveryAvailable`로 거짓 토글 방지 |

## 아직 열린 항목

- **N16** — AWS 운영 리소스 프로비저닝·첫 배포 (계정·시크릿·승인자 준비 후, FE 웨이브와 분리)
- **푸시 실발송** — `PUSH_DELIVERY_AVAILABLE` 기본 false. FCM/APNs 연동 시 배포에서 true
- **구독 결제 / EAS** — 범위 미정·보류 (`docs/FRONTEND_TASKS.md` F11·F12)
