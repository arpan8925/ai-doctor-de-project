"""FastAPI dependency that verifies a Firebase ID token and returns the uid."""

from __future__ import annotations

from fastapi import Header, HTTPException
from firebase_admin import auth as fb_auth

from apps.api.firebase_app import get_app


async def get_current_uid(authorization: str = Header(...)) -> str:
    get_app()
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization[7:]
    try:
        decoded = fb_auth.verify_id_token(token)
        return str(decoded["uid"])
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
