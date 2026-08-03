from fastapi import APIRouter, UploadFile

from ..mock_data import MOCK_SKIN_SCORE
from ..schemas import SkinScoreSnapshot

router = APIRouter(prefix="/diagnosis", tags=["diagnosis"])


@router.get("/latest", response_model=SkinScoreSnapshot)
async def get_latest_diagnosis() -> SkinScoreSnapshot:
    """가장 최근 촬영에 대한 피부 측정값. 실연동 시 사용자별 최신 레코드 조회로 교체."""
    return MOCK_SKIN_SCORE


@router.post("", response_model=SkinScoreSnapshot)
async def submit_diagnosis(front: UploadFile, left: UploadFile, right: UploadFile) -> SkinScoreSnapshot:
    """
    정면/좌/우 3장의 안면 이미지를 받아 11개 부위별 ResNet 앙상블 추론 결과를 반환.
    현재는 모델 서빙 파이프라인(ONNX Runtime) 연동 전이므로 목업 값을 반환하며,
    원본 이미지는 저장하지 않고 요청 처리 후 즉시 폐기한다(개인정보보호법 원칙 준수).
    """
    return MOCK_SKIN_SCORE
