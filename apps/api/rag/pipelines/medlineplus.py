"""MedlinePlus enrichment pipeline.

For each ICD-10-CM code already in the store, ask MedlinePlus Connect API for
the matching patient-facing topic. Captures: clean title (often a layman name
like "Heart Attack" instead of "Acute myocardial infarction"), HTML-stripped
summary, and a canonical URL.

Strategy:
  - Concurrent fetches with a small pool to be polite to a free public service.
  - Disk cache so re-seeding is cheap (the first run takes ~2 min for 1643 codes).
  - Codes with no MedlinePlus topic are silently skipped — they retain their
    ICD-10-only data.
"""

from __future__ import annotations

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import httpx

from apps.api.rag.models import DiseaseRecord
from apps.api.rag.store import DATA_DIR

log = logging.getLogger(__name__)

CONNECT_URL = "https://connect.medlineplus.gov/service"
ICD10CM_CS = "2.16.840.1.113883.6.90"  # OID for ICD-10-CM, per Connect spec
SOURCE_TAG = "medlineplus-connect"
CACHE_FILE = DATA_DIR / "seed" / "medlineplus_cache.json"

HTML_TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")
SECTION_RE = re.compile(r"<h\d[^>]*>([^<]+)</h\d>", re.I)


def _strip_html(html: str, max_chars: int = 900) -> str:
    text = HTML_TAG_RE.sub(" ", html)
    text = WHITESPACE_RE.sub(" ", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0] + "…"
    return text


def _fetch_one(client: httpx.Client, code: str) -> dict | None:
    """Single Connect-API call. Returns enrichment dict or None."""
    try:
        r = client.get(
            CONNECT_URL,
            params={
                "mainSearchCriteria.v.cs": ICD10CM_CS,
                "mainSearchCriteria.v.c": code,
                "informationRecipient.languageCode.c": "en",
                "knowledgeResponseType": "application/json",
            },
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        entries = data.get("feed", {}).get("entry", [])
        if not entries:
            return None
        e = entries[0]
        summary_html = e.get("summary", {}).get("_value", "")
        return {
            "title": (e.get("title") or {}).get("_value", "").strip(),
            "summary": _strip_html(summary_html),
            "url": ((e.get("link") or [{}])[0] or {}).get("href", ""),
        }
    except Exception as ex:  # noqa: BLE001 — never let a network blip crash the seed
        log.warning("MedlinePlus fetch failed for %s: %s", code, ex)
        return None


# ─────────────────────────── Cache ─────────────────────────────

def _load_cache() -> dict[str, dict]:
    if not CACHE_FILE.exists():
        return {}
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        log.warning("Could not read MedlinePlus cache (%s); starting fresh.", e)
        return {}


def _save_cache(cache: dict[str, dict]) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, indent=2), encoding="utf-8")


# ─────────────────────────── Driver ────────────────────────────

def fetch_all(codes: list[str], *, max_workers: int = 6, use_cache: bool = True) -> dict[str, dict]:
    """Concurrent fetch for a list of ICD-10 codes. Cache-aware."""
    cache = _load_cache() if use_cache else {}
    needed = [c for c in codes if c not in cache]
    log.info(
        "MedlinePlus: %d in cache, %d to fetch, %d total",
        len(cache),
        len(needed),
        len(codes),
    )

    if needed:
        with httpx.Client(headers={"User-Agent": "ai-doctor/0.1 (research)"}) as client:
            with ThreadPoolExecutor(max_workers=max_workers) as exe:
                futures = {exe.submit(_fetch_one, client, c): c for c in needed}
                for i, fut in enumerate(as_completed(futures), 1):
                    code = futures[fut]
                    result = fut.result()
                    cache[code] = result if result is not None else {"_miss": True}
                    if i % 100 == 0 or i == len(needed):
                        hits = sum(1 for v in cache.values() if not v.get("_miss"))
                        log.info(
                            "MedlinePlus: fetched %d/%d (cumulative hits=%d)",
                            i,
                            len(needed),
                            hits,
                        )
        _save_cache(cache)

    # Strip miss markers before returning.
    return {k: v for k, v in cache.items() if not v.get("_miss")}


def apply(records: list[DiseaseRecord]) -> int:
    """Mutate records in place with MedlinePlus enrichment. Returns matched count."""
    codes = [r.icd10 for r in records]
    matches = fetch_all(codes)
    by_code = {r.icd10: r for r in records}
    enriched_count = 0
    for code, enrich in matches.items():
        rec = by_code.get(code)
        if not rec:
            continue
        title = enrich.get("title", "").strip()
        summary = enrich.get("summary", "").strip()
        if title and title.lower() != rec.name.lower():
            # MedlinePlus often uses the layman name ("Heart Attack" vs ICD's
            # "Acute myocardial infarction"). Keep both — layman as alias.
            if title not in rec.aliases:
                rec.aliases.append(title)
        if summary:
            rec.summary = summary
        if SOURCE_TAG not in rec.sources:
            rec.sources.append(SOURCE_TAG)
        enriched_count += 1
    log.info(
        "MedlinePlus apply: %d/%d records enriched",
        enriched_count,
        len(records),
    )
    return enriched_count
