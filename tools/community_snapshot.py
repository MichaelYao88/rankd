#!/usr/bin/env python3
"""Community snapshot shape for Ranki first guesses.

World and per-country blocks share one bar list the results panel can draw:

  rank:  {slot, name, emoji?, pct}     one bar per slot (greedy unique modal)
  tier:  {name, tier, emoji?, pct}     modal tier on try 1
  match: {name, matchedTo, label, emoji?, pct}
  top5:  {name, emoji?, pct}           first country named

firstGuessByCountry values are {players, bars}. The seed is one play per
country, and the results panel shows that ordering from the first play.

second_guess is logged on plays but not aggregated here. Bias-vs-region
scores are out of scope; this module only counts what was submitted.

countryBoard is every country that submitted, with average tries (or
guesses, for top 5) and a solve rate kept for older readers. The client
drops countries under MIN_COUNTRY_PLAYERS and ranks the rest by fewest tries.
Seeded countries carry about BOARD_SEED_PLAYS plays, and those count, so
they clear the cutoff. A country with 1 or 2 real plays and no seed does not.

standing is the results-card comparison: average tries, items correct on the
first guess, and accuracy (0–100). byTries is finished games and failed is
unfinished games, each a 10-bin accuracy histogram per try count. Fewer tries
wins, accuracy breaks ties, and unfinished games rank below every finish.
It is only attached once MIN_STANDING_PLAYERS plays carried both a try count
and an accuracy, so a thin sample does not replace the crowd behind
"better than". A 1-play seed would pin that percentile at 0 or 99.
"""
from __future__ import annotations

import hashlib
import json
import random
from collections import Counter, defaultdict
from typing import Any

# Leaderboard cutoff. Keep in sync with MIN_COUNTRY in community-seed.js.
# 9 seeded plays qualify; 1–2 real plays with no seed do not.
MIN_COUNTRY_PLAYERS = 9
BOARD_SEED_PLAYS = 9
SEED_CONSENSUS_PLAYS = 1
# Full replace, and a live standing, wait until the percentile is stable.
MIN_STANDING_PLAYERS = 20
FAMILY_FIRST = {"CHN", "TWN", "HKG", "KOR", "PRK", "VNM", "KHM", "MNG"}


def pct(part: int, whole: int) -> int:
    if whole <= 0:
        return 0
    return int((100 * part) / whole + 0.5)


def rng_for(key: str) -> random.Random:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return random.Random(int(digest[:16], 16))


def short_person(name: str, puzzle: dict | None = None) -> str:
    text = (name or "").strip()
    if not text:
        return text
    if puzzle:
        for person in puzzle.get("people") or []:
            if person.get("name") != text:
                continue
            words = text.split()
            if len(words) < 2:
                return text
            if person.get("iso3") in FAMILY_FIRST:
                return words[0]
            return words[-1]
    if len(text) <= 22:
        return text
    words = text.replace(" / ", " ").split()
    if words and words[-1].lower() in {"men", "women", "adults"} and len(words) >= 2:
        return " ".join(words[-2:])
    return words[-1] if words else text


def emoji_map(puzzle: dict | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if not puzzle:
        return out
    for it in list(puzzle.get("items") or []) + list(puzzle.get("people") or []):
        if it.get("name") and it.get("emoji"):
            out[it["name"]] = it["emoji"]
    return out


def consensus_counts() -> dict[str, int]:
    """One seeded play per country, so the first real submit replaces it."""
    return {"US": SEED_CONSENSUS_PLAYS, "TW": SEED_CONSENSUS_PLAYS, "SG": SEED_CONSENSUS_PLAYS}


def rank_bars(names: list[str], shift: int, rng: random.Random, emojis: dict[str, str]) -> list[dict]:
    n = len(names)
    if not n:
        return []
    matrix = []
    for slot in range(n):
        target = (slot + shift) % n
        weights = []
        for i in range(n):
            dist = min((i - target) % n, (target - i) % n)
            peak = 64 if dist == 0 else max(8, 28 - dist * 7)
            weights.append(peak + rng.randint(0, 5))
        matrix.append(weights)
    used: set[int] = set()
    bars = []
    for slot in range(n):
        ranking = sorted(range(n), key=lambda i: (-matrix[slot][i], i))
        pick = next(i for i in ranking if i not in used)
        used.add(pick)
        share = pct(matrix[slot][pick], sum(matrix[slot]))
        share = max(16, min(71, share))
        bar: dict[str, Any] = {"slot": slot + 1, "name": names[pick], "pct": share}
        if emojis.get(names[pick]):
            bar["emoji"] = emojis[names[pick]]
        bars.append(bar)
    return bars


def tier_labels(puzzle: dict | None) -> list[str]:
    labels = []
    for tier in (puzzle or {}).get("tiers") or []:
        label = tier.get("label")
        if label:
            labels.append(str(label))
    return labels or ["High", "Mid", "Low"]


def tier_bars(names: list[str], puzzle: dict | None, shift: int, rng: random.Random, correct_pct: dict) -> list[dict]:
    labels = tier_labels(puzzle)
    correct: dict[str, int] = {}
    if puzzle:
        for it in puzzle.get("items") or []:
            idx = it.get("tierIndex")
            if it.get("name") and isinstance(idx, int):
                correct[it["name"]] = idx
    emojis = emoji_map(puzzle)
    bars = []
    for i, name in enumerate(names):
        base = correct.get(name, i % len(labels))
        idx = (base + shift) % len(labels)
        cap = int(correct_pct.get(name) or 60)
        if shift == 0:
            share = max(28, min(cap, cap - 8 + rng.randint(0, 6)))
        else:
            share = 24 + rng.randint(0, 22)
        bar: dict[str, Any] = {"name": name, "tier": labels[idx], "pct": int(share)}
        if emojis.get(name):
            bar["emoji"] = emojis[name]
        bars.append(bar)
    return bars


def match_bars(names: list[str], swap: int, rng: random.Random, puzzle: dict | None) -> list[dict]:
    emojis = emoji_map(puzzle)
    n = len(names)
    bars = []
    for i, name in enumerate(names):
        matched = names[(i + 1) % n] if n > 1 and i == swap else name
        share = (22 + rng.randint(0, 14)) if matched != name else (48 + rng.randint(0, 18))
        bar: dict[str, Any] = {
            "name": name,
            "matchedTo": matched,
            "label": f"{short_person(name, puzzle)} → {short_person(matched, puzzle)}",
            "pct": share,
        }
        emo = emojis.get(matched) or emojis.get(name)
        if emo:
            bar["emoji"] = emo
        bars.append(bar)
    return bars


def rotate_top5(guesses: list[dict], salt: int) -> list[dict]:
    if not guesses:
        return []
    names = [g["name"] for g in guesses]
    emojis = {g["name"]: g.get("emoji") or "" for g in guesses}
    shares = sorted((int(g.get("pct") or 0) for g in guesses), reverse=True)
    salt %= len(names)
    ordered = names[salt:] + names[:salt]
    bars = []
    for name, share in zip(ordered, shares):
        bar: dict[str, Any] = {"name": name, "pct": share}
        if emojis.get(name):
            bar["emoji"] = emojis[name]
        bars.append(bar)
    return bars


def puzzle_row_count(puzzle: dict | None, kind: str) -> int | None:
    """Rows the player locks. Top 5 is five slots, not the country list. Name it and Top 1 are one country."""
    if kind == "top5":
        return 5
    if kind == "top1" or kind == "name":
        return 1
    if not isinstance(puzzle, dict):
        return None
    rows = puzzle.get("people") if kind == "match" else puzzle.get("items")
    if not isinstance(rows, list) or not rows:
        return None
    return len(rows)


def add_seed_first_guess(doc: dict, puzzles_by_id: dict[str, dict] | None = None) -> dict:
    """Add firstGuessWorld / firstGuessByCountry without changing existing scores."""
    puzzles_by_id = puzzles_by_id or {}
    for pid, row in (doc.get("puzzles") or {}).items():
        puzzle = puzzles_by_id.get(pid)
        kind = row.get("type") or "rank"
        width = puzzle_row_count(puzzle, kind)
        if width:
            row["rowCount"] = width
        counts = consensus_counts()
        if kind == "top5":
            world = [dict(g) for g in (row.get("firstGuess") or [])]
            buckets = {
                "US": rotate_top5(world, 1),
                "TW": rotate_top5(world, 2 if len(world) > 2 else 0),
                "SG": rotate_top5(world, 1),
            }
            row["firstGuessWorld"] = {"players": SEED_CONSENSUS_PLAYS, "bars": world}
        elif kind == "tier":
            names = list((row.get("perItemCorrect") or {}).keys())
            correct = row.get("perItemCorrect") or {}
            buckets = {
                "US": tier_bars(names, puzzle, 1, rng_for(pid + ":US"), correct),
                "TW": tier_bars(names, puzzle, 2, rng_for(pid + ":TW"), correct),
                "SG": tier_bars(names, puzzle, 1, rng_for(pid + ":SG"), correct),
            }
            row["firstGuessWorld"] = {
                "players": SEED_CONSENSUS_PLAYS,
                "bars": tier_bars(names, puzzle, 0, rng_for(pid + ":world"), correct),
            }
        elif kind == "match":
            names = list((row.get("perItemCorrect") or {}).keys())
            n = len(names)
            buckets = {
                "US": match_bars(names, 1 if n > 2 else 0, rng_for(pid + ":US"), puzzle),
                "TW": match_bars(names, n - 1 if n else 0, rng_for(pid + ":TW"), puzzle),
                "SG": match_bars(names, 0, rng_for(pid + ":SG"), puzzle),
            }
            row["firstGuessWorld"] = {
                "players": SEED_CONSENSUS_PLAYS,
                "bars": match_bars(names, 0, rng_for(pid + ":world"), puzzle),
            }
        elif kind == "name":
            bars = [dict(bar) for bar in ((row.get("firstGuessWorld") or {}).get("bars") or [])]
            if not bars:
                pick = str((puzzle or {}).get("seedPick") or "")
                if pick:
                    bar = {"name": pick, "pct": 100}
                    for country in (puzzle or {}).get("countries") or []:
                        if country.get("name") == pick and country.get("emoji"):
                            bar["emoji"] = country["emoji"]
                    bars = [bar]
            buckets = {code: [dict(bar) for bar in bars] for code in ("US", "TW", "SG")}
            row["firstGuessWorld"] = {"players": SEED_CONSENSUS_PLAYS, "bars": bars}
        else:
            names = list((row.get("perItemCorrect") or {}).keys())
            emojis = emoji_map(puzzle)
            shift_tw = 2 if len(names) > 2 else 0
            buckets = {
                "US": rank_bars(names, 0, rng_for(pid + ":US"), emojis),
                "TW": rank_bars(names, shift_tw, rng_for(pid + ":TW"), emojis),
                "SG": rank_bars(names, 1, rng_for(pid + ":SG"), emojis),
            }
            row["firstGuessWorld"] = {
                "players": SEED_CONSENSUS_PLAYS,
                "bars": rank_bars(names, 1, rng_for(pid + ":world"), emojis),
            }
        row["firstGuessByCountry"] = {
            code: {"players": counts[code], "bars": bars}
            for code, bars in buckets.items()
            if counts.get(code)
        }
    doc["version"] = 6
    doc["updatedAt"] = "2026-10-26T19:45:00Z"
    doc["source"] = doc.get("source") or "seed"
    doc["note"] = (
        "Seeded distributions until live aggregates exist. Stable per puzzle id. "
        "firstGuessWorld and each firstGuessByCountry bucket are one seeded play, "
        "so the first real submits replace that ordering. "
        "countryBoard carries about 9 seeded plays per country; countries under 9 plays "
        "are skipped on the leaderboard, and seeds count toward that cutoff. "
        "Bias-vs-region scores are not in this snapshot."
    )
    return doc


def _payload(row: dict) -> dict:
    payload = row.get("payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return {}
    return payload if isinstance(payload, dict) else {}


def first_guess_of(row: dict) -> dict | None:
    column = row.get("first_guess")
    if isinstance(column, dict):
        return column
    guess = _payload(row).get("firstGuess")
    return guess if isinstance(guess, dict) else None


def _name(entry: Any) -> str:
    if isinstance(entry, dict):
        return str(entry.get("name") or "").strip()
    return str(entry or "").strip()


def _emoji(entry: Any) -> str:
    if isinstance(entry, dict):
        return str(entry.get("emoji") or entry.get("personEmoji") or "")
    return ""


def aggregate_plays(rows: list[dict]) -> dict:
    """Build a snapshot doc from play rows. Practice is ignored.

    A puzzle section is included even when the count is tiny; callers decide
    whether that is enough to replace the seed.
    """
    grouped: dict[str, list[dict]] = defaultdict(list)
    second_n = 0
    for row in rows:
        mode = row.get("mode")
        if mode not in ("daily", "archive"):
            continue
        pid = row.get("puzzle_id")
        if not pid:
            continue
        grouped[str(pid)].append(row)
        second = row.get("second_guess")
        if second is None:
            second = _payload(row).get("secondGuess")
        if second:
            second_n += 1

    puzzles: dict[str, dict] = {}
    for pid, plays in grouped.items():
        kind = next((p.get("puzzle_type") for p in plays if p.get("puzzle_type")), "rank")
        n = len(plays)
        perfect_n = sum(1 for p in plays if p.get("perfect"))
        snap: dict[str, Any] = {
            "type": kind,
            "seeded": False,
            "players": n,
            "pctPerfect": pct(perfect_n, n),
        }
        if kind == "top5":
            found = [p for p in plays if _payload(p).get("hits") is not None]
            ranks = [p for p in plays if _payload(p).get("avgRank") is not None]
            if found:
                snap["avgFound"] = round(sum(float(_payload(p)["hits"]) for p in found) / len(found), 1)
            if ranks:
                snap["avgRank"] = int(sum(float(_payload(p)["avgRank"]) for p in ranks) / len(ranks) + 0.5)
            counter: Counter[str] = Counter()
            emojis: dict[str, str] = {}
            world_n = 0
            by_country: dict[str, Counter[str]] = defaultdict(Counter)
            country_emoji: dict[str, dict[str, str]] = defaultdict(dict)
            country_n: Counter[str] = Counter()
            for play in plays:
                guess = first_guess_of(play)
                if not guess or not guess.get("name"):
                    continue
                name = str(guess["name"])
                world_n += 1
                counter[name] += 1
                if _emoji(guess):
                    emojis[name] = _emoji(guess)
                code = _country(play.get("country_code"))
                if code:
                    country_n[code] += 1
                    by_country[code][name] += 1
                    if _emoji(guess):
                        country_emoji[code][name] = _emoji(guess)
            bars = _top_bars(counter, world_n, emojis)
            snap["firstGuess"] = bars
            snap["firstGuessWorld"] = {"players": world_n, "bars": bars}
            snap["firstGuessByCountry"] = {
                code: {"players": country_n[code], "bars": _top_bars(by_country[code], country_n[code], country_emoji[code])}
                for code in country_n
            }
        elif kind == "name":
            counter: Counter[str] = Counter()
            emojis: dict[str, str] = {}
            world_n = 0
            by_country: dict[str, Counter[str]] = defaultdict(Counter)
            country_emoji: dict[str, dict[str, str]] = defaultdict(dict)
            country_n: Counter[str] = Counter()
            for play in plays:
                if not play.get("solved"):
                    continue
                pick = str(_payload(play).get("pick") or "").strip()
                if not pick:
                    continue
                world_n += 1
                counter[pick] += 1
                emoji = ""
                for guess in _payload(play).get("guesses") or []:
                    if isinstance(guess, dict) and guess.get("name") == pick and guess.get("emoji"):
                        emoji = str(guess["emoji"])
                if emoji:
                    emojis[pick] = emoji
                code = _country(play.get("country_code"))
                if code:
                    country_n[code] += 1
                    by_country[code][pick] += 1
                    if emoji:
                        country_emoji[code][pick] = emoji
            bars = _top_bars(counter, world_n, emojis, 20)
            snap["firstGuessWorld"] = {"players": world_n, "bars": bars}
            snap["firstGuessByCountry"] = {
                code: {"players": country_n[code], "bars": _top_bars(by_country[code], country_n[code], country_emoji[code], 20)}
                for code in country_n
            }
        else:
            item_good: Counter[str] = Counter()
            item_seen: Counter[str] = Counter()
            order_of: list[str] = []
            for play in plays:
                for item in _payload(play).get("items") or []:
                    name = _name(item)
                    if not name:
                        continue
                    if name not in item_seen:
                        order_of.append(name)
                    item_seen[name] += 1
                    if item.get("mark") == "good":
                        item_good[name] += 1
            if item_seen:
                snap["perItemCorrect"] = {name: pct(item_good[name], item_seen[name]) for name in order_of}
            world_rows = [p for p in plays if first_guess_of(p)]
            snap["firstGuessWorld"] = {
                "players": len(world_rows),
                "bars": _assignment_bars(kind, world_rows),
            }
            codes = sorted({c for c in (_country(p.get("country_code")) for p in world_rows) if c})
            snap["firstGuessByCountry"] = {}
            for code in codes:
                subset = [p for p in world_rows if _country(p.get("country_code")) == code]
                snap["firstGuessByCountry"][code] = {
                    "players": len(subset),
                    "bars": _assignment_bars(kind, subset),
                }
        snap.update(_standings(plays))
        puzzles[pid] = snap
    return {
        "version": 5,
        "source": "live",
        "puzzles": puzzles,
        "secondGuessRows": second_n,
    }


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def play_tries(row: dict) -> float | None:
    payload = _payload(row)
    if row.get("puzzle_type") == "top5":
        attempts = payload.get("attempts")
        if isinstance(attempts, list) and attempts:
            tries = _number(payload.get("tries"))
            if tries is not None and tries > 0:
                return tries
            return float(len(attempts))
        guesses = payload.get("guesses")
        if isinstance(guesses, list) and guesses:
            return float(len(guesses))
        hits, misses = _number(payload.get("hits")), _number(payload.get("misses"))
        if hits is not None and misses is not None:
            return hits + misses
        return None
    tries = _number(payload.get("tries"))
    if tries is not None and tries > 0:
        return tries
    return None


def _accuracy(row: dict) -> float | None:
    raw = _number(_payload(row).get("accuracy"))
    if raw is None:
        return None
    return max(0.0, min(100.0, raw))


def _acc_bin(value: float) -> int:
    if value >= 100:
        return 9
    if value <= 0:
        return 0
    return min(9, int(value // 10))


def _standings(plays: list[dict]) -> dict[str, Any]:
    """Country average tries plus the tries/accuracy comparison, from one puzzle."""
    buckets: dict[str, dict[str, Any]] = {}
    tries_vals: list[float] = []
    first_vals: list[float] = []
    first_of: list[int] = []
    acc_pairs: list[tuple[int, float, bool]] = []
    top5 = any(play.get("puzzle_type") == "top5" for play in plays)
    for play in plays:
        tries = play_tries(play)
        if tries is not None:
            tries_vals.append(tries)
        payload = _payload(play)
        first = _number(payload.get("firstCorrect"))
        if first is not None:
            first_vals.append(first)
        width = _number(payload.get("firstOf"))
        if width is not None and width > 0:
            first_of.append(int(width))
        accuracy = _accuracy(play)
        if tries is not None and accuracy is not None:
            acc_pairs.append((int(round(tries)), accuracy, bool(play.get("solved"))))
        code = _country(play.get("country_code"))
        if not code:
            continue
        slot = buckets.setdefault(code, {"players": 0, "solved": 0, "tries": []})
        slot["players"] += 1
        if play.get("solved"):
            slot["solved"] += 1
        if tries is not None:
            slot["tries"].append(tries)
    board = []
    for code in sorted(buckets):
        slot = buckets[code]
        entry: dict[str, Any] = {
            "code": code,
            "players": slot["players"],
            "solveRate": pct(slot["solved"], slot["players"]),
        }
        if slot["tries"]:
            entry["avgTries"] = round(sum(slot["tries"]) / len(slot["tries"]), 1)
        board.append(entry)
    out: dict[str, Any] = {"countryBoard": board}
    if len(tries_vals) >= MIN_STANDING_PLAYERS and len(acc_pairs) >= MIN_STANDING_PLAYERS:
        by_tries: dict[str, list[int]] = {}
        failed: dict[str, list[int]] = {}
        for tries, accuracy, solved in acc_pairs:
            group = by_tries if solved else failed
            hist = group.setdefault(str(tries), [0] * 10)
            hist[_acc_bin(accuracy)] += 1
        of = Counter(first_of).most_common(1)[0][0] if first_of else (5 if top5 else 0)
        out["standing"] = {
            "n": len(acc_pairs),
            "seeded": False,
            "kind": "top5" if top5 else "order",
            "avgTries": round(sum(tries_vals) / len(tries_vals), 2),
            "avgFirst": round(sum(first_vals) / len(first_vals), 2) if first_vals else None,
            "firstOf": of,
            "avgAccuracy": round(sum(acc for _tries, acc, _solved in acc_pairs) / len(acc_pairs)),
            "byTries": by_tries,
            "failed": failed,
        }
    return out


def _country(code: Any) -> str | None:
    text = str(code or "").strip().upper()
    if len(text) == 2 and text.isalpha() and text not in {"XX", "T1"}:
        return text
    return None


def _top_bars(counter: Counter, whole: int, emojis: dict[str, str], limit: int = 6) -> list[dict]:
    bars = []
    for name, count in counter.most_common(limit):
        bar: dict[str, Any] = {"name": name, "pct": pct(count, whole)}
        if emojis.get(name):
            bar["emoji"] = emojis[name]
        bars.append(bar)
    return bars


def _assignment_bars(kind: str, plays: list[dict]) -> list[dict]:
    if not plays:
        return []
    whole = len(plays)
    if kind == "rank":
        slot_counts: list[Counter[str]] = []
        emojis: dict[str, str] = {}
        for play in plays:
            order = (first_guess_of(play) or {}).get("order") or []
            for i, entry in enumerate(order):
                name = _name(entry)
                if not name:
                    continue
                while len(slot_counts) <= i:
                    slot_counts.append(Counter())
                slot_counts[i][name] += 1
                if _emoji(entry):
                    emojis[name] = _emoji(entry)
        used: set[str] = set()
        bars = []
        for i, counter in enumerate(slot_counts):
            pick = next((name for name, _count in counter.most_common() if name not in used), None)
            if not pick:
                pick = counter.most_common(1)[0][0]
            used.add(pick)
            bar: dict[str, Any] = {"slot": i + 1, "name": pick, "pct": pct(counter[pick], whole)}
            if emojis.get(pick):
                bar["emoji"] = emojis[pick]
            bars.append(bar)
        return bars
    if kind == "tier":
        by_item: dict[str, Counter[str]] = {}
        order: list[str] = []
        emojis = {}
        for play in plays:
            for entry in (first_guess_of(play) or {}).get("assign") or []:
                name = _name(entry)
                tier = str(entry.get("tier") or "").strip() if isinstance(entry, dict) else ""
                if not name or not tier:
                    continue
                if name not in by_item:
                    by_item[name] = Counter()
                    order.append(name)
                by_item[name][tier] += 1
                if _emoji(entry):
                    emojis[name] = _emoji(entry)
        bars = []
        for name in order:
            tier, count = by_item[name].most_common(1)[0]
            bar = {"name": name, "tier": tier, "pct": pct(count, whole)}
            if emojis.get(name):
                bar["emoji"] = emojis[name]
            bars.append(bar)
        return bars
    if kind == "match":
        by_clue: dict[str, Counter[str]] = {}
        order = []
        emojis = {}
        for play in plays:
            for pair in (first_guess_of(play) or {}).get("pairs") or []:
                if not isinstance(pair, dict):
                    continue
                clue = str(pair.get("clueFor") or "").strip()
                person = str(pair.get("person") or "").strip()
                if not clue or not person:
                    continue
                if clue not in by_clue:
                    by_clue[clue] = Counter()
                    order.append(clue)
                by_clue[clue][person] += 1
                if pair.get("personEmoji"):
                    emojis[person] = pair["personEmoji"]
        bars = []
        for clue in order:
            person, count = by_clue[clue].most_common(1)[0]
            bar = {
                "name": clue,
                "matchedTo": person,
                "label": f"{short_person(clue)} → {short_person(person)}",
                "pct": pct(count, whole),
            }
            if emojis.get(person):
                bar["emoji"] = emojis[person]
            bars.append(bar)
        return bars
    return []


def _mix_consensus(seed_block: dict | None, live_block: dict | None) -> dict | None:
    """One seeded play loses to the first real first-guess, including a tie."""
    seed_block = seed_block or {}
    live_block = live_block or {}
    seed_bars = list(seed_block.get("bars") or [])
    live_bars = list(live_block.get("bars") or [])
    live_n = int(live_block.get("players") or 0)
    seed_n = SEED_CONSENSUS_PLAYS if seed_bars else 0
    if live_n > 0 and live_bars and live_n >= seed_n:
        return {"players": seed_n + live_n, "bars": live_bars}
    if seed_bars:
        return {"players": seed_n, "bars": seed_bars}
    if live_bars:
        return {"players": live_n, "bars": live_bars}
    return None


def _mix_country_consensus(seed_map: dict | None, live_map: dict | None) -> dict:
    seed_map = seed_map or {}
    live_map = live_map or {}
    out: dict[str, Any] = {}
    for code in sorted(set(seed_map) | set(live_map)):
        mixed = _mix_consensus(seed_map.get(code), live_map.get(code))
        if mixed:
            out[code] = mixed
    return out


def _mix_country_board(seed_rows: list | None, live_rows: list | None) -> list:
    """Blend average tries. Seed plays count toward the leaderboard cutoff."""
    seed_by: dict[str, dict] = {}
    order: list[str] = []
    for row in seed_rows or []:
        code = str((row or {}).get("code") or "")
        if not code or code in seed_by:
            continue
        seed_by[code] = row
        order.append(code)
    live_by: dict[str, dict] = {}
    for row in live_rows or []:
        code = str((row or {}).get("code") or "")
        if not code:
            continue
        live_by[code] = row
        if code not in seed_by:
            order.append(code)
    out = []
    for code in order:
        seed = seed_by.get(code) or {}
        live = live_by.get(code) or {}
        seed_n = int(seed.get("players") or 0)
        live_n = int(live.get("players") or 0)
        players = seed_n + live_n
        if players <= 0:
            continue
        seed_avg = seed.get("avgTries")
        live_avg = live.get("avgTries")
        entry: dict[str, Any] = {"code": code, "players": players}
        if seed_avg is not None and live_avg is not None and seed_n and live_n:
            entry["avgTries"] = round((float(seed_avg) * seed_n + float(live_avg) * live_n) / players, 1)
        elif live_avg is not None and live_n:
            entry["avgTries"] = live_avg
        elif seed_avg is not None:
            entry["avgTries"] = seed_avg
        if seed.get("seeded") and seed_n:
            entry["seeded"] = True
        if live_n and not seed_n and "solveRate" in live:
            entry["solveRate"] = live["solveRate"]
        out.append(entry)
    return out


def _mix_seed(seed_row: dict, live_row: dict) -> dict:
    """Fold real plays into the seed without rewriting the comparison crowd."""
    row = dict(seed_row)
    row["seeded"] = True
    world = _mix_consensus(seed_row.get("firstGuessWorld"), live_row.get("firstGuessWorld"))
    if world:
        row["firstGuessWorld"] = world
    if seed_row.get("firstGuessByCountry") or live_row.get("firstGuessByCountry"):
        row["firstGuessByCountry"] = _mix_country_consensus(
            seed_row.get("firstGuessByCountry"),
            live_row.get("firstGuessByCountry"),
        )
    if seed_row.get("countryBoard") or live_row.get("countryBoard"):
        row["countryBoard"] = _mix_country_board(seed_row.get("countryBoard"), live_row.get("countryBoard"))
    return row


def overlay_seed(seed_doc: dict, live_doc: dict, min_players: int = MIN_STANDING_PLAYERS) -> dict:
    """Keep the comparison crowd until a puzzle can stand on its own.

    Below that, real plays mix in. World and per-country orderings are a
    1-play seed, so the first real first-guess replaces them. Leaderboard
    averages keep their seeded plays (about 9 per country) and fold real
    tries into that average. "Better than" stays on the seeded crowd until
    `min_players` real plays exist, then the live snapshot replaces the seed.
    """
    out = json.loads(json.dumps(seed_doc))
    replaced = []
    blended = []
    puzzles = out.setdefault("puzzles", {})
    for pid, snap in (live_doc.get("puzzles") or {}).items():
        live_n = int(snap.get("players") or 0)
        if live_n >= min_players:
            fresh = dict(snap)
            fresh["seeded"] = False
            puzzles[pid] = fresh
            replaced.append(pid)
        elif live_n > 0 and pid in puzzles:
            puzzles[pid] = _mix_seed(puzzles[pid], snap)
            blended.append(pid)
    out["version"] = 6
    if replaced and len(replaced) == len(puzzles):
        out["source"] = "live"
    elif replaced or blended:
        out["source"] = "mixed"
    else:
        out["source"] = seed_doc.get("source") or "seed"
    out["livePuzzlesReplaced"] = replaced
    out["livePuzzlesBlended"] = blended
    return out


def _self_test() -> None:
    rank_plays = []
    for order, code, perfect in (
        ([{"name": "A", "emoji": "🇦"}, {"name": "B"}], "TW", False),
        ([{"name": "A"}, {"name": "B"}], "TW", False),
        ([{"name": "B"}, {"name": "A"}], "US", True),
        ([{"name": "B"}, {"name": "A"}], None, False),
    ):
        rank_plays.append({
            "puzzle_id": "demo-rank",
            "puzzle_type": "rank",
            "mode": "daily",
            "solved": perfect,
            "perfect": perfect,
            "country_code": code,
            "payload": {
                "tries": 1 if perfect else 3,
                "score": 1.0 if perfect else 0.55,
                "accuracy": 100 if perfect else 40,
                "firstCorrect": 2 if perfect else 0,
                "firstOf": 2,
                "items": [{"name": "A", "mark": "good" if order[0]["name"] == "A" else "bad"}, {"name": "B", "mark": "good"}],
                "secondGuess": {"kind": "rank", "order": [{"name": "A"}, {"name": "B"}]},
            },
            "first_guess": {"kind": "rank", "order": order},
            "second_guess": {"kind": "rank", "order": [{"name": "A"}, {"name": "B"}]},
        })
    rank_plays.append({
        "puzzle_id": "demo-rank", "puzzle_type": "rank", "mode": "practice",
        "solved": True, "perfect": True, "country_code": "US",
        "payload": {"items": [{"name": "A", "mark": "good"}]},
        "first_guess": {"kind": "rank", "order": [{"name": "Z"}]},
    })
    live = aggregate_plays(rank_plays)
    snap = live["puzzles"]["demo-rank"]
    assert snap["players"] == 4, snap
    assert snap["firstGuessWorld"]["players"] == 4
    assert snap["firstGuessWorld"]["bars"][0]["name"] in {"A", "B"}
    assert snap["firstGuessByCountry"]["TW"]["players"] == 2
    assert snap["firstGuessByCountry"]["TW"]["bars"][0]["name"] == "A"
    assert "Z" not in json.dumps(snap)
    assert live["secondGuessRows"] == 4
    board = {row["code"]: row for row in snap["countryBoard"]}
    assert set(board) == {"TW", "US"}
    assert board["TW"]["players"] == 2 and board["TW"]["solveRate"] == 0 and board["TW"]["avgTries"] == 3.0
    assert board["US"]["players"] == 1 and board["US"]["solveRate"] == 100 and board["US"]["avgTries"] == 1.0
    assert "standing" not in snap  # four scored plays stay on the seed distribution

    top = aggregate_plays([
        {"puzzle_id": "demo-top", "puzzle_type": "top5", "mode": "archive", "solved": False, "perfect": False,
         "country_code": "US", "payload": {"hits": 3, "avgRank": 10, "firstGuess": {"kind": "top5", "name": "Japan", "emoji": "🇯🇵"}}},
        {"puzzle_id": "demo-top", "puzzle_type": "top5", "mode": "daily", "solved": True, "perfect": False,
         "country_code": "US", "payload": {"hits": 5, "avgRank": 4}, "first_guess": {"kind": "top5", "name": "Japan", "emoji": "🇯🇵"}},
    ])
    top_snap = top["puzzles"]["demo-top"]
    assert top_snap["firstGuess"][0]["name"] == "Japan"
    assert top_snap["firstGuess"][0]["pct"] == 100
    assert top_snap["avgFound"] == 4.0

    seed = {"version": 1, "source": "seed", "puzzles": {"demo-rank": {"type": "rank", "seeded": True, "players": 100, "pctPerfect": 10, "perItemCorrect": {"A": 50, "B": 40}}}}
    merged = overlay_seed(add_seed_first_guess(json.loads(json.dumps(seed)), {}), live)
    assert merged["puzzles"]["demo-rank"]["seeded"] is True
    assert merged["puzzles"]["demo-rank"]["players"] == 100  # comparison crowd stays put
    assert merged["puzzles"]["demo-rank"]["firstGuessWorld"]["players"] == SEED_CONSENSUS_PLAYS + 4
    assert merged["source"] == "mixed"
    assert "demo-rank" in merged["livePuzzlesBlended"]
    big = aggregate_plays(rank_plays * 6)
    # 4 non-practice * 6 = 24 plays
    replaced = overlay_seed(seed, big)
    assert replaced["puzzles"]["demo-rank"]["seeded"] is False
    assert replaced["source"] == "live"
    standing = replaced["puzzles"]["demo-rank"]["standing"]
    assert standing["n"] == 24 and standing["seeded"] is False
    assert standing["avgTries"] > 1
    failed_n = sum(sum(hist) for hist in standing["failed"].values())
    solved_n = sum(sum(hist) for hist in standing["byTries"].values())
    assert solved_n + failed_n == 24 and failed_n == 18
    assert replaced["puzzles"]["demo-rank"]["countryBoard"]

    tiny = {"version": 1, "source": "seed", "puzzles": {"work": {"type": "rank", "seeded": True, "players": 80, "pctPerfect": 21, "perItemCorrect": {"Greece": 80, "Japan": 40, "Germany": 20}}}}
    seeded = add_seed_first_guess(tiny, {"work": {"type": "rank", "items": [{"name": "Greece", "emoji": "🇬🇷"}, {"name": "Japan", "emoji": "🇯🇵"}, {"name": "Germany", "emoji": "🇩🇪"}]}})
    block = seeded["puzzles"]["work"]
    assert block["pctPerfect"] == 21
    assert block["firstGuessWorld"]["players"] == SEED_CONSENSUS_PLAYS
    assert [b["slot"] for b in block["firstGuessWorld"]["bars"]] == [1, 2, 3]
    for code in ("TW", "US", "SG"):
        assert block["firstGuessByCountry"][code]["players"] == SEED_CONSENSUS_PLAYS
    assert block["firstGuessWorld"]["bars"][0]["name"] != block["firstGuessByCountry"]["US"]["bars"][0]["name"]
    assert block["rowCount"] == 3

    mix_seed = {
        "version": 6,
        "source": "seed",
        "puzzles": {
            "work": {
                "type": "rank",
                "seeded": True,
                "players": 400,
                "pctPerfect": 12,
                "perItemCorrect": {"Greece": 80, "Japan": 40},
                "firstGuessWorld": {"players": 1, "bars": [
                    {"slot": 1, "name": "Greece", "pct": 40},
                    {"slot": 2, "name": "Japan", "pct": 30},
                ]},
                "firstGuessByCountry": {
                    "US": {"players": 1, "bars": [{"slot": 1, "name": "Japan", "pct": 50}, {"slot": 2, "name": "Greece", "pct": 40}]},
                    "TW": {"players": 1, "bars": [{"slot": 1, "name": "Greece", "pct": 44}, {"slot": 2, "name": "Japan", "pct": 33}]},
                },
                "countryBoard": [
                    {"code": "DE", "players": 9, "avgTries": 3.0, "seeded": True},
                    {"code": "JP", "players": 9, "avgTries": 2.6, "seeded": True},
                    {"code": "SG", "players": 2, "avgTries": 1.5, "seeded": True},
                ],
                "standing": {"n": 400, "avgTries": 3.1, "seeded": True},
            }
        },
    }
    mix_live = aggregate_plays([
        {
            "puzzle_id": "work", "puzzle_type": "rank", "mode": "daily", "solved": True, "perfect": False,
            "country_code": "DE",
            "payload": {"tries": 1, "accuracy": 100, "firstCorrect": 2, "firstOf": 2},
            "first_guess": {"kind": "rank", "order": [{"name": "Japan"}, {"name": "Greece"}]},
        },
        {
            "puzzle_id": "work", "puzzle_type": "rank", "mode": "daily", "solved": True, "perfect": False,
            "country_code": "FR",
            "payload": {"tries": 1, "accuracy": 90, "firstCorrect": 1, "firstOf": 2},
            "first_guess": {"kind": "rank", "order": [{"name": "Japan"}, {"name": "Greece"}]},
        },
        {
            "puzzle_id": "work", "puzzle_type": "rank", "mode": "archive", "solved": False, "perfect": False,
            "country_code": "FR",
            "payload": {"tries": 1, "accuracy": 80, "firstCorrect": 1, "firstOf": 2},
            "first_guess": {"kind": "rank", "order": [{"name": "Japan"}, {"name": "Greece"}]},
        },
    ])
    mixed = overlay_seed(mix_seed, mix_live)
    mixed_row = mixed["puzzles"]["work"]
    assert mixed_row["seeded"] is True
    assert mixed_row["players"] == 400
    assert mixed_row["standing"]["avgTries"] == 3.1
    assert mixed_row["pctPerfect"] == 12
    assert mixed_row["firstGuessWorld"]["bars"][0]["name"] == "Japan"
    assert mixed_row["firstGuessWorld"]["players"] == 1 + 3
    assert mixed_row["firstGuessByCountry"]["US"]["players"] == 1
    assert mixed_row["firstGuessByCountry"]["US"]["bars"][0]["name"] == "Japan"
    assert mixed_row["firstGuessByCountry"]["FR"]["players"] == 2
    board = {row["code"]: row for row in mixed_row["countryBoard"]}
    assert board["DE"]["players"] == 10 and board["DE"]["avgTries"] == 2.8  # (3.0*9 + 1.0) / 10
    assert board["JP"]["players"] == 9 and board["JP"]["avgTries"] == 2.6
    assert board["SG"]["players"] == 2
    assert board["FR"]["players"] == 2
    assert board["FR"]["players"] < MIN_COUNTRY_PLAYERS
    assert board["SG"]["players"] < MIN_COUNTRY_PLAYERS
    assert board["DE"]["players"] >= MIN_COUNTRY_PLAYERS
    assert "standing" not in mix_live["puzzles"]["work"]
    named = aggregate_plays([
        {
            "puzzle_id": "name-demo", "puzzle_type": "name", "mode": "daily", "solved": True, "perfect": False,
            "country_code": "US", "payload": {"tries": 2, "accuracy": 75, "pick": "Sweden", "guesses": [
                {"name": "Sudan", "emoji": "🇸🇩"}, {"name": "Sweden", "emoji": "🇸🇪"},
            ]},
        },
        {
            "puzzle_id": "name-demo", "puzzle_type": "name", "mode": "daily", "solved": True, "perfect": True,
            "country_code": "DE", "payload": {"tries": 1, "accuracy": 100, "pick": "Sweden", "guesses": [
                {"name": "Sweden", "emoji": "🇸🇪"},
            ]},
        },
        {
            "puzzle_id": "name-demo", "puzzle_type": "name", "mode": "archive", "solved": False, "perfect": False,
            "country_code": "FR", "payload": {"tries": 5, "accuracy": 0, "pick": None, "guesses": []},
        },
    ])
    name_row = named["puzzles"]["name-demo"]
    assert name_row["type"] == "name"
    assert name_row["firstGuessWorld"]["players"] == 2
    assert name_row["firstGuessWorld"]["bars"][0]["name"] == "Sweden"
    assert name_row["firstGuessWorld"]["bars"][0]["pct"] == 100
    assert name_row["firstGuessByCountry"]["US"]["players"] == 1
    assert "FR" not in name_row["firstGuessByCountry"]
    print("community_snapshot self-test ok")


if __name__ == "__main__":
    _self_test()
