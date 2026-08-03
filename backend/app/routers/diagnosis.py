import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user
from ..mock_data import MOCK_SKIN_SCORE
from ..schemas import HistoryEntry, SkinPartMetric, SkinScoreSnapshot

router = APIRouter(prefix="/diagnosis", tags=["diagnosis"])


def _to_snapshot(diagnosis: models.SkinDiagnosis) -> SkinScoreSnapshot:
    return SkinScoreSnapshot(
        id=diagnosis.id,
        capturedAt=diagnosis.captured_at.isoformat(),
        overallScore=diagnosis.overall_score,
        thumbnailUri=diagnosis.thumbnail_uri,
        parts=[
            SkinPartMetric(
                part=p.part,
                label=p.label,
                grade=p.grade,
                moisture=p.moisture,
                elasticity=p.elasticity,
                note=p.note,
            )
            for p in diagnosis.parts
        ],
    )


@router.get("/latest", response_model=SkinScoreSnapshot)
async def get_latest_diagnosis(
    current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SkinScoreSnapshot:
    """로그인한 유저의 가장 최근 촬영 진단. 아직 한 번도 촬영하지 않았다면 404."""
    diagnosis = (
        db.query(models.SkinDiagnosis)
        .filter(models.SkinDiagnosis.user_id == current_user.id)
        .order_by(models.SkinDiagnosis.captured_at.desc())
        .first()
    )
    if not diagnosis:
        raise HTTPException(status_code=404, detail="아직 촬영한 기록이 없습니다")

    return _to_snapshot(diagnosis)


@router.get("/history", response_model=list[HistoryEntry])
async def get_diagnosis_history(
    current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[HistoryEntry]:
    """로그인한 유저의 전체 촬영 이력을 최신순으로 반환 (마이 히스토리 화면용)."""
    diagnoses = (
        db.query(models.SkinDiagnosis)
        .filter(models.SkinDiagnosis.user_id == current_user.id)
        .order_by(models.SkinDiagnosis.captured_at.desc())
        .all()
    )
    return [
        HistoryEntry(
            id=d.id,
            capturedAt=d.captured_at.isoformat(),
            overallScore=d.overall_score,
            thumbnailUri=d.thumbnail_uri,
        )
        for d in diagnoses
    ]


@router.post("", response_model=SkinScoreSnapshot)
async def submit_diagnosis(
    front: UploadFile,
    left: UploadFile,
    right: UploadFile,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SkinScoreSnapshot:
    """
    정면/좌/우 3장의 안면 이미지를 받아 11개 부위별 ResNet 앙상블 추론 결과를 반환.
    현재는 모델 서빙 파이프라인(ONNX Runtime) 연동 전이므로 목업 값을 사용하며,
    원본 이미지는 저장하지 않고 요청 처리 후 즉시 폐기한다(개인정보보호법 원칙 준수).
    측정값 자체는 히스토리/추천 연동을 위해 유저별로 DB에 저장한다.
    """
    diagnosis = models.SkinDiagnosis(
        id=f"snap-{uuid.uuid4().hex[:12]}",
        user_id=current_user.id,
        captured_at=datetime.now(timezone.utc),
        overall_score=MOCK_SKIN_SCORE.overallScore,
    )
    db.add(diagnosis)
    for part in MOCK_SKIN_SCORE.parts:
        db.add(
            models.SkinPartMetric(
                diagnosis_id=diagnosis.id,
                part=part.part,
                label=part.label,
                grade=part.grade,
                moisture=part.moisture,
                elasticity=part.elasticity,
                note=part.note,
            )
        )
    db.commit()
    db.refresh(diagnosis)

    return _to_snapshot(diagnosis)
