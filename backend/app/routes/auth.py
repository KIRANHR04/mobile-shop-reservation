from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
import os

from ..security.admin_auth import create_admin_session, revoke_admin_session

router = APIRouter(prefix="/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: str
    password: str
    admin_token: str


@router.post("/login")
def login(data: LoginRequest):

    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    admin_token = os.getenv("ADMIN_TOKEN")

    if (
        data.email != admin_email
        or data.password != admin_password
        or data.admin_token != admin_token
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {
        "message": "Login successful",
        **create_admin_session(),
    }


@router.post("/logout")
def logout(authorization: str = Header(None)):
    revoke_admin_session(authorization)
    return {"message": "Logged out"}
