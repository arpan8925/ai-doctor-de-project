"""In-memory session store. Postgres-backed implementation lands in week 8
once day-spanning sessions need real persistence (resume links, lab uploads).
"""

from __future__ import annotations

import uuid
from threading import Lock

from apps.api.pdn.engine import PdnState

_lock = Lock()
_sessions: dict[str, PdnState] = {}


def create_session() -> PdnState:
    sid = str(uuid.uuid4())
    state = PdnState(session_id=sid)
    with _lock:
        _sessions[sid] = state
    return state


def get_session(sid: str) -> PdnState | None:
    with _lock:
        return _sessions.get(sid)
