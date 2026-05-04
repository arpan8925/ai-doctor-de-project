"""Firestore-backed session store.

Sessions live under the `sessions` collection, keyed by session_id.
Each document is owned by a uid — get_session refuses cross-uid access.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from firebase_admin import firestore

from apps.api.firebase_app import get_app
from apps.api.pdn.engine import PdnState
from apps.api.pdn.red_flags import RULES

_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _db():
    get_app()
    return firestore.client()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(ts: Any) -> str | None:
    if ts is None:
        return None
    if hasattr(ts, "isoformat"):
        return ts.isoformat()
    return None


def _state_to_doc(state: PdnState, uid: str) -> dict[str, Any]:
    rule_data = None
    if state.red_flag_rule:
        rule_data = {
            "id": state.red_flag_rule.id,
            "label": state.red_flag_rule.label,
            "rationale": state.red_flag_rule.rationale,
            "severity": state.red_flag_rule.severity,
        }
    return {
        "uid": uid,
        "session_id": state.session_id,
        "candidates": state.candidates,
        "candidate_names": state.candidate_names,
        "initial_entropy": state.initial_entropy,
        "transcript": state.transcript,
        "red_flag_active": state.red_flag_active,
        "red_flag_rule": rule_data,
        "lab_reports_received": state.lab_reports_received,
        "cost_usd": state.cost_usd,
        "ended": state.ended,
    }


def _doc_to_state(doc: dict[str, Any]) -> PdnState:
    rule = None
    if doc.get("red_flag_rule"):
        rd = doc["red_flag_rule"]
        rule = next((r for r in RULES if r.id == rd["id"]), None)
    return PdnState(
        session_id=doc["session_id"],
        candidates=dict(doc.get("candidates", {})),
        candidate_names=dict(doc.get("candidate_names", {})),
        initial_entropy=float(doc.get("initial_entropy", 0.0)),
        transcript=list(doc.get("transcript", [])),
        red_flag_active=bool(doc.get("red_flag_active", False)),
        red_flag_rule=rule,
        lab_reports_received=int(doc.get("lab_reports_received", 0)),
        cost_usd=float(doc.get("cost_usd", 0.0)),
        ended=bool(doc.get("ended", False)),
    )


def create_session(uid: str) -> PdnState:
    sid = str(uuid.uuid4())
    state = PdnState(session_id=sid)
    now = _now()
    doc = {**_state_to_doc(state, uid), "created_at": now, "updated_at": now}
    _db().collection("sessions").document(sid).set(doc)
    return state


def get_session(sid: str, uid: str) -> PdnState | None:
    snap = _db().collection("sessions").document(sid).get()
    if not snap.exists:
        return None
    data = snap.to_dict()
    if data.get("uid") != uid:
        return None
    return _doc_to_state(data)


def save_session(state: PdnState, uid: str) -> None:
    # merge=True so we don't clobber created_at on later writes.
    _db().collection("sessions").document(state.session_id).set(
        {**_state_to_doc(state, uid), "updated_at": _now()},
        merge=True,
    )


def _summarize(data: dict[str, Any]) -> dict[str, Any]:
    """Reduce a session doc to what the sidebar needs."""
    state = _doc_to_state(data)

    # Title: top-candidate name if we have a differential; otherwise the first
    # user message, truncated; otherwise "New consult".
    title: str
    if state.candidates:
        top_icd = max(state.candidates.items(), key=lambda kv: kv[1])[0]
        title = state.candidate_names.get(top_icd, top_icd)
    else:
        first_user = next(
            (m.get("content", "") for m in state.transcript if m.get("role") == "user"),
            "",
        )
        if first_user:
            t = first_user.strip()
            title = (t[:60] + "…") if len(t) > 60 else t
        else:
            title = "New consult"

    if state.ended:
        status = "closed"
    elif state.action() == "request_labs":
        status = "awaiting_labs"
    else:
        status = "active"

    return {
        "id": state.session_id,
        "title": title,
        "status": status,
        "score": state.score(),
        "created_at": _iso(data.get("created_at")),
        "updated_at": _iso(data.get("updated_at") or data.get("created_at")),
    }


def delete_session(sid: str, uid: str) -> bool:
    """Remove a session document. Returns False if it doesn't exist or
    isn't owned by `uid`. Caller is responsible for refusing if the
    session still has unsettled cost."""
    ref = _db().collection("sessions").document(sid)
    snap = ref.get()
    if not snap.exists:
        return False
    if (snap.to_dict() or {}).get("uid") != uid:
        return False
    ref.delete()
    return True


def list_sessions(uid: str, limit: int = 10) -> list[dict[str, Any]]:
    """Recent sessions for a user — newest first.

    Single `where(uid==X)` + Python-side sort to avoid needing a composite
    Firestore index. A user's session count stays small (one per consult).
    """
    q = _db().collection("sessions").where("uid", "==", uid)
    docs = [doc.to_dict() or {} for doc in q.stream()]
    docs.sort(
        key=lambda d: d.get("updated_at") or d.get("created_at") or _EPOCH,
        reverse=True,
    )
    return [_summarize(d) for d in docs[:limit]]
