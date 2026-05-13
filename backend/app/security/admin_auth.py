from datetime import datetime, timedelta
from secrets import token_urlsafe

from fastapi import Header, HTTPException


SESSION_TIMEOUT = timedelta(minutes=5)
_admin_sessions = {}


def create_admin_session():
    session_token = token_urlsafe(32)
    now = datetime.utcnow()
    _admin_sessions[session_token] = now
    return {
        "access_token": session_token,
        "expires_in": int(SESSION_TIMEOUT.total_seconds()),
    }


def revoke_admin_session(authorization: str = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "")
        _admin_sessions.pop(token, None)


def verify_admin_token(authorization: str = Header(None)):

    if authorization is None:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    token = authorization.replace("Bearer ", "")
    now = datetime.utcnow()
    last_seen = _admin_sessions.get(token)

    if last_seen is None:
        raise HTTPException(status_code=403, detail="Invalid admin session")

    if now - last_seen > SESSION_TIMEOUT:
        _admin_sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Admin session expired")

    _admin_sessions[token] = now

    return True
