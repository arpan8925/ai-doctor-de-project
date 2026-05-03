"""Wallet operations — Firestore-backed.

Schema:
- `users/{uid}` has `balance_paise` (int) + `role` ("user"|"admin")
- `transactions/{txnId}` documents with:
    - uid, type ("credit"|"debit"), amount_paise (positive),
    - status ("pending"|"approved"|"rejected"|"completed"),
    - created_at, updated_at, note,
    - For debits: session_id (idempotency key)
    - For credits: payment_method ("test_gateway"), approved_by, approved_at

Money rules:
- balance_paise is the source of truth; transactions are the audit log.
- Credits are pending until an admin approves them; only on approval is
  the balance incremented (atomically inside a Firestore transaction).
- Debits are written as 'completed' and immediately decrement balance.
- A debit for a given session_id is idempotent — second call is a no-op.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from firebase_admin import firestore
from google.cloud.firestore_v1 import transactional

from apps.api.config import get_settings
from apps.api.firebase_app import get_app
from apps.api.pricing import usd_to_paise


def _db():
    get_app()
    return firestore.client()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_balance(uid: str) -> int:
    snap = _db().collection("users").document(uid).get()
    if not snap.exists:
        return 0
    return int(snap.to_dict().get("balance_paise", 0))


def list_transactions(uid: str, limit: int = 25) -> list[dict[str, Any]]:
    """Most recent transactions first."""
    q = (
        _db()
        .collection("transactions")
        .where("uid", "==", uid)
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(limit)
    )
    out = []
    for doc in q.stream():
        data = doc.to_dict()
        data["id"] = doc.id
        out.append(_serialize_txn(data))
    return out


def _serialize_txn(data: dict[str, Any]) -> dict[str, Any]:
    """Convert Firestore Timestamp objects to ISO strings for JSON."""
    for key in ("created_at", "updated_at", "approved_at"):
        v = data.get(key)
        if v is not None and hasattr(v, "isoformat"):
            data[key] = v.isoformat()
    return data


def request_topup(uid: str, amount_paise: int) -> dict[str, Any]:
    """Create a pending credit transaction. Awaits admin approval."""
    settings = get_settings()
    if amount_paise < settings.topup_min_paise:
        raise ValueError(f"Minimum top-up is {settings.topup_min_paise} paise")
    if amount_paise > settings.topup_max_paise:
        raise ValueError(f"Maximum top-up is {settings.topup_max_paise} paise")

    txn_id = str(uuid.uuid4())
    now = _now()
    doc = {
        "id": txn_id,
        "uid": uid,
        "type": "credit",
        "amount_paise": int(amount_paise),
        "status": "pending",
        "payment_method": "test_gateway",
        "created_at": now,
        "updated_at": now,
        "note": "Wallet top-up via test gateway",
    }
    _db().collection("transactions").document(txn_id).set(doc)
    return _serialize_txn(dict(doc))


def settle_session(uid: str, session_id: str, cost_usd: float) -> dict[str, Any] | None:
    """Charge the wallet for accumulated LLM cost on this session.

    Idempotent — if a debit transaction for this session already exists,
    returns None without double-charging.
    """
    settings = get_settings()
    paise = usd_to_paise(cost_usd, settings.inr_per_usd)
    if paise <= 0:
        return None

    db = _db()
    # Idempotency: check for existing debit on this session_id
    existing = (
        db.collection("transactions")
        .where("uid", "==", uid)
        .where("type", "==", "debit")
        .where("session_id", "==", session_id)
        .limit(1)
        .get()
    )
    if existing:
        return None

    txn_id = str(uuid.uuid4())
    user_ref = db.collection("users").document(uid)
    txn_ref = db.collection("transactions").document(txn_id)
    now = _now()

    @transactional
    def _apply(tx):
        snap = user_ref.get(transaction=tx)
        balance = int(snap.to_dict().get("balance_paise", 0)) if snap.exists else 0
        tx.update(user_ref, {"balance_paise": balance - paise})
        tx.set(
            txn_ref,
            {
                "id": txn_id,
                "uid": uid,
                "type": "debit",
                "amount_paise": int(paise),
                "status": "completed",
                "session_id": session_id,
                "cost_usd": float(cost_usd),
                "created_at": now,
                "updated_at": now,
                "note": "AI Doctor consultation usage",
            },
        )

    _apply(db.transaction())
    return _serialize_txn(
        {
            "id": txn_id,
            "uid": uid,
            "type": "debit",
            "amount_paise": int(paise),
            "status": "completed",
            "session_id": session_id,
            "cost_usd": float(cost_usd),
            "created_at": now,
            "updated_at": now,
            "note": "AI Doctor consultation usage",
        }
    )


def session_already_settled(uid: str, session_id: str) -> bool:
    existing = (
        _db()
        .collection("transactions")
        .where("uid", "==", uid)
        .where("type", "==", "debit")
        .where("session_id", "==", session_id)
        .limit(1)
        .get()
    )
    return len(existing) > 0
