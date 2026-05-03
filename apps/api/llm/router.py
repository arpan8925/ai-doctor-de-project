"""LiteLLM router — every LLM call in the project goes through here.

Two logical channels (Gemini-backed by default; swappable via settings):

  - reason(...)   → text reasoning. Used by the PDN engine to generate the
                    next reply and by the narrowing module to re-score the
                    candidate distribution.
  - vision(...)   → multimodal channel for skin photos / X-rays / lab images.

Keeping this file thin and provider-agnostic is mandatory: the research
paper's ablation experiments depend on being able to retarget any channel
to any LiteLLM-supported model without touching feature code.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

import litellm

from apps.api.config import get_settings

log = logging.getLogger(__name__)


def response_cost_usd(response: Any) -> float:
    """Best-effort per-response USD cost from a LiteLLM response object.

    Returns 0.0 if the model is unknown to LiteLLM's pricing table or the
    response shape is unexpected — never raises (billing must never break
    a chat turn).
    """
    try:
        cost = litellm.completion_cost(completion_response=response)
        return float(cost) if cost else 0.0
    except Exception as e:  # noqa: BLE001
        log.debug("completion_cost failed: %s", e)
        return 0.0


def reason(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    stream: bool = False,
) -> Any:
    """Generate the next assistant reply (or any text-only reasoning step)."""
    settings = get_settings()
    chosen = model or settings.gemini_model
    return litellm.completion(
        model=chosen,
        messages=messages,
        api_key=settings.gemini_api_key or None,
        stream=stream,
    )


def vision(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
) -> Any:
    """Multimodal channel for image inputs (skin photos, X-rays, lab scans)."""
    settings = get_settings()
    chosen = model or settings.gemini_model  # Gemini Flash supports vision.
    return litellm.completion(
        model=chosen,
        messages=messages,
        api_key=settings.gemini_api_key or None,
    )


def stream_text(response: Iterable[Any]) -> Iterable[str]:
    """Yield content deltas from a LiteLLM streaming response."""
    for chunk in response:
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content
