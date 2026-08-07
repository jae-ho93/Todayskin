# Todayskin Backend Decision Register

백엔드 엔지니어링 관점에서 결정이 필요한 항목. 아키텍처 원칙(docs/ARCHITECTURE.md)과
이미 코드에 반영된 사항은 제외했다. 아래 4개는 2026-08-07에 전부 확정되었다.

| 항목 | 결정 | 요약 |
|---|---|---|
| T2-03 삭제/Soft Delete | Option B | User·Diagnosis에 Soft Delete + 보존 기간, 개인정보/이미지는 물리 삭제, 진단 결과는 익명화 후 보존, FK 정책 표 확정 |
| T3-04 OTP/본인확인 | Option B | 가입·새 디바이스 로그인에 OTP 필수(운영 공개 전). 개발은 allowlisted test phone/mock OTP, 운영은 실제 OTP + 시도/만료/재전송 제한 |
| T3-05 Role/Permission | 추천안 | 현재 Role 기반 유지, ADMIN endpoint 만들 때 @Roles(Role.ADMIN) + 감사 로그, 3개+ 독립 action 시 Permission 도입 |
| T9-03 Consent | Option B | 목적 enum/registry(diagnosis_image_processing, diagnosis_image_storage, ai_recommendation_data_transfer), 필수 동의 version 없으면 기능 거부, 철회/보존 별도 정책, audit 대상. storage는 S3 저장 게이트(선택) |

## 이미지 저장 실패 정합성 (2026-08-06 점검)

- 운영은 `S3_BUCKET` 필수이며, 누락 시 서버 시작을 거부한다. 개인정보 이미지의 Memory fallback은 개발·테스트에서만 허용한다.
- 객체 업로드 후 DB metadata transaction이 실패하면 방금 업로드한 객체를 보상 삭제한다.
- 철회·탈퇴 중 S3 삭제가 실패하면 `DiagnosisImage`를 삭제 처리하지 않고 참조를 유지한 채 503을 반환한다. 이후 같은 철회·탈퇴 또는 운영 재처리가 다시 삭제할 수 있어야 한다.
- 대규모 장애 뒤 orphan 탐지·재처리 worker는 N10 후속 작업으로 분리한다.

## 운영 공개 전 미완료 결정 이행

- OTP 생성·검증·소비와 제한 정책은 구현되어 있다.
- 운영 `SmsOtpProvider`는 N9에서 알리고 게이트웨이 HTTP 호출로 구현 완료되었고, N22에서 번호별 일일 발송 한도와 코드 해시 저장으로 강화했다.
- HTTP Rate Limit은 N11에서 Redis 기반 분산 저장소(`RedisThrottlerStorage`)로 전환 완료했다.
- 남은 것은 N16(실제 AWS 리소스 프로비저닝·첫 배포)뿐이며, 계정·시크릿·승인자가 준비된 뒤 진행한다.

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

## N8 히스토리 캘린더 / landmarks (2026-08-06 구현)

### API

- `GET /diagnosis/history/:date` — Asia/Seoul `YYYY-MM-DD`의 통합 히스토리
  - Diagnosis + SkinMetric + WeatherSnapshot + Recommendation(+Product)
  - `diagnosis_image_storage` 동의 활성 + 이미지 존재 시 S3/Memory **presigned URL**
  - 동의 시에만 `landmarks` 노출. 미동의면 `image`/`landmarks` = null
- `GET /diagnosis/score-series?from&to` — overallScore 시계열 (기본 최근 90일)

### landmarks 스키마

- `Diagnosis.landmarks Json?`
- shape: `{ version: string, points: number[][] }` (정규화 캔버스 좌표)
- inference-service가 MediaPipe 478점을 반환하면 저장. Mock은 축소 샘플.
- **저장**: `diagnosis_image_storage` 동의 시에만 Diagnosis row에 기록
- **철회**: 이미지 삭제와 함께 landmarks = null

### 인덱스

- 기존 `@@index([userId, capturedAt])` + N8 `@@index([capturedAt])`
- 사용자 캘린더/시계열 조회는 `(userId, capturedAt)` 복합 인덱스를 사용
