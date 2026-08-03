import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException

from ..gemini_client import GeminiUnavailable, generate_recommendations
from ..mock_data import MOCK_PRODUCTS, MOCK_RECOMMENDATIONS
from ..schemas import EvidenceGrade, GenerateRecommendationsRequest, Product, Recommendation

router = APIRouter(tags=["recommendations"])

# LLM이 만들어내지 않은, 우리가 통제하는 정직한 출처 표기 (허위 인용 방지)
GEMINI_SOURCE_LABEL = "AI 종합 분석 · 피부과학 일반 지식 기반"


@router.get("/recommendations", response_model=list[Recommendation])
async def list_recommendations(grade: Optional[EvidenceGrade] = None) -> list[Recommendation]:
    """
    오늘의 추천 목록. 근거등급(A/B/C) 로직은 7.1 근거 등급 체계를 따른다:
    A=공인 가이드라인, B=개별 임상/관찰 연구, C=개인 시계열 통계적 관찰.
    """
    if grade is None:
        return MOCK_RECOMMENDATIONS
    return [r for r in MOCK_RECOMMENDATIONS if r.grade == grade]


@router.post("/recommendations/generate", response_model=list[Recommendation])
async def generate(payload: GenerateRecommendationsRequest) -> list[Recommendation]:
    """
    B등급(사진 기반) 매칭 로직: 오늘 피부 측정값 + 오늘 날씨를 Gemini에 함께 전달해
    확립된 피부과학 지식에 근거한 추천을 생성한다. 근거등급은 LLM이 아니라 서버가
    강제로 B로 고정하고, 출처도 LLM이 지어내지 못하도록 서버가 고정된 문구를 붙인다.
    GEMINI_API_KEY가 없거나 호출이 실패하면 정적 B등급 목업으로 폴백한다.
    """
    try:
        items = await generate_recommendations(
            payload.skinScore.model_dump(), payload.weather.model_dump()
        )
    except GeminiUnavailable:
        return [r for r in MOCK_RECOMMENDATIONS if r.grade == "B"]

    return [
        Recommendation(
            id=f"gemini-{uuid.uuid4().hex[:8]}",
            title=item["title"],
            grade="B",
            sourceLabel=GEMINI_SOURCE_LABEL,
            explanation=item["explanation"],
            ingredientTags=item.get("ingredientTags", []),
            relatedProductIds=[],
            timing=item.get("timing"),
        )
        for item in items
    ]


@router.get("/recommendations/{recommendation_id}", response_model=Recommendation)
async def get_recommendation(recommendation_id: str) -> Recommendation:
    for r in MOCK_RECOMMENDATIONS:
        if r.id == recommendation_id:
            return r
    raise HTTPException(status_code=404, detail="Recommendation not found")


@router.get("/products", response_model=list[Product])
async def list_products(category: Optional[str] = None) -> list[Product]:
    if category is None:
        return MOCK_PRODUCTS
    return [p for p in MOCK_PRODUCTS if p.category == category]
