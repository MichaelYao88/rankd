#!/usr/bin/env python3
"""Insert the country-attribute dailies after the existing queue.

Ranks go into puzzles-data.js and puzzles.csv at daily orders 193+.
Name it puzzles are appended to name-puzzles.js and take the next free
orders after those ranks. Does not rewrite puzzles that are already there.
"""
from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import country_attributes as ca  # noqa: E402
from community_snapshot import add_seed_first_guess  # noqa: E402

ATTR = ROOT / "country_attributes.csv"
PUZZLES_JS = ROOT / "puzzles-data.js"
PUZZLES_CSV = ROOT / "puzzles.csv"
NAME_JS = ROOT / "name-puzzles.js"
NAME_CSV = ROOT / "name_puzzles.csv"
STATS = ROOT / "community-stats.json"
SEED_JS = ROOT / "community-seed.js"

WB_LAND = "https://data.worldbank.org/indicator/AG.LND.TOTL.K2"
WB_POP = "https://data.worldbank.org/indicator/SP.POP.TOTL"
MCD_URL = "https://en.wikipedia.org/wiki/List_of_countries_with_McDonald%27s_restaurants"
FEMALE_URL = "https://en.wikipedia.org/wiki/List_of_elected_and_appointed_female_heads_of_state_and_government"
HENLEY_URL = "https://cdn.henleyglobal.com/storage/app/media/HPI/Henley%20Passport%20Index%202026%20April%20Global%20Ranking.pdf"
PEW_URL = "https://www.pewresearch.org/religion/2025/06/09/muslim-population-change/"
OWID_MUSLIM = "https://ourworldindata.org/grapher/religious-composition"
USGS_URL = "https://www.usgs.gov/programs/earthquake-hazards/science/20-largest-earthquakes-world-1900"
CIA_ELEV = "https://www.cia.gov/the-world-factbook/field/elevation/"
UN_URL = "https://www.un.org/en/about-us/growth-in-un-membership"
DIVORCE_URL = "https://www.officialgazette.gov.ph/1987/07/06/executive-order-no-209-s-1987/"
TREE_URL = "https://www.etymonline.com/word/Brazil"


def rows() -> list[dict]:
    return list(csv.DictReader(ATTR.open(encoding="utf-8")))


def num(value: str):
    f = float(value)
    if abs(f - round(f)) < 1e-6:
        return int(round(f))
    return round(f, 2)


def commas(value) -> str:
    if isinstance(value, float) and not value.is_integer():
        return f"{value:,.2f}"
    return f"{int(value):,}"


def ranked(where: list[str], sort: str, limit: int, asc: bool = False) -> tuple[list[dict], int]:
    found = ca.query(rows(), where, sort, 0, descending=not asc)
    return found[:limit], len(found)


def pack(found: list[dict], total: int, sort: str, year_field: str, scope: str, year_override: str = "") -> list[dict]:
    items = []
    for i, row in enumerate(found, 1):
        year = year_override or row.get(year_field) or row.get("population_year") or ""
        items.append({
            "name": row["country"],
            "emoji": row["emoji"],
            "value": num(row[sort]),
            "year": year,
            "gRank": i,
            "gTotal": total,
            "gScope": scope,
        })
    return items


def rank_puzzle(pid, order, emoji, headline, question, stat, unit, source, url, fact, items, year, higher="top", dataset="") -> dict:
    return {
        "type": "rank",
        "id": pid,
        "order": order,
        "emoji": emoji,
        "question": question,
        "stat": stat,
        "unit": unit,
        "higherIs": higher,
        "valuesVisible": False,
        "source": source,
        "sourceUrl": url,
        "fact": fact,
        "art": "globe",
        "support": "",
        "dataset": dataset or pid,
        "headline": headline,
        "year": year,
        "items": items,
    }


def manual_items(specs, scope, total) -> list[dict]:
    items = []
    for i, spec in enumerate(specs, 1):
        item = {
            "name": spec["name"],
            "emoji": spec["emoji"],
            "value": spec["value"],
            "year": spec.get("year", ""),
        }
        if total:
            item.update({"gRank": i, "gTotal": total, "gScope": scope})
        items.append(item)
    return items


def build_ranks() -> list[dict]:
    data = rows()
    by = {r["iso3"]: r for r in data}
    mcd, mcd_n = ranked(["has_mcdonalds=no"], "population", 6)
    woman, woman_n = ranked(["ever_female_leader=no"], "population", 6)
    mon, mon_n = ranked(["is_monarchy=yes"], "population", 6)
    med, med_n = ranked(["mediterranean_coast=yes"], "land_area_km2", 6)
    land = [r for r in data if r["land_area_km2"]]
    land.sort(key=lambda r: -float(r["land_area_km2"]))
    land6, land_n = land[:6], len(land)
    africa, africa_n = ranked(["continent=Africa"], "population", 6)
    ks = [r for r in data if r["country"].startswith("K") and r["population"]]
    ks.sort(key=lambda r: -float(r["population"]))
    asia = [r for r in data if r["continent"] == "Asia" and r["population"]]
    asia.sort(key=lambda r: float(r["population"]))
    asia6 = asia[:6]

    def P(group):
        return [commas(num(r["population"])) for r in group]

    mcd_p = P(mcd)
    puzzles = []
    puzzles.append(rank_puzzle(
        "no-mcdonalds", 193, "🍔", "No Golden Arches",
        "Most populous countries with no McDonald's open",
        "Population where McDonald's has no open restaurant",
        "people",
        "World Bank population, 2024; McDonald's country list from Wikipedia",
        MCD_URL,
        f"Nigeria ({mcd_p[0]}) is the most populous country with no McDonald's open, ahead of Bangladesh ({mcd_p[1]}). "
        f"Russia is third ({mcd_p[2]}): it had 850 restaurants until the company left on 16 May 2022, and the old sites trade as Vkusno i tochka, so it counts as no. "
        f"Ethiopia, the Democratic Republic of Congo and Iran fill out the six.",
        pack(mcd, mcd_n, "population", "population_year", "countries with no McDonald's"),
        "2024", dataset="attr-no-mcdonalds",
    ))
    wpop = P(woman)
    puzzles.append(rank_puzzle(
        "never-woman-leader", 194, "👩", "Never Her Turn",
        "Most populous countries that have never had a woman as head of state or government",
        "Population of countries with no woman head of state or government",
        "people",
        "World Bank population, 2024; Wikipedia list of female heads of state and government",
        FEMALE_URL,
        f"The United States ({wpop[0]}) has never had a woman president. An 85-minute acting spell on 19 November 2021 is not counted. "
        f"China is more populous than every country here and is left off: Soong Ching-ling was acting co-chair of the state from 1968 to 1972, so China is partial, not a clean no. "
        f"Nigeria, Russia, Egypt, Iran and Kenya have no woman in either office. Japan, Mexico and the DR Congo do.",
        pack(woman, woman_n, "population", "population_year", "countries with no woman leader"),
        "2024", dataset="attr-never-woman-leader",
    ))
    mpop = P(mon)
    puzzles.append(rank_puzzle(
        "monarchy-population", 195, "👑", "Still Crowned",
        "Most populous countries that are still monarchies",
        "Population of current monarchies",
        "people",
        "World Bank population, 2024; current monarchies as of 2026",
        WB_POP,
        f"Japan ({mpop[0]}) is the most populous monarchy. Thailand ({mpop[1]}) has more people than the United Kingdom ({mpop[2]}). "
        f"Canada is fifth because King Charles III is its head of state, ahead of Morocco. Saudi Arabia is eighth and does not make this six.",
        pack(mon, mon_n, "population", "population_year", "current monarchies"),
        "2024", dataset="attr-monarchy-population",
    ))
    puzzles.append(rank_puzzle(
        "mediterranean-land", 196, "🌊", "Inland Sea",
        "Largest Mediterranean countries by land area",
        "Land area of countries with a Mediterranean coast",
        "km²",
        "World Bank land area (AG.LND.TOTL.K2), 2024",
        WB_LAND,
        "Algeria has a Mediterranean coast and 2,381,740 km² of land, more than Libya, Egypt, Turkey, France or Spain. "
        "Most of that land is Sahara, which is why the largest Mediterranean country is not a European one. "
        "France's figure is metropolitan land area in this World Bank series, not the overseas departments.",
        pack(med, med_n, "land_area_km2", "land_area_year", "countries with a Mediterranean coast"),
        "2024", dataset="attr-mediterranean-land",
    ))
    puzzles.append(rank_puzzle(
        "land-area", 197, "🗺️", "Lakes Don't Count",
        "Largest countries by land area",
        "Land area, inland water excluded",
        "km²",
        "World Bank land area (AG.LND.TOTL.K2), 2024",
        WB_LAND,
        "Russia is first, at 16,376,870 km² of land. China (9,388,210) is second and the United States (9,147,420) is third. "
        "Canada is fourth, not second: the usual 'second largest' ranking counts lakes and other inland water, and this series leaves that water out. "
        "Brazil and Australia are fifth and sixth.",
        pack(land6, land_n, "land_area_km2", "land_area_year", "sovereign countries with a land-area figure"),
        "2024", dataset="attr-land-area",
    ))
    ap = P(africa)
    puzzles.append(rank_puzzle(
        "africa-population", 198, "🌍", "Africa by Headcount",
        "Largest African countries by population",
        "Population",
        "people",
        "World Bank SP.POP.TOTL, 2024",
        WB_POP,
        f"Nigeria ({ap[0]}) is first. Ethiopia ({ap[1]}) is second, ahead of Egypt ({ap[2]}). "
        f"The Democratic Republic of Congo ({ap[3]}) is fourth, ahead of Tanzania and South Africa.",
        pack(africa, africa_n, "population", "population_year", "African countries in this table"),
        "2024", dataset="attr-africa-population",
    ))
    puzzles.append(rank_puzzle(
        "k-population", 199, "🔤", "The K Club",
        "Countries whose usual English name starts with K, by population",
        "Population",
        "people",
        "World Bank SP.POP.TOTL, 2024. Names are the usual English names on ranki.gg.",
        WB_POP,
        "Kenya (56,432,944) has more people than Kazakhstan (20,592,571). "
        "South Korea and North Korea are not here: their usual English names start with S and N. "
        "Kosovo is included; its usual English name starts with K.",
        pack(ks, len(ks), "population", "population_year", "countries whose usual English name starts with K"),
        "2024", dataset="attr-k-population",
    ))
    puzzles.append(rank_puzzle(
        "newest-countries", 200, "🆕", "Just Independent",
        "Newest UN member states, by year of independence",
        "Year the current state became independent",
        "year",
        "United Nations membership growth, matched to each independence date",
        UN_URL,
        "South Sudan became independent on 9 July 2011 and joined the UN on 14 July 2011. It is the newest UN member state. "
        "Kosovo declared independence in 2008 and is left out because it is not a UN member. "
        "Czechia and Slovakia both date to 1 January 1993, the same year as Eritrea (24 May 1993), so Namibia (1990) is the sixth card instead of a tie.",
        manual_items([
            {"name": "South Sudan", "emoji": by["SSD"]["emoji"], "value": 2011, "year": "9 Jul 2011"},
            {"name": "Montenegro", "emoji": by["MNE"]["emoji"], "value": 2006, "year": "3 Jun 2006"},
            {"name": "East Timor", "emoji": by["TLS"]["emoji"], "value": 2002, "year": "20 May 2002"},
            {"name": "Palau", "emoji": by["PLW"]["emoji"], "value": 1994, "year": "1 Oct 1994"},
            {"name": "Eritrea", "emoji": by["ERI"]["emoji"], "value": 1993, "year": "24 May 1993"},
            {"name": "Namibia", "emoji": by["NAM"]["emoji"], "value": 1990, "year": "21 Mar 1990"},
        ], "UN member states in this six", 6),
        "independence year", dataset="newest-un-members",
    ))
    puzzles.append(rank_puzzle(
        "smallest-asia", 201, "🐜", "Smallest Crowd",
        "Smallest Asian countries by population",
        "Population",
        "people",
        "World Bank SP.POP.TOTL, 2024. Asia follows the continent field in country_info.csv.",
        WB_POP,
        "Brunei (462,721) is the least populous sovereign country in Asia on these figures, ahead of the Maldives (527,799). "
        "People reach for the Maldives first. Macao is smaller and is not a sovereign country, so it is not in the table.",
        pack(asia6, len(asia), "population", "population_year", "Asian sovereign countries in this table"),
        "2024", higher="bottom", dataset="attr-smallest-asia",
    ))
    # Northernmost mainland point, decimal degrees. Gaps are wide enough that
    # a tenth of a degree does not change the order. Tunisia is Ras Ben Sakka.
    puzzles.append(rank_puzzle(
        "northernmost-africa", 202, "🧭", "Top of Africa",
        "Northernmost African countries, by their northernmost mainland point",
        "Latitude of the northernmost mainland point",
        "°N",
        "Northernmost mainland point. Tunisia is Ras Ben Sakka (about 37°20′N). Spanish plazas in North Africa are not Morocco.",
        "https://en.wikipedia.org/wiki/Extreme_points_of_Earth",
        "Tunisia's Ras Ben Sakka is the northernmost point of mainland Africa, just ahead of Algeria. Morocco is only third. "
        "Libya, Egypt and Mauritania follow, and the gaps are wide enough that a tenth of a degree does not change the order.",
        manual_items([
            {"name": "Tunisia", "emoji": by["TUN"]["emoji"], "value": 37.33, "year": "Ras Ben Sakka"},
            {"name": "Algeria", "emoji": by["DZA"]["emoji"], "value": 37.09, "year": "northern coast"},
            {"name": "Morocco", "emoji": by["MAR"]["emoji"], "value": 35.79, "year": "Cape Spartel"},
            {"name": "Libya", "emoji": by["LBY"]["emoji"], "value": 33.17, "year": "northern coast"},
            {"name": "Egypt", "emoji": by["EGY"]["emoji"], "value": 31.67, "year": "northern coast"},
            {"name": "Mauritania", "emoji": by["MRT"]["emoji"], "value": 27.30, "year": "northern border"},
        ], "African mainland extremes in this six", 6),
        "northernmost point", dataset="northernmost-africa",
    ))
    # Pew 2020 counts via Our World in Data's republication of the unrounded series.
    muslim = [
        ("IDN", 238990485), ("PAK", 226880801), ("IND", 213057854),
        ("BGD", 151443154), ("NGA", 119980188), ("EGY", 104038012),
    ]
    puzzles.append(rank_puzzle(
        "muslim-population", 203, "🕌", "Most Muslims",
        "Countries with the most Muslims",
        "Muslim population",
        "Muslims",
        "Pew Research Center religious composition, 2020, unrounded counts via Our World in Data",
        PEW_URL,
        "Indonesia has the most Muslims, about 239.0 million in 2020. India is third (213.1 million) even though Muslims were 15.2% of India's population. "
        "Egypt, the largest Arab country, is sixth (104.0 million), behind Nigeria (120.0 million). This is a count of people, not a per-capita share.",
        manual_items([
            {"name": by[iso]["country"], "emoji": by[iso]["emoji"], "value": value, "year": "2020"}
            for iso, value in muslim
        ], "Pew 2020 countries", 201),
        "2020", dataset="pew-muslim-population-2020",
    ))
    puzzles.append(rank_puzzle(
        "passport-henley", 204, "🛂", "Open Doors",
        "Passport strength on the Henley index, 13 April 2026",
        "Destinations with no visa in advance",
        "destinations",
        "Henley Passport Index, 13 April 2026 (IATA Timatic)",
        HENLEY_URL,
        "On 13 April 2026, Singapore could enter 192 destinations with no visa in advance. "
        "Japan, South Korea and the UAE were tied at 187, so they are not on this six. "
        "Sweden is next among untied scores at 186. The United States was tied with Iceland at 179, and China was at 82.",
        manual_items([
            {"name": "Singapore", "emoji": by["SGP"]["emoji"], "value": 192, "year": "2026-04-13", "gRank": 1},
            {"name": "Sweden", "emoji": by["SWE"]["emoji"], "value": 186, "year": "2026-04-13", "gRank": 3},
            {"name": "United Kingdom", "emoji": by["GBR"]["emoji"], "value": 183, "year": "2026-04-13", "gRank": 6},
            {"name": "United States", "emoji": by["USA"]["emoji"], "value": 179, "year": "2026-04-13", "gRank": 10},
            {"name": "Mexico", "emoji": by["MEX"]["emoji"], "value": 156, "year": "2026-04-13", "gRank": 20},
            {"name": "China", "emoji": by["CHN"]["emoji"], "value": 82, "year": "2026-04-13", "gRank": 55},
        ], "Henley passports", 199),
        "2026-04-13", dataset="henley-passport-2026-04-13",
    ))
    # Fix passport gRanks: manual_items overwrites with 1..6 if total is set.
    # Rebuild passport items with the real Henley ranks.
    puzzles[-1]["items"] = []
    for name, iso, value, rank in [
        ("Singapore", "SGP", 192, 1),
        ("Sweden", "SWE", 186, 3),
        ("United Kingdom", "GBR", 183, 6),
        ("United States", "USA", 179, 10),
        ("Mexico", "MEX", 156, 20),
        ("China", "CHN", 82, 55),
    ]:
        puzzles[-1]["items"].append({
            "name": name, "emoji": by[iso]["emoji"], "value": value, "year": "2026-04-13",
            "gRank": rank, "gTotal": 199, "gScope": "Henley passports",
        })
    puzzles.append(rank_puzzle(
        "largest-earthquakes", 205, "🌋", "The Big Ones",
        "Largest recorded earthquake in each country",
        "Largest instrumentally recorded earthquake",
        "magnitude",
        "USGS largest earthquakes since 1900, with the 2025 Kamchatka update",
        USGS_URL,
        "Chile's 1960 Valdivia earthquake, magnitude 9.5, is still the largest ever recorded. "
        "The United States is second because of the 1964 Alaska quake (9.2), not a quake in the lower 48. "
        "Japan's 2011 Tōhoku quake was also magnitude 9.1, tied with Indonesia's 2004 quake, so Japan is left off rather than split by a tie-break. "
        "The 1950 magnitude 8.6 is the India-China border quake that USGS lists under India.",
        [
            {"name": "Chile", "emoji": by["CHL"]["emoji"], "value": 9.5, "year": "1960"},
            {"name": "United States", "emoji": by["USA"]["emoji"], "value": 9.2, "year": "1964"},
            {"name": "Indonesia", "emoji": by["IDN"]["emoji"], "value": 9.1, "year": "2004"},
            {"name": "Russia", "emoji": by["RUS"]["emoji"], "value": 9.0, "year": "1952"},
            {"name": "Ecuador", "emoji": by["ECU"]["emoji"], "value": 8.8, "year": "1906"},
            {"name": "India", "emoji": by["IND"]["emoji"], "value": 8.6, "year": "1950"},
        ],
        "1906–2025", dataset="usgs-largest-earthquakes",
    ))
    puzzles.append(rank_puzzle(
        "mean-elevation", 206, "⛰️", "High Ground",
        "Highest countries by mean elevation",
        "Mean elevation",
        "m",
        "CIA World Factbook mean elevation, 2026 compilation",
        CIA_ELEV,
        "Tajikistan's mean elevation is 3,186 m, ahead of Kyrgyzstan (2,988 m) and Nepal (2,565 m). "
        "Bhutan, often called the highest country, is fourth at 2,220 m on this CIA figure. "
        "The Maldives, Tuvalu, Kiribati and the Marshall Islands tie at 2 m, so there is no single lowest country.",
        manual_items([
            {"name": "Tajikistan", "emoji": by["TJK"]["emoji"], "value": 3186, "year": "2026"},
            {"name": "Kyrgyzstan", "emoji": by["KGZ"]["emoji"], "value": 2988, "year": "2026"},
            {"name": "Nepal", "emoji": by["NPL"]["emoji"], "value": 2565, "year": "2026"},
            {"name": "Bhutan", "emoji": by["BTN"]["emoji"], "value": 2220, "year": "2026"},
            {"name": "Lesotho", "emoji": by["LSO"]["emoji"], "value": 2161, "year": "2026"},
        ], "CIA mean-elevation list, Antarctica excluded", 5),
        "2026", dataset="cia-mean-elevation",
    ))
    puzzles.append(rank_puzzle(
        "southern-capitals", 207, "🐧", "Far South",
        "Southernmost capitals of sovereign countries",
        "Latitude of the capital",
        "° latitude",
        "Standard geographic latitude of the capital city, rounded to 0.01°. South is negative.",
        "https://en.wikipedia.org/wiki/List_of_national_capitals",
        "Wellington is the southernmost capital of a sovereign country. Canberra is south of Montevideo and Buenos Aires. "
        "Cape Town is not South Africa's executive capital; Pretoria is much farther north, so Lesotho's Maseru makes this six.",
        manual_items([
            {"name": "New Zealand", "emoji": by["NZL"]["emoji"], "value": -41.29, "year": "Wellington"},
            {"name": "Australia", "emoji": by["AUS"]["emoji"], "value": -35.28, "year": "Canberra"},
            {"name": "Uruguay", "emoji": by["URY"]["emoji"], "value": -34.90, "year": "Montevideo"},
            {"name": "Argentina", "emoji": by["ARG"]["emoji"], "value": -34.60, "year": "Buenos Aires"},
            {"name": "Chile", "emoji": by["CHL"]["emoji"], "value": -33.45, "year": "Santiago"},
            {"name": "Lesotho", "emoji": by["LSO"]["emoji"], "value": -29.31, "year": "Maseru"},
        ], "", 0),
        "capital latitude", higher="bottom", dataset="southern-capitals",
    ))
    puzzles.append(rank_puzzle(
        "northern-capitals", 208, "❄️", "Far North",
        "Northernmost capitals of sovereign countries",
        "Latitude of the capital",
        "° latitude",
        "Standard geographic latitude of the capital city, rounded to 0.01°.",
        "https://en.wikipedia.org/wiki/List_of_national_capitals",
        "Reykjavik is the northernmost capital of a sovereign country. Helsinki is north of Oslo. "
        "Nuuk is farther north and is the capital of Greenland, not of a sovereign country, so it is not here.",
        manual_items([
            {"name": "Iceland", "emoji": by["ISL"]["emoji"], "value": 64.15, "year": "Reykjavik"},
            {"name": "Finland", "emoji": by["FIN"]["emoji"], "value": 60.17, "year": "Helsinki"},
            {"name": "Norway", "emoji": by["NOR"]["emoji"], "value": 59.91, "year": "Oslo"},
            {"name": "Estonia", "emoji": by["EST"]["emoji"], "value": 59.44, "year": "Tallinn"},
            {"name": "Sweden", "emoji": by["SWE"]["emoji"], "value": 59.33, "year": "Stockholm"},
            {"name": "Latvia", "emoji": by["LVA"]["emoji"], "value": 56.95, "year": "Riga"},
        ], "", 0),
        "capital latitude", dataset="northern-capitals",
    ))
    return puzzles


def catalog() -> list[dict]:
    text = NAME_JS.read_text(encoding="utf-8")
    raw = text.split("RANKD_NAME_COUNTRIES = ", 1)[1].split("];", 1)[0] + "]"
    return json.loads(raw)


def build_names(catalog_rows: list[dict]) -> list[dict]:
    isos = [c["iso3"] for c in catalog_rows]
    if "VAT" not in isos:
        isos.append("VAT")
    divorce_values = {iso: (1 if iso in {"PHL", "VAT"} else 0) for iso in isos}
    tree_values = {iso: (1 if iso in {"BRA", "BRB"} else 0) for iso in isos}
    by = {c["iso3"]: c for c in catalog_rows}
    by["VAT"] = {"iso3": "VAT", "name": "Vatican City", "emoji": "🇻🇦"}

    def countries_for(answers, values):
        return [{"iso3": iso, "name": by[iso]["name"], "emoji": by[iso]["emoji"], "value": values[iso]} for iso in answers]

    divorce = {
        "type": "name", "id": "name-no-divorce", "emoji": "💍", "headline": "Still Married",
        "question": "Name a country starting with P or V that has no general divorce law.",
        "stat": "General divorce law", "unit": "", "year": "2026",
        "source": "Family Code of the Philippines; Vatican City has no divorce procedure. Status checked October 2026.",
        "sourceUrl": DIVORCE_URL,
        "fact": "The Philippines and Vatican City are the two sovereign states with no general divorce law. "
                "A divorce bill passed the Philippine House in 2024 and died when that Congress ended; as of October 2026 it was still not law. "
                "Annulment exists, and Presidential Decree 1083 allows divorce for Muslim marriages, but that is not a general divorce law.",
        "art": "heart", "threshold": 0, "thresholdLabel": "No general divorce law",
        "letter": {"any": [{"op": "starts", "text": "P"}, {"op": "starts", "text": "V"}]},
        "letterFail": "doesn't start with P or V",
        "statRule": {
            "op": "gt", "format": "label", "noun": "",
            "labels": {"1": "no general divorce law", "0": "divorce is available"},
            "below": "", "above": "", "missing": "no divorce figure in this set",
        },
        "values": divorce_values,
        "answers": ["PHL", "VAT"],
        "countries": countries_for(["PHL", "VAT"], divorce_values),
        "seedPick": "Vatican City", "maxTries": 5,
    }
    tree = {
        "type": "name", "id": "name-tree-country", "emoji": "🌳", "headline": "Wooden Names",
        "question": "Name a country starting with B that is named after a tree.",
        "stat": "Country name comes from a tree", "unit": "", "year": "",
        "source": "Etymology of Brazil (brazilwood) and Barbados (bearded fig)",
        "sourceUrl": TREE_URL,
        "fact": "Brazil is named for brazilwood, the tree. Barbados is named for the bearded fig, from Portuguese os barbados, 'the bearded ones.' "
                "The claim that Brazil is the only country named after a tree drops Barbados. Cyprus is the disputed case, linked either to the cypress or to copper, and it does not start with B.",
        "art": "tree", "threshold": 0, "thresholdLabel": "Named after a tree",
        "letter": {"op": "starts", "text": "B"},
        "letterFail": "doesn't start with B",
        "statRule": {
            "op": "gt", "format": "label", "noun": "",
            "labels": {"1": "named after a tree", "0": "not named after a tree"},
            "below": "", "above": "", "missing": "not in this set",
        },
        "values": tree_values,
        "answers": ["BRA", "BRB"],
        "countries": countries_for(["BRA", "BRB"], tree_values),
        "seedPick": "Barbados", "maxTries": 5,
    }
    return [divorce, tree]


def splice_js_array(path: Path, marker: str, objects: list[dict]) -> None:
    text = path.read_text(encoding="utf-8")
    idx = text.index(marker)
    end = text.index("];", idx)
    blob = json.dumps(objects, ensure_ascii=False, separators=(",", ":"))[1:-1]
    if text[end - 1] != "[":
        blob = "," + blob
    path.write_text(text[:end] + blob + text[end:], encoding="utf-8")


def append_rank_csv(puzzles: list[dict]) -> None:
    fields = list(csv.DictReader(PUZZLES_CSV.open(encoding="utf-8-sig")).fieldnames)
    with PUZZLES_CSV.open("a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
        for p in puzzles:
            for n, it in enumerate(p["items"]):
                writer.writerow({
                    "puzzle_id": p["id"],
                    "daily_order": p["order"] if n == 0 else "",
                    "puzzle_emoji": p["emoji"] if n == 0 else "",
                    "question": p["question"] if n == 0 else "",
                    "stat_label": p["stat"] if n == 0 else "",
                    "unit": p["unit"] if n == 0 else "",
                    "higher_is": p["higherIs"] if n == 0 else "",
                    "values_visible": "no" if n == 0 else "",
                    "item_name": it["name"],
                    "item_emoji": it["emoji"],
                    "value": it["value"],
                    "data_year": it.get("year", ""),
                    "source_name": p["source"] if n == 0 else "",
                    "source_url": p["sourceUrl"] if n == 0 else "",
                    "fun_fact": p["fact"] if n == 0 else "",
                    "global_rank": it.get("gRank", ""),
                    "global_total": it.get("gTotal", ""),
                    "global_scope": it.get("gScope", ""),
                    "art": p["art"] if n == 0 else "",
                    "support_url": "",
                    "dataset": p["dataset"] if n == 0 else "",
                    "series_title": "",
                    "headline": p["headline"] if n == 0 else "",
                })


def append_name_csv(puzzles: list[dict]) -> None:
    fields = list(csv.DictReader(NAME_CSV.open(encoding="utf-8-sig")).fieldnames)
    with NAME_CSV.open("a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, lineterminator="\n")
        for p in puzzles:
            for c in p["countries"]:
                writer.writerow({
                    "puzzle_id": p["id"],
                    "headline": p["headline"],
                    "rule": p["question"],
                    "threshold": p["threshold"],
                    "threshold_label": p["thresholdLabel"],
                    "year": p["year"],
                    "source": p["source"],
                    "source_url": p["sourceUrl"],
                    "seed_pick": p["seedPick"],
                    "iso3": c["iso3"],
                    "country": c["name"],
                    "value": c["value"],
                    "display": p["statRule"]["labels"][str(c["value"])],
                })


def ensure_vatican() -> None:
    text = NAME_JS.read_text(encoding="utf-8")
    if '"iso3":"VAT"' in text or '"iso3": "VAT"' in text:
        return
    marker = "RANKD_NAME_COUNTRIES = "
    idx = text.index(marker)
    end = text.index("];", idx)
    blob = '{"iso3":"VAT","name":"Vatican City","emoji":"🇻🇦"}'
    NAME_JS.write_text(text[:end] + "," + blob + text[end:], encoding="utf-8")


def seed_stats(ranks: list[dict], names: list[dict]) -> None:
    """Add seed rows for the new ids only. Do not remerge the existing crowd."""
    doc = json.loads(STATS.read_text(encoding="utf-8"))
    puzzles = doc["puzzles"]
    fresh = []
    for p in ranks + names:
        if p["id"] not in puzzles:
            fresh.append(p)
    if not fresh:
        return
    spec = []
    for p in fresh:
        kind = p["type"]
        width = 1 if kind == "name" else len(p["items"])
        spec.append({"id": p["id"], "type": kind, "players": 180, "width": width})
    proc = subprocess.run(
        ["node", "-e", """
          const seed = require("./community-seed.js");
          const spec = JSON.parse(process.argv[1]);
          const out = {};
          for (const row of spec) {
            out[row.id] = {
              standing: seed.standingBlock(row.id, row.players, row.type, row.width),
              countryBoard: seed.countryBoard(row.id, row.type),
            };
          }
          process.stdout.write(JSON.stringify(out));
        """, json.dumps(spec)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(proc.stderr.strip() or "standing seed failed")
    seeded = json.loads(proc.stdout)
    rank_stub = {"puzzles": {}}
    rank_puzzles = {}
    for p in fresh:
        block = seeded[p["id"]]
        standing = block["standing"]
        first = sum(standing["byTries"].get("1") or [])
        row = {
            "type": p["type"],
            "seeded": True,
            "players": standing["n"],
            "pctPerfect": int(round(100 * first / standing["n"])) if standing["n"] else 0,
            "countryBoard": block["countryBoard"],
            "standing": standing,
        }
        if p["type"] == "rank":
            per = {}
            for i, it in enumerate(p["items"]):
                per[it["name"]] = 24 + ((i * 7) % 23)
            per[p["items"][min(1, len(p["items"]) - 1)]["name"]] = max(per.values()) + 6
            row["perItemCorrect"] = per
            rank_stub["puzzles"][p["id"]] = row
            rank_puzzles[p["id"]] = p
        else:
            emoji = next(c["emoji"] for c in p["countries"] if c["name"] == p["seedPick"])
            bar = {"name": p["seedPick"], "pct": 100, "emoji": emoji}
            row["firstGuessWorld"] = {"players": 1, "bars": [bar]}
            row["firstGuessByCountry"] = {code: {"players": 1, "bars": [dict(bar)]} for code in ("US", "TW", "SG")}
            puzzles[p["id"]] = row
    if rank_stub["puzzles"]:
        add_seed_first_guess(rank_stub, rank_puzzles)
        for pid, row in rank_stub["puzzles"].items():
            row.pop("rowCount", None)
            puzzles[pid] = row
    STATS.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> int:
    text = PUZZLES_JS.read_text(encoding="utf-8")
    ranks = build_ranks()
    ranks = [p for p in ranks if f'"id":"{p["id"]}"' not in text]
    ensure_vatican()
    names = build_names(catalog())
    name_text = NAME_JS.read_text(encoding="utf-8")
    names = [p for p in names if f'"id":"{p["id"]}"' not in name_text]
    if ranks:
        splice_js_array(PUZZLES_JS, "RANKD_PUZZLES = ", ranks)
        append_rank_csv(ranks)
    if names:
        splice_js_array(NAME_JS, "RANKD_NAME_PUZZLES = ", names)
        append_name_csv(names)
    if ranks or names:
        seed_stats(ranks, names)
    print(f"ranks {len(ranks)} names {len(names)}")
    for p in ranks:
        print(p["order"], p["id"], p["headline"], [it["name"] for it in p["items"]])
    for p in names:
        print("name", p["id"], p["answers"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
