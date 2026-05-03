"""Multi-turn end-to-end test — verifies the gauge climbs honestly across turns.

Simulates a 4-message conversation. The LLM-driven narrowing should sharpen
the distribution each turn, so the clarification score should climb roughly
0 → 30s → 50s → 70s as evidence accumulates.
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.api.pdn.engine import PdnState, step  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)


def run_conversation(label: str, messages: list[str]) -> None:
    print(f"\n========== {label} ==========")
    state = PdnState(session_id=f"mt-{abs(hash(label)) % 10000}")
    for i, msg in enumerate(messages, 1):
        result = step(state, msg)
        print(f"\n--- turn {i} ---")
        print(f"  user:    {msg}")
        print(f"  score:   {result['score']}    action: {result['action']}")
        if result.get("red_flag"):
            print(f"  RED FLAG: {result['red_flag']['label']}")
        print(f"  top-3 differential:")
        for item in result["differential"][:3]:
            pct = item["probability"] * 100
            print(f"    {item['icd10']:>5}  {pct:5.1f}%  {item['name']}")


if __name__ == "__main__":
    # 1. Migraine progression
    run_conversation(
        "MIGRAINE PROGRESSION",
        [
            "I have headache and nausea for 2 days",
            "It's only on the right side of my head, throbbing, very sensitive to light",
            "Yes I've had similar headaches before, my mother also gets them",
            "No fever, no neck stiffness, vision is normal except some flashing",
        ],
    )

    # 2. Red flag — ACS classic
    run_conversation(
        "RED FLAG — POSSIBLE HEART ATTACK",
        [
            "I'm 58, having chest pain that goes down my left arm and I'm sweating a lot",
        ],
    )
