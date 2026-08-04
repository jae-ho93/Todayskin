import re
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

PHONE_PATTERN = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$")

EvidenceGrade = Literal["A", "B", "C"]
AirStatus = Literal["good", "moderate", "bad"]
FacePart = Literal["forehead", "glabella", "eyeArea", "cheek", "lips", "jaw"]
Gender = Literal["male", "female"]


class WeatherSnapshot(BaseModel):
    observedAt: str
    regionName: str
    uvIndex: float
    uvStatus: AirStatus
    uvIndexPeak: Optional[float] = None  # 오늘 남은 시간대 중 예상 최댓값
    uvStatusPeak: Optional[AirStatus] = None
    uvIndexPeakHour: Optional[int] = None  # 그 최댓값이 나오는 시각(0~23시)
    ozonePpm: float
    ozoneStatus: AirStatus
    pm25: float
    pm25Status: AirStatus
    pm10: float
    pm10Status: AirStatus
    caiValue: Optional[float] = None  # 통합대기환경지수(CAI)
    caiStatus: Optional[AirStatus] = None
    no2Value: Optional[float] = None
    so2Value: Optional[float] = None
    coValue: Optional[float] = None


class SkinPartMetric(BaseModel):
    part: FacePart
    label: str
    grade: str
    moisture: Optional[float] = None
    elasticity: Optional[float] = None
    note: Optional[str] = None


class SkinScoreSnapshot(BaseModel):
    id: str
    capturedAt: str
    overallScore: float
    thumbnailUri: Optional[str] = None
    parts: list[SkinPartMetric]


class Recommendation(BaseModel):
    id: str
    title: str
    grade: EvidenceGrade
    sourceLabel: str
    explanation: str
    observationalNote: Optional[str] = None
    ingredientTags: list[str]
    relatedProductIds: list[str]
    timing: Optional[Literal["외출 후", "자기 전", "언제든"]] = None


class Product(BaseModel):
    id: str
    name: str
    brand: str
    imageUri: Optional[str] = None
    matchedGrade: EvidenceGrade
    matchedIngredients: list[str]
    category: Literal["moisture", "elasticity", "brightening", "barrier"]
    recommendationId: Optional[str] = None
    reason: Optional[str] = None  # 날씨 기반 등, 근거 설명을 별도 Recommendation 레코드 없이 바로 보여줄 때 사용


class SignupRequest(BaseModel):
    phoneNumber: str
    name: str
    birthDate: str  # "YYYY-MM-DD"
    gender: Optional[Gender] = None  # 선택 입력. 추후 피부 측정/추천 모델의 조건 변수로 활용 예정

    @field_validator("phoneNumber")
    @classmethod
    def validate_phone_number(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_PATTERN.match(v):
            raise ValueError("올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)")
        return v.replace("-", "")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 20):
            raise ValueError("이름은 1~20자여야 합니다")
        return v

    @field_validator("birthDate")
    @classmethod
    def validate_birth_date(cls, v: str) -> str:
        try:
            parsed = date.fromisoformat(v)
        except ValueError as e:
            raise ValueError("생년월일 형식이 올바르지 않습니다 (예: 2000-01-01)") from e
        today = date.today()
        if parsed > today:
            raise ValueError("생년월일이 오늘보다 미래일 수 없습니다")
        if parsed.year < today.year - 120:
            raise ValueError("생년월일을 다시 확인해주세요")
        return v


class UserResponse(BaseModel):
    id: int
    phoneNumber: str
    name: str
    birthDate: str
    gender: Optional[Gender] = None
    createdAt: str
    accessToken: str


class HistoryEntry(BaseModel):
    id: str
    capturedAt: str
    overallScore: float
    thumbnailUri: Optional[str] = None


class LoginRequest(BaseModel):
    phoneNumber: str

    @field_validator("phoneNumber")
    @classmethod
    def validate_phone_number(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_PATTERN.match(v):
            raise ValueError("올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)")
        return v.replace("-", "")


class GenerateRecommendationsRequest(BaseModel):
    skinScore: SkinScoreSnapshot
    weather: WeatherSnapshot
