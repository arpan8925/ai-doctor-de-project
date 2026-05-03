"""End-to-end smoke: PDN step seeds candidates from RAG and computes a real score."""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.api.pdn.engine import PdnState, step  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(name)s  %(message)s", datefmt="%H:%M:%S")


def run(query: str) -> None:
    s = PdnState(session_id=f"e2e-{abs(hash(query)) % 1000}")
    result = step(s, query)

    print()
    print(f"=== {query!r}")
    print(f"score    = {result['score']}")
    print(f"action   = {result['action']}")
    print(f"degraded = {result['degraded']}")
    print(f"H_0      = {s.initial_entropy:.3f}")
    print()
    print("Top 5 differential:")
    for item in result["differential"][:5]:
        pct = item["probability"] * 100
        print(f"  {item['icd10']:>5}  {pct:5.1f}%  {item['name']}")
    print()
    print("UI payload (first 200 chars):")
    print(result["ui"][:200].encode("ascii", "replace").decode("ascii"))


if __name__ == "__main__":
    run("I have headache and nausea for 2 days")
    run("fever and cough for 3 days")
