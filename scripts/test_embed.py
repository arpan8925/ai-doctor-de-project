"""Probe LiteLLM embedding behavior on gemini-embedding-001.

Tests both single-input and batch-input calls so we know which path the
seed pipeline can rely on.
"""

import os
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

import litellm  # noqa: E402

MODEL = "gemini/gemini-embedding-001"


def main() -> None:
    key = os.environ["GEMINI_API_KEY"]

    # Single input
    print("--- single input ---")
    t0 = time.perf_counter()
    r = litellm.embedding(model=MODEL, input=["headache and nausea"], api_key=key)
    print(f"   ok in {time.perf_counter()-t0:.2f}s, dim={len(r['data'][0]['embedding'])}")

    # Batch input
    print("--- batch of 5 ---")
    t0 = time.perf_counter()
    inputs = [
        "Migraine — recurrent headaches",
        "Pneumonia — lung infection",
        "Type 2 diabetes mellitus",
        "Sinusitis — paranasal sinus inflammation",
        "Hypertension — high blood pressure",
    ]
    r = litellm.embedding(model=MODEL, input=inputs, api_key=key)
    print(f"   ok in {time.perf_counter()-t0:.2f}s, n={len(r['data'])}, dim={len(r['data'][0]['embedding'])}")


if __name__ == "__main__":
    main()
