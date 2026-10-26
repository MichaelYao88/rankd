#!/usr/bin/env python3
"""Keep clearly sensitive dailies out of the AdSense review window.

The window is every daily on or before 2026-11-03 (archive through that
day, including the seven days after 2026-10-27). Clearly sensitive puzzles
there exchange daily_order with a later innocuous puzzle. Borderline
puzzles stay put. Puzzle ids are not changed.

    python3 tools/adsense_safe_window.py --check
    python3 tools/adsense_safe_window.py --plan
    python3 tools/adsense_safe_window.py --apply

See docs/adsense-safe-window.md.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUZZLES_JS = ROOT / "puzzles-data.js"
XLSX = ROOT / "puzzles.xlsx"
CSV_FILES = (
    ROOT / "puzzles.csv",
    ROOT / "top5_puzzles.csv",
    ROOT / "match_puzzles.csv",
    ROOT / "tier_puzzles.csv",
)
EPOCH = date(2026, 10, 6)
CUTOFF = date(2026, 11, 3)
ASSIGNMENT = "window.RANKD_PUZZLES = "

# Clearly sensitive: sexual content, sexual violence, intimate partner
# violence, homicide/murder/suicide, drugs. Matched against id, headline,
# question and stat only (not the fun fact).
CLEAR_RES = (
    re.compile(r"homicide|murder|serial killer", re.I),
    re.compile(r"suicide", re.I),
    re.compile(r"overdose|drug use disorder|drug[- ]death|cannabis|marijuana|\bweed\b", re.I),
    re.compile(r"penis|erect circumference|reported circumference", re.I),
    re.compile(r"pornograph|child-sex image|child corn|sexual abuse of a child", re.I),
    re.compile(r"sex offenc|sex offens|sexual offenc", re.I),
    re.compile(r"partner violence|intimate partner", re.I),
    re.compile(r"age of consent", re.I),
    re.compile(r"\bgrape\b", re.I),
)

# Do not pull these into the window. They also stay if they are already inside it.
BORDER_RES = (
    re.compile(r"alcohol|\bwine\b|gambl", re.I),
    re.compile(r"ethnic|ancestr|\brace\b|trump", re.I),
    re.compile(r"religion|\bfaith\b|jewish", re.I),
    re.compile(r"obesity|height|taller|testosterone|fertil|teen birth|sex ratio|women per 100", re.I),
    re.compile(r"maternal|infant mort|prison|conviction", re.I),
    re.compile(r"tobacco|\bsmok|bisexual|equaldex|\bgays?\b|lgbt|autism", re.I),
    re.compile(r"tend the home|police|israel", re.I),
)


def date_of(order: float) -> date:
    return EPOCH + timedelta(days=int(round(order)) - 1)


def blob(p: dict) -> str:
    return " ".join(str(p.get(k) or "") for k in ("id", "headline", "question", "stat", "dataset"))


def clearly_sensitive(p: dict) -> bool:
    text = blob(p)
    return any(rx.search(text) for rx in CLEAR_RES)


def borderline_topic(p: dict) -> bool:
    text = blob(p)
    return any(rx.search(text) for rx in BORDER_RES)


def split_top_level(raw: str) -> list[str]:
    if not raw.startswith("["):
        raise SystemExit("puzzles-data.js: array not found")
    objs: list[str] = []
    i = 1
    n = len(raw)
    while i < n:
        while i < n and raw[i] in " \n\r\t,":
            i += 1
        if i >= n or raw[i] == "]":
            break
        if raw[i] != "{":
            raise SystemExit(f"puzzles-data.js: expected object at {i}")
        start = i
        depth = 0
        in_str = False
        esc = False
        while i < n:
            c = raw[i]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
            else:
                if c == '"':
                    in_str = True
                elif c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        i += 1
                        objs.append(raw[start:i])
                        break
            i += 1
        else:
            raise SystemExit("puzzles-data.js: unclosed object")
    return objs


def load_js() -> tuple[str, str, list[str], list[dict]]:
    text = PUZZLES_JS.read_text(encoding="utf-8")
    marker = text.index(ASSIGNMENT) + len(ASSIGNMENT)
    prefix = text[:marker]
    rest = text[marker:]
    start = rest.index("[")
    # The array is the rest of the assignment. Find its end by splitting.
    array_and_suffix = rest[start:]
    objs = split_top_level(array_and_suffix)
    joined = "[" + ",".join(objs) + "]"
    if not array_and_suffix.startswith(joined):
        raise SystemExit("puzzles-data.js: could not round-trip the array")
    suffix = array_and_suffix[len(joined):]
    puzzles = [json.loads(obj) for obj in objs]
    return prefix, suffix, objs, puzzles


def set_order_token(obj: str, new_order: int) -> str:
    match = re.search(r'"order":(\d+(?:\.\d+)?)', obj)
    if not match:
        raise SystemExit("puzzle object has no order")
    token = match.group(1)
    replacement = f"{new_order}.0" if "." in token else str(new_order)
    updated, n = re.subn(r'"order":\d+(?:\.\d+)?', f'"order":{replacement}', obj, count=1)
    if n != 1:
        raise SystemExit("failed to rewrite order")
    return updated


def choose_pairs(puzzles: list[dict]) -> list[tuple[dict, dict]]:
    ordered = sorted(puzzles, key=lambda p: p["order"])
    by_index = {p["id"]: i for i, p in enumerate(ordered)}

    def neighbors(p: dict) -> list[dict]:
        i = by_index[p["id"]]
        out = []
        if i > 0:
            out.append(ordered[i - 1])
        if i + 1 < len(ordered):
            out.append(ordered[i + 1])
        return out

    moving = [p for p in ordered if date_of(p["order"]) <= CUTOFF and clearly_sensitive(p)]
    chosen: list[dict] = []
    chosen_ids: set[str] = set()
    for p in ordered:
        if date_of(p["order"]) <= CUTOFF:
            continue
        if clearly_sensitive(p) or p.get("sensitive") or borderline_topic(p):
            continue
        if any(clearly_sensitive(n) or n["id"] in chosen_ids for n in neighbors(p)):
            continue
        chosen.append(p)
        chosen_ids.add(p["id"])
        if len(chosen) == len(moving):
            break
    if len(chosen) < len(moving):
        raise SystemExit(f"need {len(moving)} safe later puzzles, found {len(chosen)}")
    return list(zip(moving, chosen))


def csv_orders() -> dict[str, int]:
    found: dict[str, int] = {}
    for path in CSV_FILES:
        text = path.read_text(encoding="utf-8-sig")
        if "puzzle_id" not in text.splitlines()[0] or "daily_order" not in text.splitlines()[0]:
            continue
        for line in text.splitlines():
            # Order lives on the puzzle's first row only: id,integer,...
            # Continuation rows are id,,... and the header is not an integer.
            match = re.match(r"([^,\r\n]+),(\d+),", line)
            if not match or match.group(1) == "puzzle_id":
                continue
            pid, order = match.group(1), int(match.group(2))
            if pid in found and found[pid] != order:
                raise SystemExit(f"{path.name}: {pid} has orders {found[pid]} and {order}")
            found[pid] = order
    return found


def xlsx_orders() -> dict[str, int]:
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    found: dict[str, int] = {}
    with zipfile.ZipFile(XLSX) as book:
        for name in book.namelist():
            if not name.startswith("xl/worksheets/sheet"):
                continue
            xml = book.read(name).decode("utf-8")
            for row, pid, numeric, inline in re.findall(
                r'<c r="A(\d+)"[^>]*><is><t>([^<]+)</t></is></c><c r="B\1"[^>]*>(?:<v>(\d+)</v>|<is><t>(\d+)</t></is>)',
                xml,
            ):
                if row == "1":
                    continue
                order_n = int(numeric or inline)
                if pid in found and found[pid] != order_n:
                    raise SystemExit(f"{name}: {pid} has orders {found[pid]} and {order_n}")
                found[pid] = order_n
    return found


def orders_match(puzzles: list[dict]) -> list[str]:
    js = {p["id"]: int(round(p["order"])) for p in puzzles}
    problems = []
    for label, got in (("csv", csv_orders()), ("xlsx", xlsx_orders())):
        missing = [pid for pid in js if pid not in got]
        extra = [pid for pid in got if pid not in js]
        differ = [f"{pid}: js {js[pid]} vs {label} {got[pid]}" for pid in js if pid in got and js[pid] != got[pid]]
        if missing:
            problems.append(f"{label} missing {len(missing)}: {', '.join(missing[:8])}")
        if extra:
            problems.append(f"{label} extra {', '.join(extra[:8])}")
        problems.extend(differ)
    return problems


def apply_swaps(pairs: list[tuple[dict, dict]]) -> None:
    prefix, suffix, objs, puzzles = load_js()
    by_id = {p["id"]: i for i, p in enumerate(puzzles)}
    new_orders = {p["id"]: int(round(p["order"])) for p in puzzles}
    for left, right in pairs:
        new_orders[left["id"]], new_orders[right["id"]] = new_orders[right["id"]], new_orders[left["id"]]
    updated = []
    for obj, puzzle in zip(objs, puzzles):
        pid = puzzle["id"]
        current = int(round(puzzle["order"]))
        raw = obj if new_orders[pid] == current else set_order_token(obj, new_orders[pid])
        updated.append((new_orders[pid], raw))
    updated.sort(key=lambda item: item[0])
    text = prefix + "[" + ",".join(raw for _, raw in updated) + "]" + suffix
    # Confirm the rewrite still parses and the ids are unchanged.
    parsed = json.loads(text[text.index("[") :].strip().rstrip(";"))
    if [p["id"] for p in parsed] != [pid for _, raw in updated for pid in [json.loads(raw)["id"]]]:
        raise SystemExit("rewrite shuffled ids unexpectedly")
    if sorted(p["id"] for p in parsed) != sorted(p["id"] for p in puzzles):
        raise SystemExit("rewrite dropped or added a puzzle")
    PUZZLES_JS.write_text(text, encoding="utf-8")
    patch_csvs(new_orders)
    patch_xlsx(new_orders)


def patch_csvs(new_orders: dict[str, int]) -> None:
    for path in CSV_FILES:
        # Keep the file's own newlines. read_text() would turn CRLF into LF.
        original = path.read_bytes().decode("utf-8")
        if "puzzle_id" not in original.splitlines()[0] or "daily_order" not in original.splitlines()[0]:
            continue

        def repl(match: re.Match[str]) -> str:
            pid = match.group(2)
            if pid not in new_orders or int(match.group(3)) == new_orders[pid]:
                return match.group(0)
            return f"{match.group(1)}{pid},{new_orders[pid]},"

        updated = re.sub(r"(?m)^(\ufeff?)([^,\r\n]+),(\d+),", repl, original)
        path.write_bytes(updated.encode("utf-8"))


def patch_xlsx(new_orders: dict[str, int]) -> None:
    ns_xml = XLSX.read_bytes()
    tmp = XLSX.with_suffix(".xlsx.tmp")
    with zipfile.ZipFile(XLSX) as source, zipfile.ZipFile(tmp, "w") as dest:
        for info in source.infolist():
            data = source.read(info.filename)
            if info.filename.startswith("xl/worksheets/sheet"):
                xml = data.decode("utf-8")

                def repl(match: re.Match[str]) -> str:
                    pid = match.group(2)
                    order = int(match.group(3) or match.group(4))
                    if pid not in new_orders or new_orders[pid] == order:
                        return match.group(0)
                    cell = match.group(0)
                    return cell.replace(f">{order}<", f">{new_orders[pid]}<", 1)

                xml = re.sub(
                    r'(<c r="A\d+"[^>]*><is><t>([^<]+)</t></is></c><c r="B\d+"[^>]*>(?:<v>(\d+)</v>|<is><t>(\d+)</t></is>))',
                    repl,
                    xml,
                )
                data = xml.encode("utf-8")
            dest.writestr(info, data)
    tmp.replace(XLSX)
    # Silence unused in case the file was empty.
    del ns_xml


def window_rows(puzzles: list[dict]) -> list[dict]:
    return [p for p in sorted(puzzles, key=lambda p: p["order"]) if date_of(p["order"]) <= CUTOFF]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the window still has a clearly sensitive daily")
    parser.add_argument("--plan", action="store_true", help="print the swaps and stop")
    parser.add_argument("--apply", action="store_true", help="exchange the daily_order values")
    args = parser.parse_args()
    if not (args.check or args.plan or args.apply):
        args.check = True

    _, _, _, puzzles = load_js()
    pairs = choose_pairs(puzzles)
    if args.plan or args.apply:
        if not pairs:
            print("No clearly sensitive dailies in the window.")
        for left, right in pairs:
            print(
                f"{left['id']} {date_of(left['order']).isoformat()} #{int(left['order'])} {left.get('headline')}"
                f"  <->  {right['id']} {date_of(right['order']).isoformat()} #{int(right['order'])} {right.get('headline')}"
            )
    if args.apply:
        if pairs:
            apply_swaps(pairs)
            _, _, _, puzzles = load_js()
        else:
            # JS is already clear. Still push its orders into the CSV copies and workbook.
            orders = {p["id"]: int(round(p["order"])) for p in puzzles}
            patch_csvs(orders)
            patch_xlsx(orders)
            print("Orders already clear; synced CSV and workbook to puzzles-data.js.")
    if args.check or args.apply:
        drifted = orders_match(puzzles)
        if drifted:
            print("\n".join(drifted), file=sys.stderr)
            return 1
        stuck = [p for p in window_rows(puzzles) if clearly_sensitive(p)]
        if stuck:
            for p in stuck:
                print(f"still in window: {date_of(p['order']).isoformat()} {p['id']} {p.get('headline')}", file=sys.stderr)
            return 1
        if args.check and pairs:
            print(f"{len(pairs)} clearly sensitive daily(s) still in the window. Run --apply.", file=sys.stderr)
            return 1
        print(f"ok: {len(puzzles)} puzzles, window through {CUTOFF.isoformat()} is clear")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
