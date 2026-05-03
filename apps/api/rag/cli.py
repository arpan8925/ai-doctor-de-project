"""CLI helpers for poking at the RAG store.

    uv run python -m apps.api.rag.cli search "headache and nausea"
    uv run python -m apps.api.rag.cli info
    uv run python -m apps.api.rag.cli get G43
"""

from __future__ import annotations

import argparse
import logging
import sys

from apps.api.rag.store import get_store


def _search(args: argparse.Namespace) -> int:
    store = get_store()
    if store.count() == 0:
        print("Collection is empty. Run: uv run python -m apps.api.rag.seed", file=sys.stderr)
        return 2
    hits = store.search(args.query, k=args.k)
    print(f"\nTop {len(hits)} for {args.query!r}:\n")
    print(f"  {'rank':<5} {'icd':<6} {'score':<7} name")
    print(f"  {'-'*5} {'-'*6} {'-'*7} {'-'*60}")
    for i, h in enumerate(hits, 1):
        print(f"  {i:<5} {h.icd10:<6} {h.score:.3f}   {h.name}")
    return 0


def _info(_: argparse.Namespace) -> int:
    store = get_store()
    print(f"records: {store.count()}")
    return 0


def _get(args: argparse.Namespace) -> int:
    store = get_store()
    rec = store.get(args.code)
    if not rec:
        print(f"Not found: {args.code}", file=sys.stderr)
        return 1
    print(f"{rec.icd10}  ({rec.chapter})")
    print(f"  name:     {rec.name}")
    if rec.aliases:
        print(f"  aliases:  {', '.join(rec.aliases)}")
    if rec.symptoms:
        print(f"  symptoms: {', '.join(rec.symptoms)}")
    if rec.summary:
        print(f"  summary:  {rec.summary[:240]}{'…' if len(rec.summary) > 240 else ''}")
    print(f"  sources:  {', '.join(rec.sources)}")
    return 0


def main() -> int:
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    p = argparse.ArgumentParser(prog="rag.cli")
    sub = p.add_subparsers(dest="cmd", required=True)

    ps = sub.add_parser("search", help="top-K nearest disease candidates for a free-text query")
    ps.add_argument("query")
    ps.add_argument("-k", type=int, default=10)
    ps.set_defaults(fn=_search)

    pi = sub.add_parser("info", help="record count")
    pi.set_defaults(fn=_info)

    pg = sub.add_parser("get", help="show a single record by ICD-10 code")
    pg.add_argument("code")
    pg.set_defaults(fn=_get)

    args = p.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
