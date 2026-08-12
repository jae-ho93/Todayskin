// R15: 프론트엔드 린트. backend/는 자체 ESLint 설정을 쓰므로 제외한다.
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  globalIgnores([
    'backend/**',
    'dist/**',
    'assets/**',
    // 도구가 만드는 숨김 디렉터리(.expo, worktree 캐시 등)는 소스가 아니다.
    '.*/**',
  ]),
  expoConfig,
  {
    // Node에서 실행되는 설정 파일 — require/module 등 Node 전역을 사용한다.
    files: ['*.config.js', 'jest.setup.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', 'jest.setup.js'],
    languageOptions: { globals: globals.jest },
  },
]);
