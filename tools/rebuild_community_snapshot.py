#!/usr/bin/env python3
"""Rebuild a community snapshot from public.plays.

Live volume is still tiny, so the default merge keeps community-stats.json
(the seed) unless a puzzle has at least 20 real Daily/Archive plays. Those
puzzles are replaced with counts from plays. Everyone else stays on the seed
so the results panel does not go blank.

First guesses come from plays.first_guess when that column exists, otherwise
payload.firstGuess. second_guess is counted and left for a later bias pass;
it does not change the bars.

  python3 tools/rebuild_community_snapshot.py --self-test
  python3 tools/rebuild_community_snapshot.py --plays plays.json --out /tmp/snap.json
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
    python3 tools/rebuild_community_snapshot.py --out /tmp/snap.json
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
    python3 tools/rebuild_community_snapshot.py --publish --file community-stats.json

--publish inserts one community_snapshots row (service role). The community-stats
edge function serves the newest row. Do not put the service role key in the client.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import community_snapshot as cs  # noqa: E402


def _request(url: str, key: str, method: str = "GET", body: bytes | None = None) -> bytes:
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def fetch_plays(url: str, key: str) -> list[dict]:
    base = url.rstrip("/")
    selects = [
        "puzzle_id,day_key,mode,puzzle_type,solved,perfect,country_code,payload,first_guess,second_guess",
        "puzzle_id,day_key,mode,puzzle_type,solved,perfect,country_code,payload",
    ]
    last_error: Exception | None = None
    for select in selects:
        rows: list[dict] = []
        offset = 0
        try:
            while True:
                endpoint = (
                    f"{base}/rest/v1/plays?select={select}"
                    "&mode=in.(daily,archive)&order=created_at.asc"
                    f"&limit=1000&offset={offset}"
                )
                batch = json.loads(_request(endpoint, key).decode("utf-8") or "[]")
                if not isinstance(batch, list):
                    raise SystemExit(f"unexpected plays response: {batch!r}"[:300])
                rows.extend(batch)
                if len(batch) < 1000:
                    return rows
                offset += 1000
        except urllib.error.HTTPError as exc:
            last_error = exc
            detail = exc.read().decode("utf-8", "replace")
            if exc.code == 400 and "first_guess" in detail:
                continue
            raise SystemExit(f"plays fetch failed ({exc.code}): {detail[:400]}") from exc
    raise SystemExit(f"plays fetch failed: {last_error}")


def publish(url: str, key: str, doc: dict) -> None:
    payload = {
        "version": int(doc.get("version") or 2),
        "source": str(doc.get("source") or "seed"),
        "doc": doc,
    }
    _request(
        url.rstrip("/") + "/rest/v1/community_snapshots",
        key,
        method="POST",
        body=json.dumps(payload).encode("utf-8"),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--plays", type=Path, help="JSON array of play rows (skips Supabase)")
    parser.add_argument("--file", type=Path, help="snapshot JSON to publish as-is")
    parser.add_argument("--out", type=Path, help="write the merged snapshot here")
    parser.add_argument("--seed", type=Path, default=ROOT / "community-stats.json")
    parser.add_argument("--publish", action="store_true", help="insert into community_snapshots")
    parser.add_argument("--from-plays-only", action="store_true", help="do not keep the seed")
    parser.add_argument("--min-players", type=int, default=cs.MIN_COUNTRY_PLAYERS)
    args = parser.parse_args()

    if args.self_test:
        cs._self_test()
        return 0

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if args.publish and args.file and not args.plays and not args.from_plays_only:
        doc = json.loads(args.file.read_text(encoding="utf-8"))
        if not url or not key:
            raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to publish")
        publish(url, key, doc)
        print(f"published {args.file} ({len((doc.get('puzzles') or {}))} puzzles)")
        return 0

    if args.plays:
        rows = json.loads(args.plays.read_text(encoding="utf-8"))
    else:
        if not url or not key:
            raise SystemExit(
                "No plays to aggregate. Pass --plays export.json, or set "
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The seeded "
                "community-stats.json already drives the UI."
            )
        rows = fetch_plays(url, key)
        print(f"fetched {len(rows)} daily/archive plays")

    live = cs.aggregate_plays(rows)
    print(f"aggregated {len(live['puzzles'])} puzzles, {live.get('secondGuessRows', 0)} rows with a second guess")
    if args.from_plays_only:
        doc = live
    else:
        seed = json.loads(args.seed.read_text(encoding="utf-8"))
        doc = cs.overlay_seed(seed, live, min_players=args.min_players)
        replaced = doc.get("livePuzzlesReplaced") or []
        print(
            f"source={doc.get('source')} replaced={len(replaced)} "
            f"(threshold {args.min_players} plays). "
            "Seeded puzzles stay in place while live volume is small."
        )
    if args.out:
        args.out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    if args.publish:
        if not url or not key:
            raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to publish")
        publish(url, key, doc)
        print("published snapshot")
    elif not args.out:
        print(json.dumps({"source": doc.get("source"), "puzzles": len(doc.get("puzzles") or {}), "livePuzzlesReplaced": doc.get("livePuzzlesReplaced")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
