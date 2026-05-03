"""Public RAG surface — import only these from outside the package."""

from apps.api.rag.models import DiseaseRecord, SearchHit
from apps.api.rag.store import DiseaseStore, get_store

__all__ = ["DiseaseRecord", "SearchHit", "DiseaseStore", "get_store"]


def search(query: str, *, k: int = 20) -> list[SearchHit]:
    """Convenience: top-K disease candidates for a free-text patient query."""
    return get_store().search(query, k=k)
