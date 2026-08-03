from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()  # backend/.env 로부터 KMA_API_KEY 등 환경변수 로드

from . import models  # noqa: E402
from .database import Base, SessionLocal, engine  # noqa: E402
from .routers import auth, diagnosis, recommendations, weather  # noqa: E402
from .seed import seed_if_empty  # noqa: E402

Base.metadata.create_all(bind=engine)

with SessionLocal() as _seed_db:
    seed_if_empty(_seed_db)

app = FastAPI(
    title="Weatherskin API",
    description="날씨 연동 AI 피부 진단 및 맞춤형 화장품 추천 서비스 — 백엔드 스텁",
    version="0.1.0",
)

# Expo 개발 서버(웹/시뮬레이터/실기기)에서의 로컬 접근을 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(weather.router)
app.include_router(diagnosis.router)
app.include_router(recommendations.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
