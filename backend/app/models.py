from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
