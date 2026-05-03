"""Entropy and information-gain math for the PDN engine.

The clarification score is derived from how much the candidate distribution
has sharpened relative to its initial state. Kept in a separate module so the
research paper can cite a single canonical implementation.
"""

from __future__ import annotations

import math
from collections.abc import Mapping


def shannon_entropy(distribution: Mapping[str, float]) -> float:
    """H(p) in nats. Inputs that don't sum to 1 are normalized first."""
    total = sum(distribution.values())
    if total <= 0:
        return 0.0
    h = 0.0
    for p in distribution.values():
        if p <= 0:
            continue
        q = p / total
        h -= q * math.log(q)
    return h


def clarification_score(
    initial_entropy: float,
    current_entropy: float,
    *,
    red_flag_active: bool = False,
) -> int:
    """Map entropy reduction to a 0–100 score.

    A red flag caps the score at 50 regardless of how sharp the posterior is —
    the system must escalate to ER, not commit to a diagnosis.
    """
    if initial_entropy <= 0:
        score = 100
    else:
        ratio = max(0.0, 1.0 - (current_entropy / initial_entropy))
        score = int(round(ratio * 100))
    if red_flag_active:
        score = min(score, 50)
    return max(0, min(100, score))


def next_action(score: int) -> str:
    """Decide whether to keep asking, request labs, or commit."""
    if score < 70:
        return "ask"
    if score < 95:
        return "request_labs"
    return "commit"
