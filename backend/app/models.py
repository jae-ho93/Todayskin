from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    gender: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # "male" | "female" | None(선택 안 함)
    access_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class SkinDiagnosis(Base):
    __tablename__ = "skin_diagnoses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    overall_score: Mapped[float] = mapped_column(Float, nullable=False)
    thumbnail_uri: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    parts: Mapped[list["SkinPartMetric"]] = relationship(
        back_populates="diagnosis", cascade="all, delete-orphan"
    )


class SkinPartMetric(Base):
    __tablename__ = "skin_part_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    diagnosis_id: Mapped[str] = mapped_column(ForeignKey("skin_diagnoses.id"), nullable=False, index=True)
    part: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    grade: Mapped[str] = mapped_column(String(20), nullable=False)
    moisture: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    elasticity: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    diagnosis: Mapped[SkinDiagnosis] = relationship(back_populates="parts")


class RecommendationRecord(Base):
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    diagnosis_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("skin_diagnoses.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    grade: Mapped[str] = mapped_column(String(1), nullable=False)
    source_label: Mapped[str] = mapped_column(String(200), nullable=False)
    explanation: Mapped[str] = mapped_column(String(1000), nullable=False)
    observational_note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    ingredient_tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    related_product_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    timing: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


class ProductRecord(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand: Mapped[str] = mapped_column(String(100), nullable=False)
    image_uri: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    matched_grade: Mapped[str] = mapped_column(String(1), nullable=False)
    matched_ingredients: Mapped[list[str]] = mapped_column(JSON, default=list)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    recommendation_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
