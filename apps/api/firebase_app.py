"""Firebase Admin SDK — initialize once, reuse everywhere."""

from __future__ import annotations

import firebase_admin
from firebase_admin import credentials

_app: firebase_admin.App | None = None


def get_app() -> firebase_admin.App:
    global _app
    if _app is not None:
        return _app
    from apps.api.config import get_settings
    settings = get_settings()
    cred = credentials.Certificate(str(settings.firebase_service_account))
    _app = firebase_admin.initialize_app(cred)
    return _app
