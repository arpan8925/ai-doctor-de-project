"""Admin operations — gated by `users/{uid}.role === "admin"`.

Approving a credit transaction increments the target user's wallet
atomically inside a Firestore transaction. Rejection just flips the
status — no balance change.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, HTTPException
from firebase_admin import firestore
from google.cloud.firestore_v1 import transactional

from apps.api.auth import get_current_uid
from apps.api.firebase_app import get_app
from apps.api.wallet import _serialize_txn


def _db():
    get_app()
    return firestore.client()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def is_admin(uid: str) -> bool:
    snap = _db().collection("users").document(uid).get()
    if not snap.exists:
        return False
    return snap.to_dict().get("role") == "admin"


async def require_admin(uid: str = Depends(get_current_uid)) -> str:
    """FastAPI dependency that 403s non-admins."""
    if not is_admin(uid):
        raise HTTPException(status_code=403, detail="Admin only")
    return uid


def list_pending_topups(limit: int = 100) -> list[dict[str, Any]]:
    """All pending credit transactions across all users — newest first."""
    q = (
        _db()
        .collection("transactions")
        .where("type", "==", "credit")
        .where("status", "==", "pending")
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(limit)
    )
    out = []
    for doc in q.stream():
        data = doc.to_dict()
        data["id"] = doc.id
        # Decorate with the requesting user's phone (helpful in admin UI).
        user_snap = _db().collection("users").document(data["uid"]).get()
        if user_snap.exists:
            udata = user_snap.to_dict()
            data["user_name"] = udata.get("name", "Unknown")
        out.append(_serialize_txn(data))
    return out


def approve_topup(txn_id: str, admin_uid: str) -> dict[str, Any]:
    db = _db()
    txn_ref = db.collection("transactions").document(txn_id)
    snap = txn_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn = snap.to_dict()
    if txn.get("type") != "credit":
        raise HTTPException(status_code=400, detail="Only credits are approvable")
    if txn.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Transaction is {txn.get('status')}")

    user_ref = db.collection("users").document(txn["uid"])
    amount = int(txn["amount_paise"])
    now = _now()

    @transactional
    def _apply(tx):
        usnap = user_ref.get(transaction=tx)
        balance = int(usnap.to_dict().get("balance_paise", 0)) if usnap.exists else 0
        tx.update(user_ref, {"balance_paise": balance + amount})
        tx.update(
            txn_ref,
            {
                "status": "approved",
                "approved_at": now,
                "approved_by": admin_uid,
                "updated_at": now,
            },
        )

    _apply(db.transaction())
    txn.update({"status": "approved", "approved_at": now, "approved_by": admin_uid, "updated_at": now})
    txn["id"] = txn_id
    return _serialize_txn(txn)


def reject_topup(txn_id: str, admin_uid: str, reason: str | None = None) -> dict[str, Any]:
    db = _db()
    txn_ref = db.collection("transactions").document(txn_id)
    snap = txn_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn = snap.to_dict()
    if txn.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Transaction is {txn.get('status')}")

    now = _now()
    update = {
        "status": "rejected",
        "approved_at": now,
        "approved_by": admin_uid,
        "updated_at": now,
    }
    if reason:
        update["rejection_reason"] = reason
    txn_ref.update(update)
    txn.update(update)
    txn["id"] = txn_id
    return _serialize_txn(txn)
