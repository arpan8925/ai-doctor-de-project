"""LLM-driven narrowing — after each user turn, ask the reasoning model to
re-score the current candidate diseases against the latest evidence.

Posterior update is Bayesian-flavored:

    posterior(d)  ∝  prior(d) × likelihood(d | latest_evidence)

The LLM provides the likelihood as a 0–10 fitness score per candidate;
we map that to a likelihood in [0.05, 1.0] (the 0.05 floor stops a single
mention from annihilating an otherwise-plausible candidate). The new
distribution is renormalized, entropy drops, and the clarification score
moves from "I'm asking" toward "I'm fairly sure".

This is the engine that makes the gauge actually rise honestly across turns.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from apps.api.llm import router
from apps.api.pdn.entropy import shannon_entropy

log = logging.getLogger(__name__)

# How many of the most recent transcript messages we feed to the LLM.
TRANSCRIPT_WINDOW = 10
# How many top candidates we ask the LLM to score (avoids context bloat).
CANDIDATES_TO_SCORE = 8
# Floor on the likelihood — even a poor-fit candidate keeps a small probability
# unless it's *contradicted*, not merely *unsupported*.
LIKELIHOOD_FLOOR = 0.05

PROMPT = """You are the clinical-reasoning engine inside an AI symptom checker.

A patient and an AI doctor are exchanging messages. Below are the most-recent
turns of their conversation, followed by the current differential diagnosis
with each candidate's running probability.

CONVERSATION (most recent last):
{transcript}

CURRENT DIFFERENTIAL:
{candidates}

For EACH candidate listed above, decide how well the conversation so far
supports it as the diagnosis, on an integer scale 0–10:
  10 = strongly supported by the evidence
  7  = consistent with the evidence
  5  = neutral — no new information either way
  3  = mostly inconsistent
  0  = effectively ruled out by something the patient said

Respond with a JSON object ONLY — no prose, no markdown fences. Keys must be
the ICD-10 codes shown in brackets above. Example:
{{"G43": 9, "R51": 7, "G44": 4}}
"""


def _format_candidates(state) -> str:  # noqa: ANN001 — duck-typed PdnState
    pairs = sorted(state.candidates.items(), key=lambda kv: -kv[1])[:CANDIDATES_TO_SCORE]
    return "\n".join(
        f"- [{icd}] {state.candidate_names.get(icd, icd)}: {prob * 100:.0f}%"
        for icd, prob in pairs
    )


def _format_transcript(state) -> str:  # noqa: ANN001
    msgs = state.transcript[-TRANSCRIPT_WINDOW:]
    return "\n".join(
        f"{m['role'].upper()}: {(m.get('content') or '')[:300]}" for m in msgs
    )


def _parse_scores(text: str) -> dict[str, float] | None:
    """Tolerant JSON-object extraction. Returns icd → score, or None on failure."""
    # Strip optional ```json ... ``` fences first.
    cleaned = re.sub(r"```(?:json)?\s*", "", text).replace("```", "")
    match = re.search(r"\{.*?\}", cleaned, re.DOTALL)
    if not match:
        return None
    try:
        raw = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    out: dict[str, float] = {}
    for k, v in raw.items():
        try:
            out[str(k).strip()] = float(v)
        except (ValueError, TypeError):
            continue
    return out or None


def narrow(state) -> dict[str, Any] | None:  # noqa: ANN001
    """Update state.candidates in place based on the latest evidence.

    Returns a debug dict (`{"H_before", "H_after", "top_before", "top_after"}`)
    on success, or None if the LLM call failed and no update was applied.
    """
    if len(state.candidates) < 2:
        return None

    prompt = PROMPT.format(
        transcript=_format_transcript(state),
        candidates=_format_candidates(state),
    )

    try:
        resp = router.reason([{"role": "user", "content": prompt}])
        text = resp.choices[0].message.content
    except Exception as e:  # noqa: BLE001
        log.warning("Narrowing LLM call failed: %s", e)
        return None

    scores = _parse_scores(text or "")
    if not scores:
        log.warning("Narrowing: could not parse scores from response: %s", (text or "")[:240])
        return None

    h_before = shannon_entropy(state.candidates)
    top_before = max(state.candidates.items(), key=lambda kv: kv[1])

    new = {}
    for icd, prior in state.candidates.items():
        raw = scores.get(icd, 5.0)  # default neutral if LLM omitted
        likelihood = max(LIKELIHOOD_FLOOR, min(1.0, raw / 10.0))
        new[icd] = prior * likelihood

    total = sum(new.values())
    if total <= 0:
        log.warning("Narrowing produced zero total — keeping previous distribution")
        return None
    state.candidates = {k: v / total for k, v in new.items()}

    h_after = shannon_entropy(state.candidates)
    top_after = max(state.candidates.items(), key=lambda kv: kv[1])
    log.info(
        "Narrowed: H %.3f → %.3f, top %s (%.0f%%) → %s (%.0f%%)",
        h_before,
        h_after,
        top_before[0],
        top_before[1] * 100,
        top_after[0],
        top_after[1] * 100,
    )
    return {
        "h_before": h_before,
        "h_after": h_after,
        "top_before": top_before,
        "top_after": top_after,
    }
