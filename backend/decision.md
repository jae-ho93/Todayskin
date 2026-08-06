# Todayskin Backend Decision Register

백엔드 엔지니어링 관점에서 결정이 필요한 항목. 아키텍처 원칙(docs/ARCHITECTURE.md)과
이미 코드에 반영된 사항은 제외했다. 아래 4개는 2026-08-07에 전부 확정되었다.

| 항목 | 결정 | 요약 |
|---|---|---|
| T2-03 삭제/Soft Delete | Option B | User·Diagnosis에 Soft Delete + 보존 기간, 개인정보/이미지는 물리 삭제, 진단 결과는 익명화 후 보존, FK 정책 표 확정 |
| T3-04 OTP/본인확인 | Option B | 가입·새 디바이스 로그인에 OTP 필수(운영 공개 전). 개발은 allowlisted test phone/mock OTP, 운영은 실제 OTP + 시도/만료/재전송 제한 |
| T3-05 Role/Permission | 추천안 | 현재 Role 기반 유지, ADMIN endpoint 만들 때 @Roles(Role.ADMIN) + 감사 로그, 3개+ 독립 action 시 Permission 도입 |
| T9-03 Consent | Option B | 목적 enum/registry(diagnosis_image_processing, diagnosis_image_storage, ai_recommendation_data_transfer), 필수 동의 version 없으면 기능 거부, 철회/보존 별도 정책, audit 대상. storage는 S3 저장 게이트(선택) |

## N6 Soft Delete / FK / Health / Pagination (2026-08-08 구현)

### Soft Delete 보존

- 기본 보존 기간: `SOFT_DELETE_RETENTION_DAYS=30`
- 탈퇴(`POST /auth/withdraw` 또는 ADMIN soft-delete) 시:
  1. 원본 이미지 물리 삭제
  2. Diagnosis Soft Delete + `anonymizedAt` + thumbnail 제거
  3. User PII 즉시 스크럽(phone/name/birthDate/gender) + `deletedAt`/`purgeAfter`
  4. RefreshSession 전부 revoke
- purge job(`SOFT_DELETE_PURGE_INTERVAL_MS`, ADMIN `POST /admin/purge`):
  - `purgeAfter` 경과 User 물리 삭제
  - Diagnosis.userId는 `onDelete: SetNull`로 익명 법적 보존

### FK onDelete 정책

`prisma/schema.prisma` 상단 표 참고. 핵심:

- Diagnosis.user = SetNull (익명 보존)
- AuditLog.actor = SetNull
- RefreshSession/Consent/Notification/AsyncJob/Recommendation.user = Cascade
- Recommendation.template = Restrict
- Diagnosis.weatherSnapshot = SetNull

### Health

- `GET /health` 호환 유지
- `GET /health/live` — process liveness
- `GET /health/ready` — DB·migrations·required config 필수, Redis는 선택(다운 시 degraded)

### Cursor pagination

- `GET /diagnosis/history`, `GET /recommendations`, `GET /products`
- `limit` 미지정: 기존 배열 응답(호환)
- `limit`(+`cursor`) 지정: `{ items, nextCursor }`

### Env registry

- `src/config/env.registry.ts` — owner/description/required/safeDefault/secret/mockFlag/expiry
- production: mock flag truthy 거부, `APP_ENV_KEYS` 선언 시 unknown key 거부
