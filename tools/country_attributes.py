#!/usr/bin/env python3
"""Country attributes for ranki.gg puzzles.

One row per sovereign country (UN members in country_info.csv, plus Kosovo,
Palestine, and Vatican City). Territories are left out. Saint Helena is not
a row.

  python3 tools/country_attributes.py --write
  python3 tools/country_attributes.py --where has_mcdonalds=no --sort population --limit 6
  python3 tools/country_attributes.py --where ever_female_leader=no --sort population --limit 6 --json

Tri-state columns use yes / no / partial. A filter matches that value only,
so partial is not treated as yes or as no. Rankings skip a blank number.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INFO = ROOT / "country_info.csv"
OUT = ROOT / "country_attributes.csv"
NAMES = ROOT / "name-puzzles.js"
WB_LAND = Path("/tmp/wb-land-area.json")

# Not sovereign. Saint Helena is not in country_info.csv; it is not added.
TERRITORIES = {
    "ABW", "ASM", "BMU", "CHI", "CUW", "CYM", "FRO", "GIB", "GRL", "GUM",
    "HKG", "IMN", "MAC", "MAF", "MNP", "NCL", "PRI", "PYF", "SXM", "TCA",
    "VGB", "VIR", "GB-ENG", "GB-SCT", "GB-WLS", "GB-NIR",
}

# Current monarchies, 2026. Andorra is a co-principality (partial).
# Vatican City is an elective monarchy (yes).
MONARCHY_YES = {
    "ATG", "AUS", "BHS", "BHR", "BEL", "BLZ", "BTN", "BRN", "KHM", "CAN",
    "DNK", "SWZ", "GRD", "JAM", "JPN", "JOR", "KWT", "LSO", "LIE", "LUX",
    "MYS", "MCO", "MAR", "NLD", "NZL", "NOR", "OMN", "PNG", "QAT", "KNA",
    "LCA", "VCT", "SAU", "SLB", "ESP", "SWE", "THA", "TON", "TUV", "ARE",
    "GBR", "VAT",
}
MONARCHY_PARTIAL = {"AND"}

# Mediterranean coastline of the sovereign state. Gaza counts for Palestine.
MEDITERRANEAN = {
    "ALB", "DZA", "BIH", "HRV", "CYP", "EGY", "FRA", "GRC", "ISR", "ITA",
    "LBN", "LBY", "MLT", "MCO", "MNE", "MAR", "SVN", "ESP", "SYR", "TUN",
    "TUR", "PSE",
}

# No public commercial airport on the territory. Andorra uses La Seu d'Urgell
# in Spain, Monaco uses Nice, Liechtenstein uses Zurich, San Marino and
# Vatican City have none.
NO_AIRPORT = {"AND", "LIE", "MCO", "SMR", "VAT"}

# General civil divorce for the whole population, as of October 2026.
# Philippines: no general divorce (annulment exists; PD 1083 covers Muslim
# marriages). Vatican City: no divorce.
DIVORCE_NO = {"PHL", "VAT"}

# Wikipedia "List of countries with McDonald's restaurants", current outlets.
# Corporate counts dated 31 Dec 2025 unless the row names an earlier count.
# Closed chains are no, not yes. Cuba is partial: the only outlet is on the
# US base at Guantanamo Bay and is not open to Cuban citizens.
MCDONALDS_YES = {
    "USA", "CAN", "CRI", "AUS", "JPN", "NLD", "PAN", "DEU", "FRA", "SLV",
    "SWE", "GTM", "GBR", "BHS", "NZL", "CHE", "IRL", "AUT", "BEL", "BRA",
    "SGP", "ESP", "DNK", "PHL", "MYS", "NOR", "AND", "FIN", "THA", "ITA",
    "LUX", "VEN", "MEX", "TUR", "ARG", "SRB", "KOR", "HUN", "CHN", "CHL",
    "IDN", "PRT", "GRC", "URY", "CZE", "POL", "MCO", "BRN", "MAR", "ISR",
    "SVN", "SAU", "KWT", "OMN", "EGY", "BGR", "BHR", "LVA", "ARE", "EST",
    "ROU", "MLT", "COL", "SVK", "ZAF", "QAT", "HND", "HRV", "WSM", "FJI",
    "LIE", "LTU", "IND", "PER", "JOR", "PRY", "DOM", "TTO", "UKR", "CYP",
    "ECU", "SUR", "MDA", "NIC", "LBN", "PAK", "GEO", "AZE", "MUS", "VNM",
}
MCDONALDS_PARTIAL = {"CUB"}

# A woman has held the office of head of state or head of government in her
# own right. Built from the Wikipedia list of elected or appointed female
# heads (read 2026-11-02), plus queens regnant of the Netherlands, Spain and
# Tonga. Governor-general-only, acting-only, and honorary-only are partial.
# Myanmar's state counsellor is partial (not the constitutional head).
# The United States' 85-minute acting presidency in 2021 is not counted, so
# the US stays no. Switzerland is yes because women have presided over the
# Federal Council. Vatican City is yes: Raffaella Petrini became president
# of the Governorate on 1 March 2025. Luxembourg is yes: Grand Duchess
# Charlotte (1919-1964) and Marie-Adélaïde (1912-1919) reigned in their own right.
FEMALE_YES = {
    "ARG", "AUS", "AUT", "BDI", "BEL", "BGD", "BGR", "BIH", "BOL", "BRA",
    "BRB", "CAF", "CAN", "CHE", "CHL", "COD", "CRI", "DEU", "DMA", "DNK",
    "ECU", "ESP", "EST", "ETH", "FIN", "FRA", "GAB", "GBR", "GEO", "GRC",
    "GUY", "HND", "HRV", "HTI", "HUN", "IDN", "IND", "IRL", "ISL", "ISR",
    "ITA", "JAM", "JPN", "KGZ", "KOR", "LBR", "LIE", "LKA", "LTU", "LUX", "LVA",
    "MAR", "MDA", "MEX", "MHL", "MKD", "MLI", "MLT", "MUS", "MWI", "NAM",
    "NIC", "NLD", "NOR", "NPL", "NZL", "PAK", "PAN", "PER", "PHL", "POL",
    "PRT", "ROU", "RWA", "SEN", "SGP", "SMR", "SRB", "STP", "SUR", "SVK",
    "SVN", "SWE", "TGO", "THA", "TON", "TTO", "TUN", "TUR", "TZA", "UKR",
    "VAT", "WSM", "XKX",
}
FEMALE_PARTIAL = {
    "AND", "ATG", "BHS", "BLZ", "CHN", "CPV", "GNB", "GRD", "KNA", "LCA",
    "MCO", "MDG", "MMR", "MNG", "SDN", "SLV", "TUV", "VCT", "VEN", "VNM",
    "ZAF",
}

SOURCES = {
    "population": "World Bank SP.POP.TOTL 2024, via country_info.csv",
    "land_area": "World Bank AG.LND.TOTL.K2, latest non-empty year (fetched 2026-11-02)",
    "landlocked": "country_info.csv landlocked field (World Bank country metadata)",
    "mediterranean_coast": "Sovereign state with a Mediterranean coastline. Palestine includes the Gaza coast. The UK does not include Gibraltar.",
    "is_monarchy": "Current monarchies in 2026. yes = a reigning monarch is head of state, including Commonwealth realms and Vatican City. partial = Andorra, a co-principality.",
    "has_mcdonalds": "Wikipedia: List of countries with McDonald's restaurants. Current outlets use corporate counts through 31 Dec 2025. A closed chain is no. partial = Cuba, where the only outlet is on the US base at Guantanamo Bay and is closed to Cuban citizens.",
    "ever_female_leader": "Wikipedia: List of elected and appointed female heads of state and government, plus queens regnant (Netherlands, Spain, Tonga). yes = she held the office in her own right. partial = acting-only, honorary-only, governor-general-only, or a de facto title that is not the constitutional head (China, South Africa, Vietnam, Myanmar, and others). A sub-day acting spell is not counted, so the United States is no.",
    "divorce_legal": "General civil divorce for the whole population. no = Philippines and Vatican City, still the case in October 2026. The Philippines allows annulment, and Presidential Decree 1083 allows divorce for Muslim marriages; neither is a general divorce law.",
    "has_public_commercial_airport": "Public commercial airport on the territory. no = Andorra, Liechtenstein, Monaco, San Marino, Vatican City. Andorra's nearby airport is in Spain.",
}


def load_catalog() -> dict[str, dict]:
    text = NAMES.read_text(encoding="utf-8")
    raw = text.split("RANKD_NAME_COUNTRIES = ", 1)[1]
    raw = raw.split("];", 1)[0] + "]"
    out = {}
    for row in json.loads(raw):
        out[row["iso3"]] = row
    out["VAT"] = {"iso3": "VAT", "name": "Vatican City", "emoji": "🇻🇦"}
    return out


def load_land() -> dict[str, tuple[float, str]]:
    """iso3 -> (km2, year). Uses a cached World Bank response when present.

    Without that cache, keep the land figures already in country_attributes.csv
    so --write does not blank them.
    """
    if not WB_LAND.exists():
        if not OUT.exists():
            return {}
        kept = {}
        for row in csv.DictReader(OUT.open(encoding="utf-8")):
            raw = (row.get("land_area_km2") or "").strip()
            if raw:
                kept[row["iso3"]] = (float(raw), row.get("land_area_year") or "")
        return kept
    payload = json.loads(WB_LAND.read_text(encoding="utf-8"))
    rows = payload[1] if isinstance(payload, list) else payload
    out = {}
    for row in rows:
        iso = (row.get("countryiso3code") or "").upper()
        if not iso or row.get("value") is None:
            continue
        out[iso] = (float(row["value"]), str(row.get("date") or ""))
    return out


def tri(iso: str, yes: set[str], partial: set[str], default: str = "no") -> str:
    if iso in partial:
        return "partial"
    if iso in yes:
        return "yes"
    return default


def build_rows() -> list[dict]:
    catalog = load_catalog()
    land = load_land()
    info = list(csv.DictReader(INFO.open(encoding="utf-8-sig")))
    rows = []
    for rec in info:
        iso = rec["iso3"].upper()
        if iso in TERRITORIES or iso.startswith("GB-"):
            continue
        name = (catalog.get(iso) or {}).get("name") or rec["country"]
        emoji = (catalog.get(iso) or {}).get("emoji") or ""
        pop = rec["population"].strip()
        area, area_year = land.get(iso, (None, ""))
        note_bits = []
        female = tri(iso, FEMALE_YES, FEMALE_PARTIAL)
        if iso == "USA":
            note_bits.append("US: an 85-minute acting presidency on 19 Nov 2021 is not counted.")
        if iso == "LUX":
            note_bits.append("Luxembourg: Grand Duchess Charlotte (1919-1964) and Marie-Adelaide (1912-1919) were heads of state in their own right.")
        if iso == "CHN":
            note_bits.append("China: Soong Ching-ling was acting co-chair of the state (1968-1972) and honorary president for 12 days, so partial.")
        if iso == "PHL":
            note_bits.append("Philippines: no general divorce law as of October 2026. Annulment exists. PD 1083 allows divorce for Muslim marriages.")
        if iso == "VAT":
            note_bits.append("Vatican City: no divorce. Raffaella Petrini has been president of the Governorate since 1 March 2025. Elective monarchy. No public commercial airport. Not in the World Bank population series used here.")
        if iso == "CUB":
            note_bits.append("Cuba: the only McDonald's is on the US naval base at Guantanamo Bay and is not open to Cuban citizens.")
        if iso == "AND":
            note_bits.append("Andorra: co-principality (partial monarchy). No airport on its own territory. McDonald's is open in Andorra la Vella.")
        rows.append({
            "iso3": iso,
            "country": name,
            "emoji": emoji,
            "population": pop,
            "population_year": rec["population_year"] or "2024",
            "land_area_km2": "" if area is None else f"{area:.2f}".rstrip("0").rstrip("."),
            "land_area_year": area_year,
            "landlocked": "yes" if rec["landlocked"] == "yes" else "no",
            "mediterranean_coast": "yes" if iso in MEDITERRANEAN else "no",
            "is_monarchy": tri(iso, MONARCHY_YES, MONARCHY_PARTIAL),
            "has_mcdonalds": tri(iso, MCDONALDS_YES, MCDONALDS_PARTIAL),
            "ever_female_leader": female,
            "divorce_legal": "no" if iso in DIVORCE_NO else "yes",
            "has_public_commercial_airport": "no" if iso in NO_AIRPORT else "yes",
            "continent": rec["continent"],
            "note": " ".join(note_bits),
            "source_population": SOURCES["population"],
            "source_land_area": SOURCES["land_area"],
            "source_landlocked": SOURCES["landlocked"],
            "source_mediterranean": SOURCES["mediterranean_coast"],
            "source_monarchy": SOURCES["is_monarchy"],
            "source_mcdonalds": SOURCES["has_mcdonalds"],
            "source_female_leader": SOURCES["ever_female_leader"],
            "source_divorce": SOURCES["divorce_legal"],
            "source_airport": SOURCES["has_public_commercial_airport"],
        })
    # Vatican City is sovereign and is not in country_info.csv.
    if not any(r["iso3"] == "VAT" for r in rows):
        rows.append({
            "iso3": "VAT",
            "country": "Vatican City",
            "emoji": "🇻🇦",
            "population": "",
            "population_year": "",
            "land_area_km2": "",
            "land_area_year": "",
            "landlocked": "yes",
            "mediterranean_coast": "no",
            "is_monarchy": "yes",
            "has_mcdonalds": "no",
            "ever_female_leader": "yes",
            "divorce_legal": "no",
            "has_public_commercial_airport": "no",
            "continent": "Europe",
            "note": "Vatican City: no divorce. Raffaella Petrini has been president of the Governorate since 1 March 2025. Elective monarchy. No public commercial airport. Not in the World Bank population series used here.",
            "source_population": SOURCES["population"],
            "source_land_area": SOURCES["land_area"],
            "source_landlocked": "Enclave with no sea coast. Standard landlocked-country lists include Vatican City.",
            "source_mediterranean": SOURCES["mediterranean_coast"],
            "source_monarchy": SOURCES["is_monarchy"],
            "source_mcdonalds": SOURCES["has_mcdonalds"],
            "source_female_leader": SOURCES["ever_female_leader"],
            "source_divorce": SOURCES["divorce_legal"],
            "source_airport": SOURCES["has_public_commercial_airport"],
        })
    rows.sort(key=lambda r: r["country"])
    both = [r["iso3"] for r in rows if r["landlocked"] == "yes" and r["mediterranean_coast"] == "yes"]
    if both:
        raise SystemExit(f"landlocked and Mediterranean: {both}")
    return rows


FIELDS = [
    "iso3", "country", "emoji", "population", "population_year", "land_area_km2", "land_area_year",
    "landlocked", "mediterranean_coast", "is_monarchy", "has_mcdonalds", "ever_female_leader",
    "divorce_legal", "has_public_commercial_airport", "continent", "note",
    "source_population", "source_land_area", "source_landlocked", "source_mediterranean",
    "source_monarchy", "source_mcdonalds", "source_female_leader", "source_divorce", "source_airport",
]


def write_csv(rows: list[dict]) -> None:
    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def read_rows() -> list[dict]:
    if not OUT.exists():
        raise SystemExit(f"missing {OUT.name}; run with --write")
    return list(csv.DictReader(OUT.open(encoding="utf-8")))


def number(row: dict, key: str):
    raw = (row.get(key) or "").replace(",", "").strip()
    if not raw:
        return None
    return float(raw)


def query(rows: list[dict], where: list[str], sort_key: str, limit: int, descending: bool) -> list[dict]:
    picked = []
    for row in rows:
        ok = True
        for clause in where:
            if "=" not in clause:
                raise SystemExit(f"bad filter {clause}")
            col, val = clause.split("=", 1)
            if (row.get(col) or "") != val:
                ok = False
                break
        if ok:
            picked.append(row)
    def sort_value(row):
        return number(row, sort_key)
    picked = [r for r in picked if sort_value(r) is not None]
    picked.sort(key=lambda r: sort_value(r), reverse=descending)
    return picked[:limit] if limit else picked


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="rebuild country_attributes.csv")
    parser.add_argument("--where", action="append", default=[], help="column=value, repeatable")
    parser.add_argument("--name-starts", default="", help="usual English name starts with this letter")
    parser.add_argument("--sort", default="population", help="numeric column to sort")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--asc", action="store_true", help="smallest first")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    if args.write:
        rows = build_rows()
        write_csv(rows)
        print(f"wrote {OUT.name} ({len(rows)} countries)", file=sys.stderr)
    else:
        rows = read_rows()
    if args.name_starts:
        prefix = args.name_starts.lower()
        rows = [r for r in rows if r["country"].lower().startswith(prefix)]
    if not args.where and not args.json and not args.name_starts and not args.limit:
        parser.print_help()
        return 0
    found = query(rows, args.where, args.sort, args.limit, descending=not args.asc)
    if args.json:
        json.dump([{
            "iso3": r["iso3"], "country": r["country"], "emoji": r["emoji"],
            "value": number(r, args.sort), "year": r.get(f"{args.sort}_year") or r.get("population_year") or "",
        } for r in found], sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    for i, r in enumerate(found, 1):
        print(f"{i:2} {r['iso3']} {r['country']} {number(r, args.sort)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
