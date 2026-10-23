#!/usr/bin/env python3
"""Add world + country first-guess blocks to community-stats.json.

Keeps the existing players / pctPerfect / perItemCorrect / top5 firstGuess
numbers and fills:

  firstGuessWorld
  firstGuessByCountry.US
  firstGuessByCountry.TW
  firstGuessByCountry.SG   (under the 20-play UI threshold, so the panel
                            can show an empty state instead of fake stats)

    python3 tools/seed_community_stats.py
    python3 tools/seed_community_stats.py --check
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import community_snapshot as cs  # noqa: E402

STATS = ROOT / "community-stats.json"
PUZZLES = ROOT / "puzzles-data.js"


def load_puzzles() -> dict:
    text = PUZZLES.read_text(encoding="utf-8")
    data = json.loads(text[text.index("[") :].strip().rstrip(";"))
    return {p["id"]: p for p in data if isinstance(p, dict) and p.get("id")}


def load_stats() -> dict:
    return json.loads(STATS.read_text(encoding="utf-8"))


def check(doc: dict) -> list[str]:
    errors = []
    puzzles = doc.get("puzzles") or {}
    if not puzzles:
        errors.append("no puzzles")
    for pid, row in puzzles.items():
        world = (row.get("firstGuessWorld") or {}).get("bars") or []
        countries = row.get("firstGuessByCountry") or {}
        if not world:
            errors.append(f"{pid}: missing firstGuessWorld.bars")
        for code in ("US", "TW"):
            bucket = countries.get(code) or {}
            if int(bucket.get("players") or 0) < cs.MIN_COUNTRY_PLAYERS:
                errors.append(f"{pid}: {code} below threshold")
            if not bucket.get("bars"):
                errors.append(f"{pid}: {code} missing bars")
        sg = (countries.get("SG") or {}).get("players")
        if sg is None or int(sg) >= cs.MIN_COUNTRY_PLAYERS:
            errors.append(f"{pid}: SG should be present and under {cs.MIN_COUNTRY_PLAYERS}")
        if row.get("type") == "top5" and not row.get("firstGuess"):
            errors.append(f"{pid}: top5 firstGuess removed")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate community-stats.json and do not write")
    args = parser.parse_args()
    doc = load_stats()
    if args.check:
        errors = check(doc)
        if errors:
            print("\n".join(errors[:30]))
            return 1
        print(f"ok {len(doc['puzzles'])} puzzles")
        return 0
    before = {pid: (row.get("players"), row.get("pctPerfect"), json.dumps(row.get("perItemCorrect"), sort_keys=True), json.dumps(row.get("firstGuess"), sort_keys=True)) for pid, row in doc["puzzles"].items()}
    cs.add_seed_first_guess(doc, load_puzzles())
    for pid, prev in before.items():
        row = doc["puzzles"][pid]
        now = (row.get("players"), row.get("pctPerfect"), json.dumps(row.get("perItemCorrect"), sort_keys=True), json.dumps(row.get("firstGuess"), sort_keys=True) if "firstGuess" in row else json.dumps(None))
        if now != prev:
            raise SystemExit(f"seed changed existing scores for {pid}")
    errors = check(doc)
    if errors:
        raise SystemExit("seed invalid:\n" + "\n".join(errors[:20]))
    STATS.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {STATS.name} ({len(doc['puzzles'])} puzzles, version {doc['version']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
