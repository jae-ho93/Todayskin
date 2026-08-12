import { REGIONS, findNearestRegion } from './region.registry';

/**
 * N41: 근사표의 표기 규칙을 고정한다.
 *
 * 이 표의 값이 그대로 스냅샷에 저장되고 사용자 화면에 뜬다. 예전에 '부산'과
 * '부산광역시'가 섞여 저장돼 지역별 집계가 갈라졌고, 측정소명을 구 이름으로
 * 써서 해운대구가 '중구'로 표시됐다. 둘 다 표기 규칙이 코드로 고정돼 있지
 * 않아서 생긴 일이다.
 */
describe('REGIONS 근사표', () => {
  // 행정안전부 기준 17개 광역자치단체 정식 명칭.
  const CANONICAL_CITY_NAMES = new Set([
    '서울특별시',
    '부산광역시',
    '대구광역시',
    '인천광역시',
    '광주광역시',
    '대전광역시',
    '울산광역시',
    '세종특별자치시',
    '경기도',
    '강원특별자치도',
    '충청북도',
    '충청남도',
    '전북특별자치도',
    '전라남도',
    '경상북도',
    '경상남도',
    '제주특별자치도',
  ]);

  it.each(REGIONS.map((r) => [r.name, r.cityName] as const))(
    '%s: 시/도는 정식 명칭이다',
    (_name, cityName) => {
      expect(CANONICAL_CITY_NAMES.has(cityName)).toBe(true);
    },
  );

  it.each(REGIONS.filter((r) => r.districtName !== null).map((r) => [r.name, r.districtName] as const))(
    '%s: 구 이름은 시/군/구로 끝난다',
    (_name, districtName) => {
      expect(districtName).toMatch(/(시|군|구)$/);
    },
  );

  /**
   * 측정소명은 행정구역이 아니다. 경기도 대표 측정소는 '인계동'이고, 부산은
   * '중구'다. 이걸 구 이름으로 쓰면 해운대구가 중구로 표시된다.
   */
  it('광역시·도 대표 항목은 구 이름을 비워 둔다', () => {
    const busan = REGIONS.find((r) => r.name === '부산광역시');

    expect(busan?.airkoreaStationName).toBe('중구');
    expect(busan?.districtName).toBeNull();
  });

  it('해운대 좌표는 부산광역시 항목으로 붙는다', () => {
    const region = findNearestRegion(35.16526, 129.1635);

    expect(region.cityName).toBe('부산광역시');
    expect(region.districtName).toBeNull();
  });
});
