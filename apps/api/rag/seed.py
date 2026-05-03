"""End-to-end seeder — drives every pipeline and writes to the vector store.

Usage:
    uv run python -m apps.api.rag.seed              # full seed
    uv run python -m apps.api.rag.seed --reset      # wipe collection first
    uv run python -m apps.api.rag.seed --skip-icd10 # iterate only enrichment

Idempotent: re-running upserts in place. Cheap to re-run if you tweak
the embedding pipeline.
"""

from __future__ import annotations

import argparse
import logging
import time

from apps.api.rag.pipelines import icd10, medlineplus
from apps.api.rag.store import get_store

log = logging.getLogger("rag.seed")


def seed(
    *,
    reset: bool = False,
    skip_icd10: bool = False,
    skip_medlineplus: bool = False,
) -> None:
    store = get_store()
    if reset:
        log.warning("Resetting collection (was %d records)", store.count())
        store.clear()

    log.info("─── ICD-10 ───")
    records = icd10.load()

    if not skip_medlineplus:
        log.info("─── MedlinePlus enrichment ───")
        t0 = time.perf_counter()
        medlineplus.apply(records)
        log.info("MedlinePlus done in %.1fs", time.perf_counter() - t0)

    if not skip_icd10:
        log.info("─── Embedding + indexing ───")
        t0 = time.perf_counter()
        log.info("Embedding + writing %d records to Chroma…", len(records))
        n = store.upsert_records(records)
        log.info("Index done: %d records in %.1fs", n, time.perf_counter() - t0)

    log.info("Final collection size: %d", store.count())


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(name)s  %(message)s",
        datefmt="%H:%M:%S",
    )
    p = argparse.ArgumentParser(description="Seed the AI Doctor RAG store.")
    p.add_argument("--reset", action="store_true", help="wipe collection first")
    p.add_argument("--skip-icd10", action="store_true", help="skip ICD-10 indexing")
    p.add_argument("--skip-medlineplus", action="store_true", help="skip MedlinePlus enrichment")
    args = p.parse_args()
    seed(reset=args.reset, skip_icd10=args.skip_icd10, skip_medlineplus=args.skip_medlineplus)


if __name__ == "__main__":
    main()
