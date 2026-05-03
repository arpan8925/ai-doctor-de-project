"""AI Doctor — FastAPI entrypoint.

Run (development):
    uv run uvicorn apps.api.main:app --reload --port 8000
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import litellm

from apps.api import admin, wallet
from apps.api.auth import get_current_uid
from apps.api.config import get_settings
from apps.api.pdn.engine import step
from apps.api.profile import ProfileIn, ProfileOut, get_profile, save_profile
from apps.api.sessions import create_session, get_session, save_session

settings = get_settings()
app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "app": settings.app_name,
        "gemini_configured": bool(settings.gemini_api_key),
    }


# ─── profile ──────────────────────────────────────────────────────────


@app.get("/me", response_model=ProfileOut)
def get_me(uid: str = Depends(get_current_uid)) -> ProfileOut:
    data = get_profile(uid)
    if data is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return ProfileOut(**data)


@app.post("/me", response_model=ProfileOut)
def save_me(body: ProfileIn, uid: str = Depends(get_current_uid)) -> ProfileOut:
    save_profile(uid, body.model_dump())
    saved = get_profile(uid) or {}
    return ProfileOut(**saved)


# ─── sessions / chat ──────────────────────────────────────────────────


class StartSessionResponse(BaseModel):
    session_id: str


@app.post("/sessions", response_model=StartSessionResponse)
def start_session(uid: str = Depends(get_current_uid)) -> StartSessionResponse:
    # Block creation if balance is negative — settle pending charges first.
    balance = wallet.get_balance(uid)
    if balance < 0:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "insufficient_balance",
                "balance_paise": balance,
                "message": "Wallet balance is negative. Please top up to start a new consultation.",
            },
        )
    state = create_session(uid)
    return StartSessionResponse(session_id=state.session_id)


class ChatRequest(BaseModel):
    session_id: str
    message: str


class DifferentialItem(BaseModel):
    icd10: str
    name: str
    probability: float


class RedFlag(BaseModel):
    rule_id: str
    label: str
    rationale: str
    severity: str


class ChatResponse(BaseModel):
    ui: str
    score: int
    action: str
    differential: list[DifferentialItem]
    red_flag: RedFlag | None = None
    cost_usd: float = 0.0
    settled: bool = False  # True when this turn auto-settled the session


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, uid: str = Depends(get_current_uid)) -> ChatResponse:
    state = get_session(req.session_id, uid)
    if state is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    if state.ended:
        raise HTTPException(status_code=409, detail="Session has already ended.")
    try:
        result = step(state, req.message)
        save_session(state, uid)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except litellm.AuthenticationError as e:
        raise HTTPException(status_code=502, detail=f"Upstream auth failed: {e.message}") from e
    except litellm.RateLimitError as e:
        raise HTTPException(status_code=502, detail=f"Upstream rate-limited: {e.message}") from e
    except litellm.BadRequestError as e:
        raise HTTPException(status_code=502, detail=f"Upstream rejected request: {e.message}") from e
    except litellm.APIConnectionError as e:
        raise HTTPException(status_code=502, detail=f"Upstream unreachable: {e.message}") from e
    except litellm.APIError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e.message}") from e

    settled = False
    # Auto-settle on terminal actions (commit / escalate).
    if result["action"] in ("commit", "escalate"):
        wallet.settle_session(uid, state.session_id, state.cost_usd)
        state.ended = True
        save_session(state, uid)
        settled = True

    return ChatResponse(**result, cost_usd=state.cost_usd, settled=settled)


class EndSessionResponse(BaseModel):
    settled: bool
    cost_usd: float
    debit_paise: int


@app.post("/sessions/{session_id}/end", response_model=EndSessionResponse)
def end_session(session_id: str, uid: str = Depends(get_current_uid)) -> EndSessionResponse:
    """Manually end a session and settle the wallet. Idempotent."""
    state = get_session(session_id, uid)
    if state is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    txn = wallet.settle_session(uid, session_id, state.cost_usd)
    state.ended = True
    save_session(state, uid)
    return EndSessionResponse(
        settled=txn is not None,
        cost_usd=state.cost_usd,
        debit_paise=int(txn["amount_paise"]) if txn else 0,
    )


# ─── wallet ───────────────────────────────────────────────────────────


class WalletState(BaseModel):
    balance_paise: int
    transactions: list[dict[str, Any]]


@app.get("/wallet", response_model=WalletState)
def get_wallet(uid: str = Depends(get_current_uid)) -> WalletState:
    return WalletState(
        balance_paise=wallet.get_balance(uid),
        transactions=wallet.list_transactions(uid),
    )


class TopupRequest(BaseModel):
    amount_paise: int = Field(gt=0)


@app.post("/wallet/topup")
def post_topup(body: TopupRequest, uid: str = Depends(get_current_uid)) -> dict[str, Any]:
    try:
        return wallet.request_topup(uid, body.amount_paise)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ─── admin ────────────────────────────────────────────────────────────


@app.get("/admin/transactions/pending")
def admin_list_pending(_admin_uid: str = Depends(admin.require_admin)) -> list[dict[str, Any]]:
    return admin.list_pending_topups()


@app.post("/admin/transactions/{txn_id}/approve")
def admin_approve(txn_id: str, admin_uid: str = Depends(admin.require_admin)) -> dict[str, Any]:
    return admin.approve_topup(txn_id, admin_uid)


class RejectRequest(BaseModel):
    reason: str | None = None


@app.post("/admin/transactions/{txn_id}/reject")
def admin_reject(
    txn_id: str,
    body: RejectRequest,
    admin_uid: str = Depends(admin.require_admin),
) -> dict[str, Any]:
    return admin.reject_topup(txn_id, admin_uid, body.reason)
