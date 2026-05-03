"""ICD-10-CM seeding pipeline.

Source: April 2026 ICD-10-CM official codes, bundled in the `simple_icd_10_cm`
PyPI package (US Govt public domain, version pinned in `uv.lock`). No HTTP at
seed time — fully reproducible from the lockfile.

Output volume: ~1,700 records covering all major primary-care conditions
(3-character ICD-10 categories minus chapters V/W/X/Y, which are external-cause
codes that are irrelevant for symptom triage).
"""

from __future__ import annotations

import logging

import simple_icd_10_cm as icd

from apps.api.rag.models import RELEVANT_CHAPTER_PREFIXES, DiseaseRecord

log = logging.getLogger(__name__)

SOURCE_TAG = "icd10cm-2026"


def _clean_name(raw: str) -> str:
    """Trim ICD-10's verbose 'unspecified / NEC' tails for nicer display."""
    n = raw
    for tail in (
        ", unspecified",
        ", unspecified organism",
        ", not elsewhere classified",
        ", not otherwise specified",
        ", NEC",
        ", NOS",
    ):
        if n.endswith(tail):
            n = n[: -len(tail)]
    return n.strip()


def load() -> list[DiseaseRecord]:
    """Iterate the bundled codes, keep 3-char categories in relevant chapters.

    Dedupes by code — `simple_icd_10_cm.get_all_codes()` can yield the same
    3-char category multiple times when it appears under several blocks.
    """
    records: dict[str, DiseaseRecord] = {}
    skipped_chapter = 0
    for code in icd.get_all_codes():
        if not icd.is_category(code):
            continue
        chapter = code[0]
        if chapter not in RELEVANT_CHAPTER_PREFIXES:
            skipped_chapter += 1
            continue
        if code in records:
            continue
        records[code] = DiseaseRecord(
            icd10=code,
            name=_clean_name(icd.get_description(code)),
            chapter=chapter,
            sources=[SOURCE_TAG],
        )
    log.info(
        "ICD-10 load: %d unique categories kept, %d skipped (V/W/X/Y external causes)",
        len(records),
        skipped_chapter,
    )
    return list(records.values())
