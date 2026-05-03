"""List Gemini models that expose embedContent / batchEmbedContents."""

import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def main() -> None:
    key = os.environ["GEMINI_API_KEY"]
    r = httpx.get(
        f"https://generativelanguage.googleapis.com/v1beta/models?key={key}",
        timeout=20,
    )
    r.raise_for_status()
    data = r.json()
    print("embedding-capable models:")
    for m in data.get("models", []):
        methods = m.get("supportedGenerationMethods", [])
        if "embedContent" in methods or "batchEmbedContents" in methods:
            print(f"  {m['name']}  methods={methods}")


if __name__ == "__main__":
    main()
