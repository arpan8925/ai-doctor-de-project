"""Firestore-backed session store.

Sessions live under the `sessions` collection, keyed by session_id.
Each document is owned by a uid — get_session refuses cross-uid access.
"""

from __future__ import annotations

import uuid
from typing import Any

from firebase_admin import firestore

from apps.api.firebase_app import get_app
from apps.api.pdn.engine import PdnState
from apps.api.pdn.red_flags import RULES


def _db():
    get_app()
    return firestore.client()


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
    )


def create_session(uid: str) -> PdnState:
    sid = str(uuid.uuid4())
    state = PdnState(session_id=sid)
    _db().collection("sessions").document(sid).set(_state_to_doc(state, uid))
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
    _db().collection("sessions").document(state.session_id).set(
        _state_to_doc(state, uid)
    )
