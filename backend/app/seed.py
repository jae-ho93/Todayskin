from sqlalchemy.orm import Session

from . import models
from .mock_data import MOCK_PRODUCTS, MOCK_RECOMMENDATIONS


def seed_if_empty(db: Session) -> None:
    """앱 최초 구동 시 전역 추천 카탈로그(A/C 등급 고정 문구)와 제품 카탈로그를 채워 넣는다.
    유저별 개인 데이터(user_id/diagnosis_id)는 여기서 만들지 않는다."""
    if db.query(models.RecommendationRecord).count() == 0:
        for r in MOCK_RECOMMENDATIONS:
            db.add(
                models.RecommendationRecord(
                    id=r.id,
                    user_id=None,
                    diagnosis_id=None,
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

    if db.query(models.ProductRecord).count() == 0:
        for p in MOCK_PRODUCTS:
            db.add(
                models.ProductRecord(
                    id=p.id,
                    name=p.name,
                    brand=p.brand,
                    image_uri=p.imageUri,
                    matched_grade=p.matchedGrade,
                    matched_ingredients=p.matchedIngredients,
                    category=p.category,
                    recommendation_id=p.recommendationId,
                )
            )

    db.commit()
