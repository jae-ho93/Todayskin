import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user
from ..gemini_client import GeminiUnavailable, generate_recommendations, generate_weather_products
from ..schemas import EvidenceGrade, GenerateRecommendationsRequest, Product, Recommendation, WeatherSnapshot

router = APIRouter(tags=["recommendations"])

# LLM이 만들어내지 않은, 우리가 통제하는 정직한 출처 표기 (허위 인용 방지)
GEMINI_SOURCE_LABEL = "AI 종합 분석 · 피부과학 일반 지식 기반"


def _to_recommendation(r: models.RecommendationRecord) -> Recommendation:
    return Recommendation(
        id=r.id,
        title=r.title,
        grade=r.grade,
        sourceLabel=r.source_label,
        explanation=r.explanation,
        observationalNote=r.observational_note,
        ingredientTags=r.ingredient_tags,
        relatedProductIds=r.related_product_ids,
        timing=r.timing,
    )


def _to_product(p: models.ProductRecord) -> Product:
    return Product(
        id=p.id,
        name=p.name,
        brand=p.brand,
        imageUri=p.image_uri,
        matchedGrade=p.matched_grade,
        matchedIngredients=p.matched_ingredients,
        category=p.category,
        recommendationId=p.recommendation_id,
    )


@router.get("/recommendations", response_model=list[Recommendation])
async def list_recommendations(
    grade: Optional[EvidenceGrade] = None, db: Session = Depends(get_db)
) -> list[Recommendation]:
    """
    오늘의 추천 카탈로그(전역, 유저 비종속). 근거등급(A/B/C) 로직은 7.1 근거 등급 체계를 따른다:
    A=공인 가이드라인, B=개별 임상/관찰 연구, C=개인 시계열 통계적 관찰.
    """
    query = db.query(models.RecommendationRecord).filter(models.RecommendationRecord.user_id.is_(None))
    if grade is not None:
        query = query.filter(models.RecommendationRecord.grade == grade)
    return [_to_recommendation(r) for r in query.all()]


@router.post("/recommendations/generate", response_model=list[Recommendation])
async def generate(
    payload: GenerateRecommendationsRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Recommendation]:
    """
    B등급(사진 기반) 매칭 로직: 오늘 피부 측정값 + 오늘 날씨를 Gemini에 함께 전달해
    확립된 피부과학 지식에 근거한 추천을 생성한다. 근거등급은 LLM이 아니라 서버가
    강제로 B로 고정하고, 출처도 LLM이 지어내지 못하도록 서버가 고정된 문구를 붙인다.
    GEMINI_API_KEY가 없거나 호출이 실패하면 가짜 데이터로 대체하지 않고 503을 반환한다 —
    호출부(프론트)가 "지금은 추천을 만들 수 없어요"를 명시적으로 보여줘야 한다.
    생성된 추천은 유저 + 해당 진단(diagnosis_id)에 연결해 이력으로 저장한다.
    """
    try:
        items = await generate_recommendations(
            payload.skinScore.model_dump(), payload.weather.model_dump()
        )
    except GeminiUnavailable as e:
        raise HTTPException(status_code=503, detail="AI 추천을 생성할 수 없어요. 잠시 후 다시 시도해주세요.") from e

    results = [
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

    for r in results:
        db.add(
            models.RecommendationRecord(
                id=f"{r.id}-{uuid.uuid4().hex[:6]}",
                user_id=current_user.id,
                diagnosis_id=payload.skinScore.id,
                title=r.title,
                grade=r.grade,
                source_label=r.sourceLabel,
                explanation=r.explanation,
                observational_note=r.observationalNote,
                ingredient_tags=r.ingredientTags,
                related_product_ids=r.relatedProductIds,
                timing=r.timing,
            )
        )
    db.commit()

    return results


@router.get("/recommendations/{recommendation_id}", response_model=Recommendation)
async def get_recommendation(recommendation_id: str, db: Session = Depends(get_db)) -> Recommendation:
    record = (
        db.query(models.RecommendationRecord)
        .filter(models.RecommendationRecord.id == recommendation_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return _to_recommendation(record)


@router.get("/products", response_model=list[Product])
async def list_products(category: Optional[str] = None, db: Session = Depends(get_db)) -> list[Product]:
    query = db.query(models.ProductRecord)
    if category is not None:
        query = query.filter(models.ProductRecord.category == category)
    return [_to_product(p) for p in query.all()]


@router.post("/products/weather-based", response_model=list[Product])
async def weather_based_products(weather: WeatherSnapshot) -> list[Product]:
    """
    날씨 기반(A등급) 제품 추천: 사용자 촬영 데이터 없이 오늘 날씨/대기질만으로 하루 중 실제로
    화장품을 쓰는 세 상황(세안 후/외출 전/외출 후)별로 화장품을 하나씩 Gemini에게 추천받는다.
    유저 비종속이라 DB에 저장하지 않고, GEMINI_API_KEY가 없거나 호출 실패 시 가짜 데이터로
    대체하지 않고 503을 반환한다 — 프론트가 "지금은 추천을 만들 수 없어요"를 명시적으로 보여준다.
    """
    try:
        items = await generate_weather_products(weather.model_dump())
    except GeminiUnavailable as e:
        raise HTTPException(status_code=503, detail="AI 추천을 생성할 수 없어요. 잠시 후 다시 시도해주세요.") from e

    return [
        Product(
            id=f"gemini-product-{uuid.uuid4().hex[:8]}",
            name=item["name"],
            brand=item["brand"],
            matchedGrade="A",
            matchedIngredients=item.get("ingredientTags", []),
            category=item["category"],
            reason=item.get("explanation"),
            timing=item["timing"],
        )
        for item in items
    ]
