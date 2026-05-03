"""Chroma-backed disease store.

Single-collection design: every disease record lives in `diseases` indexed
by ICD-10 code. Chroma persists to `data/chroma/` so seeding is a one-time
cost across dev sessions.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable

import chromadb

from apps.api.rag.embed import EMBED_DIM, embed_documents, embed_query
from apps.api.rag.models import DiseaseRecord, SearchHit

log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
CHROMA_DIR = DATA_DIR / "chroma"
COLLECTION_NAME = "diseases"


class DiseaseStore:
    """Thin wrapper over a Chroma collection.

    Constructor is cheap; the heavy lift happens in `upsert_records` (which
    embeds via Gemini) and `search` (which embeds the query and runs ANN).
    """

    def __init__(self, persist_dir: Path = CHROMA_DIR):
        persist_dir.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(persist_dir))
        # cosine is what Gemini embeddings are tuned for.
        self._col = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine", "embed_dim": EMBED_DIM},
        )

    # ───────────────────────── Inserts / updates ──────────────────────

    def upsert_records(self, records: Iterable[DiseaseRecord]) -> int:
        """Embed and write a batch of records. Returns count inserted/updated."""
        records = list(records)
        if not records:
            return 0
        ids = [r.icd10 for r in records]
        docs = [r.searchable_text() for r in records]
        metas = [r.to_metadata() for r in records]
        embeddings = embed_documents(docs)
        self._col.upsert(ids=ids, documents=docs, metadatas=metas, embeddings=embeddings)
        return len(records)

    def upsert_metadata(self, icd10: str, patch: dict[str, str]) -> bool:
        """Patch a single record's metadata in place (used by MedlinePlus enrich).

        Returns True if the record existed, False otherwise.
        """
        existing = self._col.get(ids=[icd10])
        if not existing["ids"]:
            return False
        meta = existing["metadatas"][0] if existing["metadatas"] else {}
        meta = {**meta, **patch}
        # We rebuild the searchable text + re-embed if the textual content changed.
        rec = DiseaseRecord.from_metadata(meta)
        new_doc = rec.searchable_text()
        new_emb = embed_documents([new_doc])[0]
        self._col.upsert(
            ids=[icd10],
            documents=[new_doc],
            metadatas=[rec.to_metadata()],
            embeddings=[new_emb],
        )
        return True

    # ───────────────────────── Queries ────────────────────────────────

    def search(self, query: str, *, k: int = 20) -> list[SearchHit]:
        """Top-K nearest neighbors for a free-text patient query."""
        if self.count() == 0:
            return []
        emb = embed_query(query)
        res = self._col.query(query_embeddings=[emb], n_results=k)
        hits: list[SearchHit] = []
        ids = res.get("ids", [[]])[0]
        metas = res.get("metadatas", [[]])[0]
        dists = res.get("distances", [[None] * len(ids)])[0]
        for icd, meta, dist in zip(ids, metas, dists):
            rec = DiseaseRecord.from_metadata(meta or {"icd10": icd})
            # cosine distance ∈ [0, 2]; convert to similarity ∈ [0, 1].
            sim = 1.0 - (dist / 2.0) if dist is not None else 0.0
            hits.append(SearchHit(record=rec, score=max(0.0, min(1.0, sim))))
        return hits

    def get(self, icd10: str) -> DiseaseRecord | None:
        res = self._col.get(ids=[icd10])
        if not res["ids"]:
            return None
        return DiseaseRecord.from_metadata(res["metadatas"][0])

    def count(self) -> int:
        return self._col.count()

    def clear(self) -> None:
        """Drop the collection entirely. Used by `cli reset`."""
        self._client.delete_collection(COLLECTION_NAME)
        self._col = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine", "embed_dim": EMBED_DIM},
        )


# Module-level singleton — cheap, but reused across requests.
_store: DiseaseStore | None = None


def get_store() -> DiseaseStore:
    global _store
    if _store is None:
        _store = DiseaseStore()
    return _store
