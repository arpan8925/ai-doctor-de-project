"""Quick smoke test for the Gemini API key via LiteLLM.

Usage (PowerShell):
    $env:GEMINI_API_KEY="<your key>"
    uv run python scripts/test_gemini.py

Tries a few model identifiers in order so we land on whatever Gemini SKU
LiteLLM currently routes to. Prints latency, model, and the raw text back.
"""

from __future__ import annotations

import os
import sys
import time

import litellm

PROMPT = "List three common symptoms of pneumonia in one sentence."

CANDIDATE_MODELS = [
    "gemini/gemini-2.5-flash",
    "gemini/gemini-2.0-flash",
    "gemini/gemini-1.5-flash",
]


def main() -> int:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("ERROR: GEMINI_API_KEY env var is not set.", file=sys.stderr)
        return 2

    print(f"Key length: {len(api_key)} chars (starts with {api_key[:6]}...)")
    print(f"Prompt:     {PROMPT!r}\n")

    last_error: Exception | None = None
    for model in CANDIDATE_MODELS:
        print(f"--- trying {model}")
        t0 = time.perf_counter()
        try:
            resp = litellm.completion(
                model=model,
                messages=[{"role": "user", "content": PROMPT}],
                api_key=api_key,
                timeout=30,
            )
        except Exception as e:
            elapsed = time.perf_counter() - t0
            last_error = e
            print(f"    FAILED in {elapsed:.2f}s: {type(e).__name__}: {e}")
            continue

        elapsed = time.perf_counter() - t0
        text = resp.choices[0].message.content
        usage = getattr(resp, "usage", None)
        print(f"    OK in {elapsed:.2f}s")
        print(f"    model_id: {getattr(resp, 'model', model)}")
        if usage:
            print(f"    usage:    {usage}")
        print(f"\n    response:\n    {text}\n")
        print("Gemini API key is working.")
        return 0

    print("\nAll candidate models failed.", file=sys.stderr)
    if last_error:
        print(f"Last error: {type(last_error).__name__}: {last_error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
