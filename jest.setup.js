// R16: 네이티브 모듈 목킹. AsyncStorage/SecureStore는 JS 테스트 런타임에
// 네이티브 구현이 없으므로 인메모리 구현으로 대체한다.
// 각 테스트에서 상태를 초기화할 수 있도록 __store를 노출한다.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __store: store,
    setItem: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    getItem: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    removeItem: jest.fn(async (key) => {
      store.delete(key);
    }),
    clear: jest.fn(async () => {
      store.clear();
    }),
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __store: store,
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});
