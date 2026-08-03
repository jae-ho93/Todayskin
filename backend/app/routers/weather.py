import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter

from ..mock_data import MOCK_WEATHER
from ..regions import DEFAULT_REGION, find_nearest_region
from ..schemas import AirStatus, WeatherSnapshot

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["weather"])

# 실연동 시 공공데이터포털(data.go.kr)에서 발급받은 키를 backend/.env 에 주입
KMA_API_KEY = os.getenv("KMA_API_KEY")  # 기상청_생활기상지수 조회서비스(3.0)
AIRKOREA_API_KEY = os.getenv("AIRKOREA_API_KEY")  # 한국환경공단_에어코리아_대기오염정보
# 위치 권한을 거부했거나 좌표가 없을 때 사용할 기본 지역 (환경변수로 덮어쓰기 가능)
DEFAULT_KMA_AREA_NO = os.getenv("KMA_AREA_NO", DEFAULT_REGION.kma_area_no)
DEFAULT_AIRKOREA_STATION_NAME = os.getenv("AIRKOREA_STATION_NAME", DEFAULT_REGION.airkorea_station_name)

KMA_UV_ENDPOINT = "https://apis.data.go.kr/1360000/LivingWthrIdxServiceV4/getUVIdxV4"
AIRKOREA_ENDPOINT = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"

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


async def _fetch_uv_index(client: httpx.AsyncClient, area_no: str) -> Optional[float]:
    """기상청 생활기상지수(자외선) 조회. 실패 시 None을 반환해 상위에서 목업값으로 대체하게 한다."""
    if not KMA_API_KEY:
        return None

    # 이 시각의 발표자료가 아직 없을 수 있어 3시간 전 정시로 조회
    query_time = (datetime.now(KST) - timedelta(hours=3)).strftime("%Y%m%d%H")
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
        # h0 = 조회 시각 기준 현재 예보값 (3시간 간격 예보이므로 "지금"에 가장 가까운 값)
        return _safe_float(item_list[0].get("h0"))
    except Exception:  # noqa: BLE001 — 외부 API 스펙/키 문제는 전부 목업 폴백으로 처리
        logger.warning("KMA UV index fetch failed, falling back to mock", exc_info=True)
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
    except Exception:  # noqa: BLE001
        logger.warning("AirKorea air quality fetch failed, falling back to mock", exc_info=True)
        return AirQualityData()


@router.get("", response_model=WeatherSnapshot)
async def get_current_weather(lat: Optional[float] = None, lon: Optional[float] = None) -> WeatherSnapshot:
    """
    기상청 생활기상지수(자외선) + 에어코리아 대기오염정보를 결합한 실시간 스냅샷.
    lat/lon이 주어지면(위치 권한 허용 시) 가장 가까운 지역의 관측소·행정구역코드를 찾아 조회하고,
    없으면(권한 거부) 환경변수 기본 지역으로 조회한다.
    에어코리아는 오존/초미세먼지뿐 아니라 PM10·통합대기환경지수(CAI)·NO2·SO2·CO까지 한 번에 받아온다.
    온도/습도/체감온도는 아직 다른 API가 필요해 목업값을 유지한다 (추후 연동 예정).
    각 필드는 독립적으로 폴백된다 — 키가 없거나 호출이 실패해도 그 항목만 목업으로 대체된다.
    """
    if lat is not None and lon is not None:
        region = find_nearest_region(lat, lon)
        area_no, station_name = region.kma_area_no, region.airkorea_station_name
    else:
        area_no, station_name = DEFAULT_KMA_AREA_NO, DEFAULT_AIRKOREA_STATION_NAME

    async with httpx.AsyncClient(timeout=8.0) as client:
        uv, air = await asyncio.gather(
            _fetch_uv_index(client, area_no),
            _fetch_air_quality(client, station_name),
        )

    uv_index = uv if uv is not None else MOCK_WEATHER.uvIndex
    ozone_ppm = air.ozone if air.ozone is not None else MOCK_WEATHER.ozonePpm
    pm25_value = air.pm25 if air.pm25 is not None else MOCK_WEATHER.pm25
    pm10_value = air.pm10 if air.pm10 is not None else MOCK_WEATHER.pm10
    cai_value = air.cai if air.cai is not None else MOCK_WEATHER.caiValue

    return WeatherSnapshot(
        observedAt=datetime.now(timezone.utc).isoformat(),
        temperatureC=MOCK_WEATHER.temperatureC,
        feelsLikeC=MOCK_WEATHER.feelsLikeC,
        uvIndex=uv_index,
        uvStatus=_uv_status(uv_index),
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
        humidityPct=MOCK_WEATHER.humidityPct,
    )
