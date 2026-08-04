import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter
from pyproj import Transformer

from ..mock_data import MOCK_WEATHER
from ..regions import DEFAULT_REGION, find_nearest_region
from ..schemas import AirStatus, WeatherSnapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["weather"])

# 실연동 시 공공데이터포털(data.go.kr)에서 발급받은 키를 backend/.env 에 주입
KMA_API_KEY = os.getenv("KMA_API_KEY")  # 기상청_생활기상지수 조회서비스(3.0)
AIRKOREA_API_KEY = os.getenv("AIRKOREA_API_KEY")  # 한국환경공단_에어코리아_대기오염정보/측정소정보 (같은 계정 인증키 공용)
# 위치 권한을 거부했거나 좌표가 없을 때, 혹은 근접측정소 조회가 실패했을 때 쓸 기본/폴백 지역
DEFAULT_KMA_AREA_NO = os.getenv("KMA_AREA_NO", DEFAULT_REGION.kma_area_no)
DEFAULT_AIRKOREA_STATION_NAME = os.getenv("AIRKOREA_STATION_NAME", DEFAULT_REGION.airkorea_station_name)

KMA_UV_ENDPOINT = "https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5"
AIRKOREA_ENDPOINT = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"
# 근접측정소 목록 조회는 대기오염정보 조회 서비스가 아니라 별도의
# "한국환경공단_에어코리아_측정소정보" 서비스에 속해 있어 data.go.kr에서 별도 활용신청이 필요하다
# (같은 계정이면 인증키는 그대로 재사용). 신청 전/실패 시에는 REGIONS 근사표로 폴백한다.
NEARBY_STATION_ENDPOINT = "https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList"

# 에어코리아 근접측정소 API는 위경도(WGS84)가 아니라 TM 좌표(GRS80 중부원점, EPSG:5181)를 요구한다
_wgs84_to_tm = Transformer.from_crs("EPSG:4326", "EPSG:5181", always_xy=True)

KST = timezone(timedelta(hours=9))


def _safe_float(value: object) -> Optional[float]:
    if value in (None, "-", ""):
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _uv_status(uv: float) -> AirStatus:
    if uv >= 6:
        return "bad"
    if uv >= 3:
        return "moderate"
    return "good"


def _pm25_status(pm25: float) -> AirStatus:
    if pm25 > 35:
        return "bad"
    if pm25 > 15:
        return "moderate"
    return "good"


def _ozone_status(ppm: float) -> AirStatus:
    if ppm >= 0.09:
        return "bad"
    if ppm >= 0.03:
        return "moderate"
    return "good"


def _pm10_status(pm10: float) -> AirStatus:
    if pm10 > 80:
        return "bad"
    if pm10 > 30:
        return "moderate"
    return "good"


def _cai_status(cai: float) -> AirStatus:
    # 통합대기환경지수(CAI): 0-50 좋음, 51-100 보통, 101+ 나쁨
    if cai > 100:
        return "bad"
    if cai > 50:
        return "moderate"
    return "good"


@dataclass
class AirQualityData:
    ozone: Optional[float] = None
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    cai: Optional[float] = None
    no2: Optional[float] = None
    so2: Optional[float] = None
    co: Optional[float] = None


@dataclass
class UvForecast:
    current: Optional[float] = None
    peak: Optional[float] = None  # 오늘 남은 시간대 중 예상 최댓값
    peakHour: Optional[int] = None  # 그 최댓값이 나오는 시각(0~23시)


def _today_remaining_slots(base: datetime) -> list[tuple[int, int]]:
    """base 시각(3시간 격자)부터 당일 자정 전까지 남은 (h오프셋, 실제 시각의 hour) 목록.
    응답 필드는 h0~h75(3시간 간격)까지만 있어 그 범위 안에서만 본다."""
    slots = []
    for offset in range(0, 76, 3):
        slot_dt = base + timedelta(hours=offset)
        if slot_dt.date() != base.date():
            break
        slots.append((offset, slot_dt.hour))
    return slots


async def _fetch_uv_index(client: httpx.AsyncClient, area_no: str) -> UvForecast:
    """
    기상청 생활기상지수(자외선) 조회. 실패 시 빈 UvForecast를 반환해 상위에서 목업값으로 대체하게 한다.
    한 번의 호출 응답에 3시간 간격 미래 예보(h0~h75)가 전부 들어있어서, 현재값과 함께 "오늘 남은
    시간대 중 실제 최댓값"을 추가 호출 없이 같이 뽑아낸다. 고정된 시간대(예: 14시)를 피크로 가정하면
    이미 그 시간을 지났거나 실제 최고치가 다른 시간대일 때 "피크가 현재보다 낮게" 나오는 모순이
    생길 수 있어서, 항상 오늘 남은 슬롯 전체를 스캔해 진짜 최댓값과 그 시각을 함께 반환한다.
    """
    if not KMA_API_KEY:
        return UvForecast()

    # 이 시각의 발표자료가 아직 없을 수 있어 3시간 전 정시로 조회
    base_time = datetime.now(KST) - timedelta(hours=3)
    query_time = base_time.strftime("%Y%m%d%H")
    params = {
        "serviceKey": KMA_API_KEY,
        "numOfRows": "1",
        "pageNo": "1",
        "areaNo": area_no,
        "time": query_time,
        "dataType": "JSON",
    }
    try:
        res = await client.get(KMA_UV_ENDPOINT, params=params)
        res.raise_for_status()
        data = res.json()
        items = data["response"]["body"]["items"]
        item_list = items["item"] if isinstance(items, dict) else items
        item = item_list[0]
        # query_time을 실제 "지금"보다 3시간 전으로 조회했으므로, h0(=query_time 시점 값)이 아니라
        # h3(=query_time+3시간 ≈ 지금 시점 값)를 읽어야 실제 현재 시각의 예보값과 맞는다
        current = _safe_float(item.get("h3"))

        peak: Optional[float] = None
        peak_hour: Optional[int] = None
        for offset, hour in _today_remaining_slots(base_time):
            value = _safe_float(item.get(f"h{offset}"))
            if value is not None and (peak is None or value > peak):
                peak, peak_hour = value, hour

        return UvForecast(current=current, peak=peak, peakHour=peak_hour)
    except httpx.HTTPStatusError as e:
        # httpx 예외 문자열엔 serviceKey가 담긴 요청 URL이 그대로 포함되므로 절대 통째로 로깅하지 않는다
        logger.warning("KMA UV index fetch failed: HTTP %s", e.response.status_code)
        return UvForecast()
    except Exception as e:  # noqa: BLE001 — 외부 API 스펙/네트워크 문제는 전부 목업 폴백으로 처리
        logger.warning("KMA UV index fetch failed: %s", type(e).__name__)
        return UvForecast()


@dataclass
class NearestStation:
    station_name: str  # 대기질 실시간 조회에 쓰는 측정소명 (예: "중구")
    city_name: str  # 주소 첫 토큰에서 뽑은 시/도 표시명 (예: "서울")


async def _fetch_nearest_station(client: httpx.AsyncClient, lat: float, lon: float) -> Optional[NearestStation]:
    """GPS 좌표(위경도) 기준 실제 최인접 에어코리아 측정소를 조회한다.
    "측정소정보 조회 서비스" 활용신청이 안 돼 있거나 호출이 실패하면 None을 반환해
    상위에서 REGIONS 근사표로 폴백하게 한다."""
    if not AIRKOREA_API_KEY:
        return None

    tm_x, tm_y = _wgs84_to_tm.transform(lon, lat)
    params = {
        "serviceKey": AIRKOREA_API_KEY,
        "returnType": "json",
        "tmX": tm_x,
        "tmY": tm_y,
        "ver": "1.1",
    }
    try:
        res = await client.get(NEARBY_STATION_ENDPOINT, params=params)
        res.raise_for_status()
        data = res.json()
        items = data["response"]["body"]["items"]
        item_list = items["item"] if isinstance(items, dict) else items
        nearest = item_list[0]
        addr = nearest.get("addr", "")
        # addr 예: "서울 중구 덕수궁길 15 ..." — 첫 토큰이 시/도 약칭이라 그대로 표시용으로 쓴다
        city_name = addr.split()[0] if addr else DEFAULT_REGION.city_name
        return NearestStation(station_name=nearest["stationName"], city_name=city_name)
    except httpx.HTTPStatusError as e:
        logger.warning("AirKorea nearby station lookup failed: HTTP %s", e.response.status_code)
        return None
    except Exception as e:  # noqa: BLE001 — 활용신청 누락/스펙 문제는 전부 근사표 폴백으로 처리
        logger.warning("AirKorea nearby station lookup failed: %s", type(e).__name__)
        return None


async def _fetch_air_quality(client: httpx.AsyncClient, station_name: str) -> AirQualityData:
    """
    에어코리아 측정소별 실시간 측정정보 조회. 오존/초미세먼지 외에도 PM10·통합대기환경지수(CAI)·
    NO2·SO2·CO까지 같은 호출 한 번으로 전부 받아온다 (추가 API 호출 비용 없음).
    """
    if not AIRKOREA_API_KEY:
        return AirQualityData()

    params = {
        "serviceKey": AIRKOREA_API_KEY,
        "returnType": "json",
        "stationName": station_name,
        "dataTerm": "DAILY",
        "ver": "1.3",
        "numOfRows": "1",
        "pageNo": "1",
    }
    try:
        res = await client.get(AIRKOREA_ENDPOINT, params=params)
        res.raise_for_status()
        data = res.json()
        items = data["response"]["body"]["items"]
        item_list = items["item"] if isinstance(items, dict) else items
        latest = item_list[0]
        return AirQualityData(
            ozone=_safe_float(latest.get("o3Value")),
            pm25=_safe_float(latest.get("pm25Value")),
            pm10=_safe_float(latest.get("pm10Value")),
            cai=_safe_float(latest.get("khaiValue")),
            no2=_safe_float(latest.get("no2Value")),
            so2=_safe_float(latest.get("so2Value")),
            co=_safe_float(latest.get("coValue")),
        )
    except httpx.HTTPStatusError as e:
        logger.warning("AirKorea air quality fetch failed: HTTP %s", e.response.status_code)
        return AirQualityData()
    except Exception as e:  # noqa: BLE001
        logger.warning("AirKorea air quality fetch failed: %s", type(e).__name__)
        return AirQualityData()


@router.get("", response_model=WeatherSnapshot)
async def get_current_weather(lat: Optional[float] = None, lon: Optional[float] = None) -> WeatherSnapshot:
    """
    기상청 생활기상지수(자외선) + 에어코리아 대기오염정보를 결합한 실시간 스냅샷.
    lat/lon이 주어지면(위치 권한 허용 시) 가장 가까운 지역의 관측소·행정구역코드를 찾아 조회하고,
    없으면(권한 거부) 환경변수 기본 지역으로 조회한다.
    에어코리아는 오존/초미세먼지뿐 아니라 PM10·통합대기환경지수(CAI)·NO2·SO2·CO까지 한 번에 받아온다.
    온도/체감온도/습도는 아직 연동하지 않아 응답에 포함하지 않는다.
    각 필드는 독립적으로 폴백된다 — 키가 없거나 호출이 실패해도 그 항목만 목업으로 대체된다.
    """
    async with httpx.AsyncClient(timeout=8.0) as client:
        if lat is not None and lon is not None:
            region = find_nearest_region(lat, lon)
            area_no = region.kma_area_no
            # 자외선지수 조회는 근접측정소 조회 결과와 무관하므로(area_no만 필요) 순차 대기하지 않고
            # 병렬로 실행해 두 정부 API 모두 느릴 때의 왕복 시간을 줄인다. 대기질 조회만 station_name이
            # 필요해 근접측정소 조회 이후에 실행한다.
            nearest, uv = await asyncio.gather(
                _fetch_nearest_station(client, lat, lon),
                _fetch_uv_index(client, area_no),
            )
            station_name = nearest.station_name if nearest else region.airkorea_station_name
            region_name = nearest.city_name if nearest else region.city_name
        else:
            area_no, station_name = DEFAULT_KMA_AREA_NO, DEFAULT_AIRKOREA_STATION_NAME
            region_name = DEFAULT_REGION.city_name
            uv = await _fetch_uv_index(client, area_no)

        air = await _fetch_air_quality(client, station_name)

    uv_index = uv.current if uv.current is not None else MOCK_WEATHER.uvIndex
    uv_index_peak = uv.peak if uv.peak is not None else MOCK_WEATHER.uvIndexPeak
    ozone_ppm = air.ozone if air.ozone is not None else MOCK_WEATHER.ozonePpm
    pm25_value = air.pm25 if air.pm25 is not None else MOCK_WEATHER.pm25
    pm10_value = air.pm10 if air.pm10 is not None else MOCK_WEATHER.pm10
    cai_value = air.cai if air.cai is not None else MOCK_WEATHER.caiValue

    return WeatherSnapshot(
        observedAt=datetime.now(timezone.utc).isoformat(),
        regionName=region_name,
        uvIndex=uv_index,
        uvStatus=_uv_status(uv_index),
        uvIndexPeak=uv_index_peak,
        uvStatusPeak=_uv_status(uv_index_peak) if uv_index_peak is not None else None,
        uvIndexPeakHour=uv.peakHour if uv.peakHour is not None else MOCK_WEATHER.uvIndexPeakHour,
        ozonePpm=ozone_ppm,
        ozoneStatus=_ozone_status(ozone_ppm),
        pm25=pm25_value,
        pm25Status=_pm25_status(pm25_value),
        pm10=pm10_value,
        pm10Status=_pm10_status(pm10_value),
        caiValue=cai_value,
        caiStatus=_cai_status(cai_value) if cai_value is not None else None,
        no2Value=air.no2 if air.no2 is not None else MOCK_WEATHER.no2Value,
        so2Value=air.so2 if air.so2 is not None else MOCK_WEATHER.so2Value,
        coValue=air.co if air.co is not None else MOCK_WEATHER.coValue,
    )
