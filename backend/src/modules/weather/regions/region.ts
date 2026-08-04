
/**
 * 지역 근사표 항목 — 기존 FastAPI regions.py의 Region dataclass 이식.
 * GPS 좌표가 주어지면 haversine 거리로 가장 가까운 지역을 찾아
 * 기상청 area_no / 에어코리아 측정소명을 결정한다.
 */
export class Region {
  constructor(
    public readonly name: string,
    public readonly cityName: string,
    public readonly lat: number,
    public readonly lon: number,
    public readonly kmaAreaNo: string,
    public readonly airkoreaStationName: string,
  ) {}
}
