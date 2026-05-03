"""AI Doctor — FastAPI entrypoint.

Run (development):
    uv run uvicorn apps.api.main:app --reload --port 8000
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import litellm

from apps.api.auth import get_current_uid
from apps.api.config import get_settings
from apps.api.pdn.engine import step
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


class StartSessionResponse(BaseModel):
    session_id: str


@app.post("/sessions", response_model=StartSessionResponse)
def start_session(uid: str = Depends(get_current_uid)) -> StartSessionResponse:
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


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, uid: str = Depends(get_current_uid)) -> ChatResponse:
    state = get_session(req.session_id, uid)
    if state is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
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
    return ChatResponse(**result)
