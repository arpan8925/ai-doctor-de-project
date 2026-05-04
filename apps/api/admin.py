"""Admin operations — gated by `users/{uid}.role === "admin"`.

Approving a credit transaction increments the target user's wallet
atomically inside a Firestore transaction. Rejection just flips the
status — no balance change.
"""

from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from fastapi import Depends, HTTPException
from firebase_admin import auth as fb_auth, firestore
from google.cloud.firestore_v1 import transactional

from apps.api.auth import get_current_uid
from apps.api.firebase_app import get_app
from apps.api.wallet import _serialize_txn

# ─── Hardcoded admin allowlist (dev-only) ─────────────────────────────
# Add your phone number in E.164 format ("+91" + 10 digits, no spaces).
# Anyone signing in with one of these numbers is automatically promoted
# to `role: "admin"` on the next /me read or save — no env var, no
# manual Firestore edit. Not for production.
ADMIN_PHONES: set[str] = {
    "+917069736489",  # ← replace with your phone number
}


@lru_cache(maxsize=512)
def _phone_for_uid(uid: str) -> str | None:
    """Look up the Firebase Auth phone for a uid. Cached per-process."""
    get_app()
    try:
        return fb_auth.get_user(uid).phone_number
    except Exception:  # noqa: BLE001
        return None


def is_hardcoded_admin(uid: str) -> bool:
    if not ADMIN_PHONES:
        return False
    phone = _phone_for_uid(uid)
    return phone is not None and phone in ADMIN_PHONES


def _db():
    get_app()
    return firestore.client()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def is_admin(uid: str) -> bool:
    if is_hardcoded_admin(uid):
        return True
    snap = _db().collection("users").document(uid).get()
    if not snap.exists:
        return False
    return snap.to_dict().get("role") == "admin"


async def require_admin(uid: str = Depends(get_current_uid)) -> str:
    """FastAPI dependency that 403s non-admins."""
    if not is_admin(uid):
        raise HTTPException(status_code=403, detail="Admin only")
    return uid


_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def list_pending_topups(limit: int = 100) -> list[dict[str, Any]]:
    """All pending credit transactions across all users — newest first.

    Single `where(status==pending)` + Python-side filter on `type` and
    sort on `created_at` — avoids requiring a composite Firestore index.
    Pending top-ups are bounded (admin clears the queue), so the working
    set stays small.
    """
    db = _db()
    q = db.collection("transactions").where("status", "==", "pending")

    out = []
    for doc in q.stream():
        data = doc.to_dict()
        if data.get("type") != "credit":
            continue
        data["id"] = doc.id
        # Decorate with the requesting user's name (helpful in admin UI).
        user_snap = db.collection("users").document(data["uid"]).get()
        if user_snap.exists:
            data["user_name"] = (user_snap.to_dict() or {}).get("name", "Unknown")
        out.append(data)

    out.sort(key=lambda d: d.get("created_at") or _EPOCH, reverse=True)
    return [_serialize_txn(d) for d in out[:limit]]


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
