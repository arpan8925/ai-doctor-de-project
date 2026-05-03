"""Domain types for the RAG layer.

Kept dataclass-light — Chroma stores documents and metadata directly, so we
just shuttle these objects in and out of `store.py` without an ORM.
"""

from __future__ import annotations

from dataclasses import dataclass, field


# ICD-10-CM chapter prefixes we keep for symptom-triage.
# We skip V/W/X/Y (external causes — "struck by lightning", etc.).
RELEVANT_CHAPTER_PREFIXES = tuple("ABCDEFGHIJKLMNOPQRST" "Z")


@dataclass
class DiseaseRecord:
    """One disease entry destined for the vector store.

    `icd10` is the canonical id (e.g. "G43" for migraine). Three-character
    parent codes only in v1; granular subcodes can be added later without
    breaking the schema.
    """

    icd10: str
    name: str
    chapter: str  # single letter, e.g. "G"
    summary: str = ""
    aliases: list[str] = field(default_factory=list)
    symptoms: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)  # e.g. ["icd10cm-2025", "medlineplus"]

    def searchable_text(self) -> str:
        """Concatenated representation used for embedding + full-text fallback."""
        parts = [self.name]
        if self.aliases:
            parts.append("Also known as: " + ", ".join(self.aliases))
        if self.summary:
            parts.append(self.summary)
        if self.symptoms:
            parts.append("Common symptoms: " + ", ".join(self.symptoms))
        return "\n".join(parts)

    def to_metadata(self) -> dict[str, str]:
        """Flatten for Chroma metadata (only str/int/float/bool allowed)."""
        return {
            "icd10": self.icd10,
            "name": self.name,
            "chapter": self.chapter,
            "summary": self.summary,
            "aliases": "|".join(self.aliases),
            "symptoms": "|".join(self.symptoms),
            "sources": "|".join(self.sources),
        }

    @classmethod
    def from_metadata(cls, m: dict) -> "DiseaseRecord":
        return cls(
            icd10=m.get("icd10", ""),
            name=m.get("name", ""),
            chapter=m.get("chapter", ""),
            summary=m.get("summary", ""),
            aliases=[s for s in (m.get("aliases", "") or "").split("|") if s],
            symptoms=[s for s in (m.get("symptoms", "") or "").split("|") if s],
            sources=[s for s in (m.get("sources", "") or "").split("|") if s],
        )


@dataclass
class SearchHit:
    record: DiseaseRecord
    score: float  # similarity in [0, 1] — higher is better

    @property
    def icd10(self) -> str:
        return self.record.icd10

    @property
    def name(self) -> str:
        return self.record.name
