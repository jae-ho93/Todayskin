import secrets
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_current_user
from ..schemas import LoginRequest, SignupRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_user_response(user: models.User) -> UserResponse:
    assert user.access_token is not None
    return UserResponse(
        id=user.id,
        phoneNumber=user.phone_number,
        name=user.name,
        birthDate=user.birth_date.isoformat(),
        createdAt=user.created_at.isoformat(),
        accessToken=user.access_token,
    )


@router.post("/signup", response_model=UserResponse, status_code=201)
async def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> UserResponse:
    """휴대폰 번호/이름/생년월일만으로 가입. 휴대폰 번호는 유일해야 한다."""
    existing = db.query(models.User).filter(models.User.phone_number == payload.phoneNumber).first()
    if existing:
        raise HTTPException(status_code=409, detail="이미 가입된 휴대폰 번호입니다")

    user = models.User(
        phone_number=payload.phoneNumber,
        name=payload.name,
        birth_date=date.fromisoformat(payload.birthDate),
        access_token=secrets.token_urlsafe(32),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return _to_user_response(user)


@router.post("/login", response_model=UserResponse)
async def login(payload: LoginRequest, db: Session = Depends(get_db)) -> UserResponse:
    """
    비밀번호 없이 휴대폰 번호만으로 로그인. MVP 단계의 단순 인증이며,
    실제 서비스로 넘어가면 SMS 인증번호 등 본인확인 절차가 추가로 필요하다.
    """
    user = db.query(models.User).filter(models.User.phone_number == payload.phoneNumber).first()
    if not user:
        raise HTTPException(status_code=404, detail="가입되지 않은 휴대폰 번호입니다")

    user.access_token = secrets.token_urlsafe(32)
    db.commit()
    db.refresh(user)

    return _to_user_response(user)


@router.post("/logout", status_code=204)
async def logout(
    current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    current_user.access_token = None
    db.commit()
