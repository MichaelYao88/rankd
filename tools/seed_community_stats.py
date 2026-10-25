#!/usr/bin/env python3
"""Add world + country first-guess blocks to community-stats.json.

Keeps the existing players / pctPerfect / perItemCorrect / top5 firstGuess
numbers and fills:

  firstGuessWorld                 (exactly 1 seeded play)
  firstGuessByCountry.US          (exactly 1 seeded play)
  firstGuessByCountry.TW          (exactly 1 seeded play)
  firstGuessByCountry.SG          (exactly 1 seeded play)

    python3 tools/seed_community_stats.py
    python3 tools/seed_community_stats.py --check
"""
from __future__ import annotations

import argparse
import json
import subprocess
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
        world_n = int((row.get("firstGuessWorld") or {}).get("players") or -1)
        if world_n != cs.SEED_CONSENSUS_PLAYS:
            errors.append(f"{pid}: world consensus seed is {world_n}, expected {cs.SEED_CONSENSUS_PLAYS}")
        for code in ("US", "TW", "SG"):
            bucket = countries.get(code) or {}
            if int(bucket.get("players") or 0) != cs.SEED_CONSENSUS_PLAYS:
                errors.append(f"{pid}: {code} consensus seed is {bucket.get('players')}, expected {cs.SEED_CONSENSUS_PLAYS}")
            if not bucket.get("bars"):
                errors.append(f"{pid}: {code} missing bars")
        if row.get("type") == "top5" and not row.get("firstGuess"):
            errors.append(f"{pid}: top5 firstGuess removed")
        board = row.get("countryBoard") or []
        if not isinstance(board, list) or len(board) < 6:
            errors.append(f"{pid}: countryBoard missing")
        else:
            shown = [r for r in board if int(r.get("players") or 0) >= cs.MIN_COUNTRY_PLAYERS and r.get("avgTries") is not None]
            thin = [r for r in board if int(r.get("players") or 0) < cs.MIN_COUNTRY_PLAYERS]
            if len(shown) < 5:
                errors.append(f"{pid}: fewer than 5 countries above the play threshold")
            if not thin:
                errors.append(f"{pid}: expected a country under the play threshold")
            if any("solveRate" in r for r in board):
                errors.append(f"{pid}: country board still carries a solve rate")
            fastest_thin = min(float(r["avgTries"]) for r in thin)
            fastest_shown = min(float(r["avgTries"]) for r in shown)
            if fastest_thin >= fastest_shown:
                errors.append(f"{pid}: a small country should be faster than the leader so the threshold matters")
            for r in shown:
                plays = int(r.get("players") or 0)
                if plays < cs.MIN_COUNTRY_PLAYERS or plays > cs.BOARD_SEED_PLAYS + 2:
                    errors.append(f"{pid}: {r.get('code')} has {plays} seeded plays, expected about {cs.BOARD_SEED_PLAYS}")
                avg_tries = float(r["avgTries"])
                lo, hi = (7, 15) if row.get("type") == "top5" else (2.1, 4.3)
                if not lo <= avg_tries <= hi:
                    errors.append(f"{pid}: implausible avg tries {avg_tries} for {r.get('code')}")
            for r in thin:
                plays = int(r.get("players") or 0)
                if plays < 1 or plays > 2:
                    errors.append(f"{pid}: thin country {r.get('code')} has {plays} plays, expected 1 or 2")
        if int(row.get("players") or 0) < 50:
            errors.append(f"{pid}: comparison crowd is too small for a stable better-than")
        standing = row.get("standing") or {}
        buckets = standing.get("byTries") or {}
        failed = standing.get("failed") or {}
        counted = sum(sum(hist) for hist in buckets.values() if isinstance(hist, list))
        counted += sum(sum(hist) for hist in failed.values() if isinstance(hist, list))
        if not failed:
            errors.append(f"{pid}: standing is missing unfinished games")
        if counted != int(row.get("players") or 0):
            errors.append(f"{pid}: standing histogram does not match players")
        avg_tries = float(standing.get("avgTries") or 0)
        acc = float(standing.get("avgAccuracy") or 0)
        if row.get("type") == "top5":
            if not 8.5 <= avg_tries <= 13:
                errors.append(f"{pid}: guess average {avg_tries} is outside the seeded band")
            if not 48 <= acc <= 78:
                errors.append(f"{pid}: accuracy {acc} is outside the seeded band")
        else:
            if not 2.8 <= avg_tries <= 3.6:
                errors.append(f"{pid}: try average {avg_tries} is outside the seeded band")
            if not 55 <= acc <= 72:
                errors.append(f"{pid}: accuracy {acc} is outside the seeded band")
    return errors


def add_standings(doc: dict) -> dict:
    script = ROOT / "community-seed.js"
    proc = subprocess.run(
        ["node", str(script), "--merge"],
        input=json.dumps(doc),
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(proc.stderr.strip() or "community-seed --merge failed")
    return json.loads(proc.stdout)


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
    doc = add_standings(doc)
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
