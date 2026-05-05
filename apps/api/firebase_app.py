"""Firebase Admin SDK — initialize once, reuse everywhere.

Resolution order:
1. ``FIREBASE_SERVICE_ACCOUNT_JSON`` env var (preferred for hosted deploys —
   Render/Vercel/Fly inject the whole JSON as a string).
2. File at ``settings.firebase_service_account`` (local dev convenience).
"""

from __future__ import annotations

import json

import firebase_admin
from firebase_admin import credentials

_app: firebase_admin.App | None = None


def get_app() -> firebase_admin.App:
    global _app
    if _app is not None:
        return _app
    from apps.api.config import get_settings
    settings = get_settings()

    if settings.firebase_service_account_json.strip():
        cred = credentials.Certificate(json.loads(settings.firebase_service_account_json))
    elif settings.firebase_service_account.exists():
        cred = credentials.Certificate(str(settings.firebase_service_account))
    else:
        raise RuntimeError(
            "No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON "
            "(stringified JSON) or place the service-account file at "
            f"{settings.firebase_service_account}."
        )

    _app = firebase_admin.initialize_app(cred)
    return _app
