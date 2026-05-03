"""Probe MedlinePlus Connect API to validate per-ICD-10 enrichment is feasible."""

import json
import sys
from pathlib import Path

import httpx

# Code-system OID for ICD-10-CM, per the MedlinePlus Connect spec.
ICD10CM_CS = "2.16.840.1.113883.6.90"

URL = "https://connect.medlineplus.gov/service"


def fetch(code: str) -> dict:
    r = httpx.get(
        URL,
        params={
            "mainSearchCriteria.v.cs": ICD10CM_CS,
            "mainSearchCriteria.v.c": code,
            "informationRecipient.languageCode.c": "en",
            "knowledgeResponseType": "application/json",
        },
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


if __name__ == "__main__":
    for code in ["G43", "J18", "I21", "E11", "L20", "Z99"]:
        print(f"\n=== {code}")
        data = fetch(code)
        feed = data.get("feed", {})
        entries = feed.get("entry", [])
        print(f"  entries: {len(entries)}")
        if entries:
            e = entries[0]
            print(f"  title:   {e.get('title', {}).get('_value', '')[:80]}")
            summary = e.get("summary", {}).get("_value", "")
            print(f"  summary: {summary[:200].replace(chr(10), ' ')}")
            links = e.get("link", [])
            print(f"  links:   {len(links)}")
        else:
            # If no entries, might be in info.title saying 'no results'
            title = feed.get("title", {}).get("_value", "")
            print(f"  feed.title: {title}")
    # Pretty-dump one full response so we know the schema
    print("\n=== Raw schema dump for G43:")
    print(json.dumps(fetch("G43"), indent=2)[:2000])
