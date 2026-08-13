# Expo SDK

프론트엔드 코드를 수정하기 전에 `package.json`의 Expo 버전을 확인하고, 현재 SDK 54 문서인 https://docs.expo.dev/versions/v54.0.0/ 을 기준으로 작업한다.

## 아키텍처 원칙 (Todayskin)

NestJS(메인 백엔드/BFF + 비즈니스 로직)와 FastAPI(독립 AI 추론 서버)를 분리한다. 자세한 원칙은 docs/architecture/ARCHITECTURE.md 를 따른다. 이 원칙에서 벗어나는 구조 변경은 금지한다.
