const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 이 프로젝트가 exFAT 외장 SSD에서 열리는 경우, macOS가 파일을 건드릴 때마다
// AppleDouble 리소스 포크 파일(예: app/(tabs)/._index.tsx)을 계속 만들어낸다.
// Metro가 이걸 소스 파일로 착각해 파싱하다 죽는 것을 막기 위해 무시 목록에 추가한다.
config.resolver.blockList = [...(config.resolver.blockList ?? []), /\/\._[^/]+$/];

module.exports = config;
