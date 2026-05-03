"""Embedding wrapper — every embedding call goes through LiteLLM (per project mandate).

Gemini text-embedding-004 returns 768-dim vectors and supports task-specific
prompts: RETRIEVAL_DOCUMENT for indexed corpus, RETRIEVAL_QUERY for user queries.
Using the right task type yields measurably better recall.
"""

from __future__ import annotations

import logging
import time
from typing import Iterable, Sequence

import litellm

from apps.api.config import get_settings

log = logging.getLogger(__name__)

EMBED_MODEL = "gemini/gemini-embedding-001"
EMBED_DIM = 3072

# Conservative batch size — Gemini accepts up to 100 inputs per call.
BATCH_SIZE = 80


def _settings_key() -> str:
    key = get_settings().gemini_api_key
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set. Add it to .env (see .env.example).")
    return key


def embed_documents(texts: Sequence[str]) -> list[list[float]]:
    """Embed a batch of documents (corpus side).

    Splits into BATCH_SIZE chunks and prints progress so seeding is debuggable.
    """
    return _embed_batched(texts, task_type="RETRIEVAL_DOCUMENT")


def embed_query(text: str) -> list[float]:
    """Embed a single query (search side)."""
    out = _embed_batched([text], task_type="RETRIEVAL_QUERY")
    return out[0]


def _embed_batched(
    texts: Sequence[str],
    *,
    task_type: str,
) -> list[list[float]]:
    api_key = _settings_key()
    out: list[list[float]] = []
    batches = list(_chunks(list(texts), BATCH_SIZE))
    for i, batch in enumerate(batches, 1):
        t0 = time.perf_counter()
        # LiteLLM forwards `task_type` to Gemini for embed-task tuning.
        resp = litellm.embedding(
            model=EMBED_MODEL,
            input=list(batch),
            api_key=api_key,
            input_type=task_type,
        )
        for d in resp["data"]:
            out.append(d["embedding"])
        elapsed = time.perf_counter() - t0
        if len(batches) > 1:
            log.info("embed batch %d/%d (%d items) in %.2fs", i, len(batches), len(batch), elapsed)
    return out


def _chunks(seq: list, n: int) -> Iterable[list]:
    for i in range(0, len(seq), n):
        yield seq[i : i + n]
