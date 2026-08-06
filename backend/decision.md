# Todayskin Backend Decision Register

백엔드 엔지니어링 관점에서 결정이 필요한 항목. 아키텍처 원칙(docs/ARCHITECTURE.md)과
이미 코드에 반영된 사항은 제외했다. 아래 4개는 2026-08-07에 전부 확정되었다.

| 항목 | 결정 | 요약 |
|---|---|---|
| T2-03 삭제/Soft Delete | Option B | User·Diagnosis에 Soft Delete + 보존 기간, 개인정보/이미지는 물리 삭제, 진단 결과는 익명화 후 보존, FK 정책 표 확정 |
| T3-04 OTP/본인확인 | Option B | 가입·새 디바이스 로그인에 OTP 필수(운영 공개 전). 개발은 allowlisted test phone/mock OTP, 운영은 실제 OTP + 시도/만료/재전송 제한 |
| T3-05 Role/Permission | 추천안 | 현재 Role 기반 유지, ADMIN endpoint 만들 때 @Roles(Role.ADMIN) + 감사 로그, 3개+ 독립 action 시 Permission 도입 |
| T9-03 Consent | Option B | 목적 enum/registry(diagnosis_image_processing, ai_recommendation_data_transfer), 필수 동의 version 없으면 기능 거부, 철회/보존 별도 정책, audit 대상 |
