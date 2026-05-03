"""Patient profile — Firestore CRUD under users/{uid}."""

from __future__ import annotations

from typing import Any

from firebase_admin import firestore
from pydantic import BaseModel, Field

from apps.api.firebase_app import get_app


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    age: int = Field(ge=1, le=120)
    sex: str = Field(pattern="^(M|F|O)$")
    allergies: list[str] = Field(default_factory=list)


class ProfileOut(ProfileIn):
    uid: str


def _col():
    get_app()
    return firestore.client().collection("users")


def get_profile(uid: str) -> dict[str, Any] | None:
    snap = _col().document(uid).get()
    if not snap.exists:
        return None
    return snap.to_dict()


def save_profile(uid: str, data: dict[str, Any]) -> None:
    _col().document(uid).set({"uid": uid, "onboarded": True, **data})
