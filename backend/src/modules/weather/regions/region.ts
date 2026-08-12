
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
    /**
     * 에어코리아 측정소명. **행정구역이 아니다** — '인계동'처럼 동 이름인 곳도 있다.
     * 표시용 구 이름으로 쓰면 안 된다(N41에서 그렇게 써서 해운대구가 중구로 표시됐다).
     */
    public readonly airkoreaStationName: string,
    /**
     * 표시용 시/군/구. 근사표 항목이 광역 단위(예: 부산광역시 전체)라 특정할 수 없으면 null.
     * 모르는 걸 그럴듯한 값으로 채우지 않는다 — 사용자는 추측과 사실을 구별할 수 없다.
     */
    public readonly districtName: string | null,
  ) {}
}
