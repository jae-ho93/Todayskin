from datetime import datetime, timezone

from .schemas import Product, Recommendation, SkinPartMetric, SkinScoreSnapshot, WeatherSnapshot

_now = datetime.now(timezone.utc).isoformat()

MOCK_WEATHER = WeatherSnapshot(
    observedAt=_now,
    temperatureC=31,
    feelsLikeC=34,
    uvIndex=8,
    uvStatus="bad",
    ozonePpm=0.072,
    ozoneStatus="moderate",
    pm25=18,
    pm25Status="good",
    pm10=32,
    pm10Status="moderate",
    caiValue=68,
    caiStatus="moderate",
    no2Value=0.021,
    so2Value=0.004,
    coValue=0.5,
    humidityPct=62,
)

MOCK_SKIN_SCORE = SkinScoreSnapshot(
    id="snap-2026-08-03",
    capturedAt=_now,
    overallScore=78,
    parts=[
        SkinPartMetric(part="forehead", label="이마", grade="양호", moisture=72, elasticity=68),
        SkinPartMetric(part="glabella", label="미간", grade="보통", moisture=60, elasticity=64),
        SkinPartMetric(part="eyeArea", label="눈가", grade="보통", moisture=55, elasticity=58),
        SkinPartMetric(part="cheek", label="볼", grade="양호", moisture=75, elasticity=70),
        SkinPartMetric(part="lips", label="입술", grade="건조", moisture=40),
        SkinPartMetric(part="jaw", label="턱", grade="양호", moisture=66, elasticity=71),
    ],
)

MOCK_RECOMMENDATIONS = [
    Recommendation(
        id="rec-1",
        title="오늘은 자외선 차단제를 2~3시간마다 재도포해 주세요",
        grade="A",
        sourceLabel="대한피부과학회 자외선 가이드라인",
        explanation=(
            "오늘 자외선지수는 8(매우 높음)로 측정되었습니다. 자외선은 피부 세포 신호전달체계에 "
            "영향을 주어 광노화와 색소침착을 유발할 수 있다는 것이 공인된 피부과학 정설입니다."
        ),
        ingredientTags=["SPF50+", "징크옥사이드"],
        relatedProductIds=["prod-1"],
    ),
    Recommendation(
        id="rec-2",
        title="오늘은 이중 세안을 권장해요",
        grade="B",
        sourceLabel="국내 종단연구, 2019 (유럽피부과학회지)",
        explanation=(
            "초미세먼지(PM2.5) 노출은 모공에 침투해 활성산소를 생성하고 콜라겐 분해를 촉진할 수 "
            "있다는 관찰 연구 결과가 있습니다. 오늘 PM2.5 농도를 고려해 이중 세안으로 잔여 오염물질 "
            "제거를 권장합니다."
        ),
        ingredientTags=["클렌징오일", "약산성폼"],
        relatedProductIds=["prod-2"],
        timing="외출 후",
    ),
    Recommendation(
        id="rec-3",
        title="오존 노출 후 피부 진정 케어가 도움이 될 수 있어요",
        grade="C",
        sourceLabel="개인 시계열 상관분석 (자체 수집 데이터)",
        explanation=(
            "최근 2주간 오존 농도가 높았던 날 다음날 회원님의 피부 수분 지표가 낮아지는 경향이 "
            "관찰되었습니다. 이는 개인 표본 기반의 통계적 관찰이며 확정적 인과관계가 아닙니다."
        ),
        observationalNote="통계적 관찰 - 확정적 인과관계 아님",
        ingredientTags=["판테놀", "센텔라"],
        relatedProductIds=["prod-3"],
    ),
    Recommendation(
        id="rec-4",
        title="입술 건조도가 높아요, 보습 밤을 발라주세요",
        grade="B",
        sourceLabel="건조 환경-피부장벽 관찰 연구",
        explanation=(
            "오늘 측정된 입술 부위 수분 수치가 40으로 낮게 측정되었습니다. 낮은 습도와 함께 장벽 "
            "손상 위험이 높아질 수 있어 보습 밤 사용에 도움될 수 있습니다."
        ),
        ingredientTags=["시어버터", "세라마이드"],
        relatedProductIds=["prod-4"],
        timing="자기 전",
    ),
]

MOCK_PRODUCTS = [
    Product(
        id="prod-1",
        name="데일리 UV 디펜스 선크림",
        brand="Skinlab",
        matchedGrade="A",
        matchedIngredients=["징크옥사이드", "나이아신아마이드"],
        category="barrier",
        recommendationId="rec-1",
    ),
    Product(
        id="prod-2",
        name="퓨어 클렌징 오일",
        brand="Skinlab",
        matchedGrade="B",
        matchedIngredients=["호호바오일"],
        category="barrier",
        recommendationId="rec-2",
    ),
    Product(
        id="prod-3",
        name="센텔라 진정 크림",
        brand="Greenfield",
        matchedGrade="C",
        matchedIngredients=["센텔라", "판테놀"],
        category="moisture",
        recommendationId="rec-3",
    ),
    Product(
        id="prod-4",
        name="세라마이드 리페어 밤",
        brand="Greenfield",
        matchedGrade="B",
        matchedIngredients=["세라마이드", "시어버터"],
        category="moisture",
        recommendationId="rec-4",
    ),
]
