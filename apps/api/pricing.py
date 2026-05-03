"""USD ↔ INR conversion for LLM-cost billing.

LiteLLM returns cost in USD floats. Wallets store integer paise to avoid
float drift. All conversions go through here so the rate is overridable
via the INR_PER_USD env var (defaults to 83 — set 2026-05).
"""

from __future__ import annotations

import math


def usd_to_paise(usd: float, inr_per_usd: float) -> int:
    """Convert a USD float to integer paise.

    Always rounds *up* — we never under-charge for fractional usage,
    and the rounding error is bounded at <1 paise per session.
    """
    if usd <= 0:
        return 0
    return math.ceil(usd * inr_per_usd * 100)


def format_paise(paise: int) -> str:
    """`12345` → `₹123.45`. Negative is rendered with a leading minus."""
    sign = "-" if paise < 0 else ""
    rupees = abs(paise) // 100
    pa = abs(paise) % 100
    return f"{sign}₹{rupees}.{pa:02d}"
