import json
import os
from typing import Any

import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# 7.2 성분 추천 필터링 원칙: 임상 근거가 확립된 성분으로만 한정 (LLM이 임의 성분을 지어내지 못하게 강제)
ALLOWED_INGREDIENTS = [
    "나이아신아마이드",
    "히알루론산",
    "세라마이드",
    "판테놀",
    "센텔라",
    "시어버터",
    "징크옥사이드",
    "펩타이드",
    "아데노신",
    "약산성 클렌저",
]

TIMING_VALUES = ["외출 후", "자기 전", "언제든"]

RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "title": {"type": "STRING"},
            "explanation": {"type": "STRING"},
            "ingredientTags": {"type": "ARRAY", "items": {"type": "STRING"}},
            "timing": {"type": "STRING", "enum": TIMING_VALUES},
        },
        "required": ["title", "explanation", "ingredientTags", "timing"],
    },
}

SYSTEM_PROMPT = f"""당신은 화장품 추천 서비스의 근거 기반 추천 작성자입니다.
사용자의 오늘 피부 측정값과 오늘의 날씨/대기질 데이터를 함께 보고, 확립된 피부과학 지식
(자외선-광노화, 오존/미세먼지로 인한 산화 스트레스와 콜라겐 분해, 습도 저하와 피부장벽 손상 등)에
근거해 스킨케어 행동을 2~3개 추천하세요. 그 중 반드시 다음 두 가지를 포함하세요:

1. **외출 후 세안법** (timing: "외출 후") — 오늘의 오존·미세먼지·초미세먼지·자외선 수치를 근거로,
   집에 돌아왔을 때 어떻게 세안하면 좋을지. 예: 대기질이 나쁜 날엔 이중세안, 좋은 날엔 순한 세안으로
   충분하다는 식으로 오늘 수치에 맞게 구체적으로 조정하세요.
2. **자기 전 관리법** (timing: "자기 전") — 오늘 측정된 피부 부위별 상태(수분·탄력 등)와 오늘 하루의
   누적 환경 노출을 함께 고려해, 자기 전에 어떤 케어를 하면 좋을지.

그 외 추가로 필요하다고 판단되면 timing을 "언제든"으로 한 추천을 더 넣어도 됩니다.

반드시 지킬 규칙:
1. "진단", "치료", "질환" 등 의료적 확정 표현을 쓰지 마세요. "측정값", "추정", "~에 도움될 수 있음",
   "~하는 경향이 있어요" 같은 완곡한 표현만 사용하세요.
2. 특정 논문·연구·기관명을 인용하거나 지어내지 마세요. 존재를 확인할 수 없는 출처를 만들어내면 안
   됩니다. 근거는 일반적으로 확립된 피부과학 지식이라는 선에서만 설명하세요.
3. ingredientTags는 반드시 다음 목록에서만 골라 사용하세요 (목록 밖 성분 언급 금지): {", ".join(ALLOWED_INGREDIENTS)}
4. 톤은 병원 대기실이 아니라 매일 쓰는 날씨 앱처럼 친근하고 부담스럽지 않게 작성하세요.
5. 출력은 지정된 JSON 스키마를 그대로 따르세요."""


class GeminiUnavailable(Exception):
    """API 키 미설정, 호출 실패, 응답 파싱 실패 등 — 호출부에서 목업으로 폴백해야 함을 의미."""


async def generate_recommendations(skin: dict[str, Any], weather: dict[str, Any]) -> list[dict[str, Any]]:
    if not GEMINI_API_KEY:
        raise GeminiUnavailable("GEMINI_API_KEY not configured")

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "[오늘 피부 측정값]\n"
                            f"{json.dumps(skin, ensure_ascii=False)}\n\n"
                            "[오늘 날씨/대기질]\n"
                            f"{json.dumps(weather, ensure_ascii=False)}"
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
            "temperature": 0.4,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(GEMINI_ENDPOINT, params={"key": GEMINI_API_KEY}, json=payload)
            res.raise_for_status()
            data = res.json()
    except httpx.HTTPError as e:
        raise GeminiUnavailable(f"Gemini request failed: {e}") from e

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        items = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise GeminiUnavailable(f"Unexpected Gemini response shape: {e}") from e

    # 화이트리스트 강제: LLM이 규칙을 어기고 목록 밖 성분을 내놓아도 서버에서 한 번 더 걸러낸다
    for item in items:
        item["ingredientTags"] = [t for t in item.get("ingredientTags", []) if t in ALLOWED_INGREDIENTS]

    return items


# Product.category와 1:1 대응
PRODUCT_CATEGORIES = ["moisture", "elasticity", "brightening", "barrier"]
# 하루 중 실제로 화장품을 쓰는 3가지 상황 — Product.timing과 1:1 대응
PRODUCT_TIMINGS = ["세안 후", "외출 전", "외출 후"]

PRODUCT_RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "timing": {"type": "STRING", "enum": PRODUCT_TIMINGS},
            "category": {"type": "STRING", "enum": PRODUCT_CATEGORIES},
            "name": {"type": "STRING"},
            "brand": {"type": "STRING"},
            "explanation": {"type": "STRING"},
            "ingredientTags": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
        "required": ["timing", "category", "name", "brand", "explanation", "ingredientTags"],
    },
}

PRODUCT_SYSTEM_PROMPT = f"""당신은 화장품 추천 서비스의 근거 기반 제품 추천 작성자입니다.
오늘의 날씨/대기질 데이터만 보고(사용자의 피부 측정값은 아직 없음), 확립된 피부과학 지식
(자외선-광노화, 오존/미세먼지로 인한 산화 스트레스, 습도 저하와 피부장벽 손상 등)에 근거해 하루 중
화장품을 실제로 쓰는 다음 세 상황 각각에 맞는 화장품을 정확히 하나씩, 총 3개를 추천하세요:

1. **세안 후** (timing: "세안 후") — 세안 직후 피부결을 정돈·보호하는 데 도움 되는 제품
   (예: 토너, 에센스, 로션 등). 오늘 습도·미세먼지 등으로 인한 피부 상태를 고려하세요.
2. **외출 전** (timing: "외출 전") — 오늘 자외선지수·대기질을 근거로 외출 전 미리 발라두면
   좋은 제품 (예: 선크림, 프라이머 등).
3. **외출 후 밖에 있을 때** (timing: "외출 후") — 아직 귀가하지 않고 밖에 있는 동안 휴대하며
   틈틈이 쓰기 좋은 제품 (예: 수분 미스트, 쿠션, 블로팅 페이퍼, 립밤 등). 오늘 오존·미세먼지·
   자외선 누적 노출을 고려하세요.

세 상황의 제품 종류(카테고리·타입)는 서로 겹치지 않게 다양하게 고르세요 — 매번 같은 종류의
크림/세럼만 추천하지 마세요.

반드시 지킬 규칙:
1. name/brand는 실제 존재하는 특정 상용 브랜드·제품을 언급하지 마세요. 가상의 제품명·브랜드명을
   지어내되, 어떤 제품 종류인지 이름에서 드러나게 하세요.
2. "진단", "치료", "질환" 등 의료적 확정 표현을 쓰지 마세요. "~에 도움될 수 있음", "~하는 경향이
   있어요" 같은 완곡한 표현만 사용하세요.
3. 존재를 확인할 수 없는 논문·연구·기관을 인용하거나 지어내지 마세요.
4. ingredientTags는 반드시 다음 목록에서만 골라 사용하세요 (목록 밖 성분 언급 금지): {", ".join(ALLOWED_INGREDIENTS)}
5. category는 그 제품의 주요 효능에 가장 가까운 것으로 고르세요: moisture(보습), elasticity(탄력),
   brightening(미백), barrier(장벽 강화).
6. explanation에는 오늘 날씨/대기질의 어떤 수치 때문에 이 상황에 이 제품·성분이 도움될 수 있는지
   구체적인 근거를 담으세요.
7. 톤은 매일 쓰는 날씨 앱처럼 친근하고 부담스럽지 않게 작성하세요.
8. 출력은 지정된 JSON 스키마를 그대로 따르고, timing은 3개 각각 정확히 한 번씩만 사용하세요."""


async def generate_weather_products(weather: dict[str, Any]) -> list[dict[str, Any]]:
    if not GEMINI_API_KEY:
        raise GeminiUnavailable("GEMINI_API_KEY not configured")

    payload = {
        "system_instruction": {"parts": [{"text": PRODUCT_SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"[오늘 날씨/대기질]\n{json.dumps(weather, ensure_ascii=False)}"}],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": PRODUCT_RESPONSE_SCHEMA,
            "temperature": 0.5,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(GEMINI_ENDPOINT, params={"key": GEMINI_API_KEY}, json=payload)
            res.raise_for_status()
            data = res.json()
    except httpx.HTTPError as e:
        raise GeminiUnavailable(f"Gemini request failed: {e}") from e

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        items = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise GeminiUnavailable(f"Unexpected Gemini response shape: {e}") from e

    # 상황(timing)별 정확히 1개만 남기고, 카테고리가 유효하지 않거나 화이트리스트 밖 성분은 걸러낸다
    seen_timings: set[str] = set()
    results: list[dict[str, Any]] = []
    for item in items:
        timing = item.get("timing")
        category = item.get("category")
        if timing not in PRODUCT_TIMINGS or timing in seen_timings or category not in PRODUCT_CATEGORIES:
            continue
        seen_timings.add(timing)
        item["ingredientTags"] = [t for t in item.get("ingredientTags", []) if t in ALLOWED_INGREDIENTS]
        results.append(item)

    if not results:
        raise GeminiUnavailable("Gemini returned no usable product recommendations")

    return results
