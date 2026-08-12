// R16: 프론트엔드 테스트. 전면 커버리지가 아니라 실패 비용이 큰 로직
// (세션 저장·토큰 재발급·응답 계약)에 범위를 제한한다.
// backend/는 자체 Jest 설정(backend/package.json)을 쓰므로 제외한다.
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src', '<rootDir>/app'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/backend/'],
  clearMocks: true,
};
