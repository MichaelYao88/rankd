#!/usr/bin/env python3
"""Build full cited series for the short practice datasets.

Reads the downloaded source files in /tmp/backfill and writes
/tmp/backfill/series.json. Existing board values are checked and kept.
Nothing is interpolated.
"""
import csv
import json
import re
import subprocess
from decimal import Decimal, ROUND_HALF_UP
from html.parser import HTMLParser
from pathlib import Path

import duckdb

ROOT = Path("/agent/repos/rankd")
BACK = Path("/tmp/backfill")


def game_names():
    raw = subprocess.check_output(
        ["node", "-e", """
const fs=require('fs'); const vm=require('vm');
const box={window:{}};
vm.runInNewContext(fs.readFileSync('practice-data.js','utf8'), box);
const c=box.window.RANKD_PRACTICE.countries;
const o={};
for (const iso of Object.keys(c)) o[c[iso][0]]=iso;
process.stdout.write(JSON.stringify(o));
"""],
        cwd=ROOT,
    )
    return json.loads(raw)


NAMES = game_names()
ALIASES = {
    "United States of America": "United States",
    "United States": "United States",
    "USA": "United States",
    "UK": "United Kingdom",
    "Great Britain": "United Kingdom",
    "Russia": "Russia",
    "Russian Federation": "Russia",
    "Czech Republic": "Czechia",
    "Czechia": "Czechia",
    "Turkey": "Turkey",
    "Türkiye": "Turkey",
    "Turkiye": "Turkey",
    "South Korea": "South Korea",
    "Republic of Korea": "South Korea",
    "Korea, South": "South Korea",
    "North Korea": "North Korea",
    "Korea, North": "North Korea",
    "Cote d'Ivoire": "Cote d'Ivoire",
    "Côte d'Ivoire": "Cote d'Ivoire",
    "Ivory Coast": "Cote d'Ivoire",
    "Democratic Republic of the Congo": "Democratic Republic of Congo",
    "Democratic Republic of Congo": "Democratic Republic of Congo",
    "Congo (Dem. Rep.)": "Democratic Republic of Congo",
    "DRC": "Democratic Republic of Congo",
    "Congo (Rep.)": "Congo",
    "Republic of the Congo": "Congo",
    "Congo": "Congo",
    "Cape Verde": "Cape Verde",
    "Cabo Verde": "Cape Verde",
    "Cape Verde Islands": "Cape Verde",
    "East Timor": "East Timor",
    "Timor-Leste": "East Timor",
    "The Gambia": "Gambia",
    "Gambia": "Gambia",
    "The Bahamas": "Bahamas",
    "Bahamas": "Bahamas",
    "eSwatini": "Eswatini",
    "Eswatini": "Eswatini",
    "Swaziland": "Eswatini",
    "Myanmar": "Myanmar",
    "Burma": "Myanmar",
    "Palestine": "Palestine",
    "Palestinian Territory": "Palestine",
    "State of Palestine": "Palestine",
    "Taiwan": "Taiwan",
    "Taiwan (Chinese Taipei)": "Taiwan",
    "Chinese Taipei": "Taiwan",
    "Hong Kong": "Hong Kong",
    "Hong Kong (SAR China)": "Hong Kong",
    "Macao": "Macao",
    "Macao (SAR China)": "Macao",
    "Macau": "Macao",
    "Vatican": "Vatican City",
    "Vatican City": "Vatican City",
    "Holy See": "Vatican City",
    "North Macedonia": "North Macedonia",
    "Macedonia": "North Macedonia",
    "Micronesia": "Micronesia (country)",
    "Federated States of Micronesia": "Micronesia (country)",
    "United Arab Emirates": "United Arab Emirates",
    "UAE": "United Arab Emirates",
    "St. Kitts and Nevis": "Saint Kitts and Nevis",
    "St. Vincent and the Grenadines": "Saint Vincent and the Grenadines",
    "St. Lucia": "Saint Lucia",
    "São Tomé and Príncipe": "Sao Tome and Principe",
    "Sao Tome and Principe": "Sao Tome and Principe",
    "Comoro Islands": "Comoros",
    "Comoros": "Comoros",
    "Vietnam": "Vietnam",
    "Viet Nam": "Vietnam",
    "Laos": "Laos",
    "Lao People's Democratic Republic": "Laos",
    "Syria": "Syria",
    "Syrian Arab Republic": "Syria",
    "Iran": "Iran",
    "Iran (Islamic Republic of)": "Iran",
    "Bolivia": "Bolivia",
    "Bolivia (Plurinational State of)": "Bolivia",
    "Tanzania": "Tanzania",
    "United Republic of Tanzania": "Tanzania",
    "Moldova": "Moldova",
    "Republic of Moldova": "Moldova",
    "Venezuela": "Venezuela",
    "Venezuela (Bolivarian Republic of)": "Venezuela",
    "Brunei": "Brunei",
    "Brunei Darussalam": "Brunei",
    "Czechia": "Czechia",
}


def iso_of(name):
    name = re.sub(r"\s+", " ", str(name or "")).strip()
    name = ALIASES.get(name, name)
    return NAMES.get(name)


def rh(value, places):
    q = Decimal("1") if places == 0 else Decimal("0." + "0" * (places - 1) + "1")
    return float(Decimal(str(value)).quantize(q, rounding=ROUND_HALF_UP))


def must_match(label, got, expected):
    if got != expected:
        raise SystemExit(f"{label}: got {got} expected {expected}")


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.cur = None
        self.row = None
        self.cell = None
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            if self.cur is None:
                self.cur = []
            else:
                self.skip += 1
        elif self.cur is not None and self.skip == 0 and tag == "tr":
            self.row = []
        elif self.row is not None and self.skip == 0 and tag in ("td", "th"):
            self.cell = []

    def handle_endtag(self, tag):
        if tag == "table":
            if self.skip:
                self.skip -= 1
            elif self.cur is not None:
                self.tables.append(self.cur)
                self.cur = None
        elif tag == "tr" and self.row is not None and self.skip == 0:
            if any(self.row):
                self.cur.append(self.row)
            self.row = None
        elif tag in ("td", "th") and self.cell is not None and self.skip == 0:
            text = re.sub(r"\s+", " ", "".join(self.cell)).strip()
            self.row.append(text)
            self.cell = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def tables_of(path):
    parser = Tables()
    parser.feed(Path(path).read_text(encoding="utf-8", errors="ignore"))
    return parser.tables


def onions():
    col = "onions__00002602__food_available_for_consumption__0645pc__kilograms_per_year_per_capita"
    rows = duckdb.connect().execute(
        f'''SELECT country, "{col}" FROM read_parquet('/tmp/backfill/fbsc.parquet')
            WHERE year=2023 AND "{col}" IS NOT NULL'''
    ).fetchall()
    out = []
    for name, value in rows:
        iso = iso_of(name)
        if not iso:
            continue
        out.append([iso, rh(value, 1), "2023"])
    by = {r[0]: r[1] for r in out}
    must_match("onion TJK", by["TJK"], 56.8)
    must_match("onion SEN", by["SEN"], 31.1)
    must_match("onion IND", by["IND"], 17.5)
    must_match("onion USA", by["USA"], 9.6)
    must_match("onion PHL", by["PHL"], 2.6)
    return out


def heights():
    path = BACK / "NCD_RisC_Lancet_2020_height_child_adolescent_country.csv"
    girls, boys = {}, {}
    with path.open(newline="") as handle:
        for row in csv.DictReader(handle):
            if row["Year"] != "2019" or row["Age group"] != "19":
                continue
            iso = iso_of(row["Country"])
            if not iso:
                continue
            cm = rh(row["Mean height"], 1)
            if row["Sex"] == "Girls":
                girls[iso] = cm
            elif row["Sex"] == "Boys":
                boys[iso] = cm
    must_match("girl GBR", girls["GBR"], 163.9)
    must_match("girl CHN", girls["CHN"], 163.5)
    must_match("girl USA", girls["USA"], 163.3)
    must_match("girl JPN", girls["JPN"], 158.5)
    must_match("girl IND", girls["IND"], 155.2)
    must_match("boy GBR", boys["GBR"], 178.2)
    must_match("boy USA", boys["USA"], 176.9)
    must_match("boy CHN", boys["CHN"], 175.7)
    must_match("boy JPN", boys["JPN"], 172.1)
    must_match("boy IND", boys["IND"], 166.5)
    return (
        [[iso, girls[iso], "2019"] for iso in sorted(girls)],
        [[iso, boys[iso], "2019"] for iso in sorted(boys)],
    )


def muslims():
    out = []
    with (BACK / "muslims.csv").open(newline="") as handle:
        for row in csv.DictReader(handle):
            if row["Year"] != "2020" or len(row["Code"]) != 3:
                continue
            if row["Code"] not in NAMES.values() and row["Code"] not in {v for v in NAMES.values()}:
                pass
            if iso_of(row["Entity"]) is None and row["Code"] not in set(NAMES.values()):
                continue
            iso = row["Code"]
            if iso not in set(NAMES.values()):
                continue
            out.append([iso, int(row["Number of people who are Muslims"]), "2020"])
    by = {r[0]: r[1] for r in out}
    must_match("muslim IDN", by["IDN"], 238990485)
    must_match("muslim PAK", by["PAK"], 226880801)
    must_match("muslim IND", by["IND"], 213057854)
    must_match("muslim BGD", by["BGD"], 151443154)
    must_match("muslim NGA", by["NGA"], 119980188)
    must_match("muslim EGY", by["EGY"], 104038012)
    return out


def elevation():
    import html as htmlmod
    out = []
    root = Path("/tmp/factbook.json")
    for path in root.rglob("*.json"):
        try:
            data = json.loads(path.read_text())
        except Exception:
            continue
        gov = data.get("Government") or {}
        cname = (gov.get("Country name") or {})
        def text_of(node):
            if isinstance(node, dict) and isinstance(node.get("text"), str):
                return node["text"]
            return ""
        short = htmlmod.unescape(re.sub(r"<[^>]+>", " ", text_of(cname.get("conventional short form") or {})))
        longf = htmlmod.unescape(re.sub(r"<[^>]+>", " ", text_of(cname.get("conventional long form") or {})))
        short = re.sub(r"\s+", " ", short).strip()
        longf = re.sub(r"\s+", " ", longf).strip()
        label = short if short and short.lower() != "none" else longf
        if not label or label.lower() == "none":
            continue
        elev = ((data.get("Geography") or {}).get("Elevation") or {}).get("mean elevation") or {}
        raw = htmlmod.unescape(re.sub(r"<[^>]+>", " ", text_of(elev)))
        raw = re.sub(r"\s+", " ", raw).strip()
        match = re.search(r"(-?\d[\d,]*)\s*m", raw)
        if not match:
            continue
        metres = int(match.group(1).replace(",", ""))
        iso = iso_of(label)
        if not iso:
            continue
        out.append([iso, metres, "2026"])
    by = {r[0]: r[1] for r in out}
    must_match("elev TJK", by.get("TJK"), 3186)
    must_match("elev KGZ", by.get("KGZ"), 2988)
    must_match("elev NPL", by.get("NPL"), 2565)
    must_match("elev BTN", by.get("BTN"), 2220)
    must_match("elev LSO", by.get("LSO"), 2161)
    # one row per country
    dedup = {}
    for row in out:
        dedup[row[0]] = row
    return list(dedup.values())


def meat():
    cols = {
        "poultry": "Poultry",
        "beef": "Beef and buffalo",
        "sheep": "Sheep and goat",
        "pork": "Pork",
        "fish": "Fish and seafood",
    }
    buckets = {k: [] for k in cols}
    with open("/tmp/meat.csv", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["Year"] != "2023" or len(row.get("Code") or "") != 3:
                continue
            if row["Code"] not in set(NAMES.values()):
                continue
            for key, column in cols.items():
                if row[column] == "":
                    continue
                buckets[key].append([row["Code"], rh(row[column], 2), "2023"])
    byp = {r[0]: r[1] for r in buckets["poultry"]}
    byb = {r[0]: r[1] for r in buckets["beef"]}
    must_match("poultry ISR", byp["ISR"], 72.82)
    must_match("beef ARG", byb["ARG"], 48.99)
    must_match("beef ZWE", byb["ZWE"], 45.48)
    return buckets


def henley():
    from pypdf import PdfReader
    text = "\n".join((page.extract_text() or "") for page in PdfReader(BACK / "henley.pdf").pages)
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("Rank Passport") or line.startswith("©") or line.startswith("In certain"):
            continue
        if line.startswith("The Henley") or line.startswith("With historical") or line.startswith("To view"):
            continue
        if "Powered by" in line or line.startswith("13 April"):
            continue
        lines.append(line)
    parsed = []
    current = None
    for line in lines:
        match = re.match(r"^(.*?)(\d{1,3})\s+(\d{2,3})$", line)
        if match and match.group(1).strip():
            name = match.group(1).strip()
            rank = int(match.group(2))
            score = int(match.group(3))
            current = (rank, score)
            parsed.append((name, rank, score))
        elif current and re.match(r"^[A-ZÀ-ÿ].+", line) and not re.search(r"\d", line):
            parsed.append((line.strip(), current[0], current[1]))
    out = []
    seen = {}
    for name, rank, score in parsed:
        iso = iso_of(name)
        if not iso or iso in seen:
            continue
        seen[iso] = [iso, score, "2026"]
        out.append(seen[iso])
    by = {r[0]: r[1] for r in out}
    must_match("henley SGP", by["SGP"], 192)
    must_match("henley SWE", by["SWE"], 186)
    must_match("henley GBR", by["GBR"], 183)
    must_match("henley USA", by["USA"], 179)
    must_match("henley MEX", by["MEX"], 156)
    must_match("henley CHN", by["CHN"], 82)
    return out


def democracy():
    from pypdf import PdfReader
    chunks = []
    for page in PdfReader(BACK / "eiu.pdf").pages:
        chunks.append(re.sub(r"\s+", " ", page.extract_text() or ""))
    text = " ".join(chunks)
    pattern = re.compile(
        r"([A-Z][A-Za-z'’.\-]+(?: (?:[A-Za-z][A-Za-z'’.\-]*)){0,6}) (\d\.\d{2}) (\d{1,3})=?(?: -?\d+)? (\d+\.\d{2}) (\d+\.\d{2}) (\d+\.\d{2}) (\d+\.\d{2}) (\d+\.\d{2})"
    )
    found = {}
    for match in pattern.finditer(text):
        raw = match.group(1).strip()
        score = float(match.group(2))
        rank = int(match.group(3))
        if not (0 <= score <= 10 and 1 <= rank <= 167):
            continue
        parts = raw.split()
        iso = None
        for i in range(len(parts)):
            iso = iso_of(" ".join(parts[i:]))
            if iso:
                break
        if not iso:
            continue
        # Prefer the ranking-table row when prose mentions the same score.
        prev = found.get(iso)
        if prev is None or rank < prev[1]:
            found[iso] = (score, rank)
    out = [[iso, score, "2024"] for iso, (score, rank) in found.items()]
    dedup = {}
    for row in out:
        dedup[row[0]] = row
    rows = list(dedup.values())
    by = {r[0]: r[1] for r in rows}
    must_match("eiu NOR", by.get("NOR"), 9.81)
    must_match("eiu GBR", by.get("GBR"), 8.34)
    must_match("eiu USA", by.get("USA"), 7.85)
    must_match("eiu IND", by.get("IND"), 7.29)
    must_match("eiu SGP", by.get("SGP"), 6.18)
    must_match("eiu CHN", by.get("CHN"), 2.11)
    return rows


def pew_us():
    # Read from the published diverging bar chart on the Spring 2025 article.
    # The six board values were checked against that chart before the rest were kept.
    favorable = {
        "Canada": 34, "Hungary": 60, "Poland": 55, "UK": 50, "Italy": 47, "Greece": 45,
        "France": 36, "Germany": 33, "Spain": 31, "Netherlands": 29, "Sweden": 19,
        "South Korea": 61, "Japan": 55, "India": 54, "Indonesia": 48, "Australia": 29,
        "Israel": 83, "Turkey": 25, "Nigeria": 78, "Kenya": 62, "South Africa": 50,
        "Brazil": 56, "Argentina": 52, "Mexico": 29,
    }
    out = []
    for name, value in favorable.items():
        iso = iso_of(name)
        if not iso:
            raise SystemExit("pew name " + name)
        out.append([iso, value, "2025"])
    by = {r[0]: r[1] for r in out}
    must_match("pew ISR", by["ISR"], 83)
    must_match("pew HUN", by["HUN"], 60)
    must_match("pew BRA", by["BRA"], 56)
    must_match("pew GBR", by["GBR"], 50)
    must_match("pew MEX", by["MEX"], 29)
    must_match("pew SWE", by["SWE"], 19)
    if len(out) != 24:
        raise SystemExit("pew count " + str(len(out)))
    return out


def languages():
    table = tables_of(BACK / "wiki-lang.html")[0]
    rename = {
        "English": "English",
        "Mandarin Chinese": "Mandarin",
        "Hindi": "Hindi",
        "Spanish": "Spanish",
        "Modern Standard Arabic": "Standard Arabic",
        "French": "French",
    }
    emoji = {
        "English": "A", "Mandarin": "文", "Hindi": "अ", "Spanish": "Ñ",
        "Standard Arabic": "ع", "French": "É",
    }
    parsed = []
    for row in table:
        if not row or row[0].startswith("Language") or row[0].startswith("First"):
            continue
        raw = re.sub(r"\[.*?\]", "", row[0])
        base = raw.split("(")[0].strip()
        name = rename.get(base, base)
        total = int(row[-1].split("[")[0].replace(",", ""))
        parsed.append((name, total))
    by = {n: v for n, v in parsed}
    must_match("lang English", by["English"], 1493)
    must_match("lang Mandarin", by["Mandarin"], 1183)
    must_match("lang Hindi", by["Hindi"], 611)
    must_match("lang Spanish", by["Spanish"], 561)
    must_match("lang Arabic", by["Standard Arabic"], 335)
    must_match("lang French", by["French"], 334)
    out = []
    for name, total in parsed:
        rank = 1 + sum(1 for _, v in parsed if v > total)
        out.append([name, emoji.get(name, name[:1]), total, rank, len(parsed), "languages"])
    return out


def space():
    table = tables_of(BACK / "wiki-space.html")[0]
    first = {}
    for row in table[1:]:
        if len(row) < 3 or not row[0][:1].isdigit():
            continue
        country = re.sub(r"\[.*?\]", "", row[1]).strip()
        country = country.split(",")[0].strip()
        date = row[-1]
        year_m = re.search(r"(19|20)\d{2}", date)
        if not year_m:
            continue
        year = int(year_m.group(0))
        iso = iso_of(country)
        if not iso or iso in first:
            continue
        first[iso] = year
    must_match("space VNM", first.get("VNM"), 1980)
    must_match("space MNG", first.get("MNG"), 1981)
    must_match("space AFG", first.get("AFG"), 1988)
    must_match("space GBR", first.get("GBR"), 1991)
    must_match("space CHN", first.get("CHN"), 2003)
    return [[iso, year, ""] for iso, year in first.items()]


def un_members():
    table = tables_of(BACK / "wiki-un.html")[1]
    out = []
    seen = set()
    for row in table[1:]:
        if len(row) < 2:
            continue
        year_m = re.search(r"(18|19|20)\d{2}", row[1])
        if not year_m:
            continue
        iso = iso_of(row[0])
        if not iso or iso in seen:
            continue
        seen.add(iso)
        out.append([iso, int(year_m.group(0)), ""])
    by = {r[0]: r[1] for r in out}
    must_match("un SSD", by.get("SSD"), 2011)
    must_match("un MNE", by.get("MNE"), 2006)
    must_match("un TLS", by.get("TLS"), 2002)
    must_match("un PLW", by.get("PLW"), 1994)
    must_match("un ERI", by.get("ERI"), 1993)
    must_match("un NAM", by.get("NAM"), 1990)
    return out


def main():
    girl, boy = heights()
    meats = meat()
    series = {
        "onions": onions(),
        "height-girls-19": girl,
        "height-boys-19": boy,
        "pew-muslim-population-2020": muslims(),
        "cia-mean-elevation": elevation(),
        "henley-passport-2026-04-13": henley(),
        "eiu-democracy-2024": democracy(),
        "pew-us-favorable": pew_us(),
        "ethnologue-total-speakers": languages(),
        "space-first": space(),
        "newest-un-members": un_members(),
        "fao-poultry-supply-2023": meats["poultry"],
        "fao-beef-supply-2023": meats["beef"],
        "fao-sheep-supply-2023": meats["sheep"],
        "fao-pork-supply-2023": meats["pork"],
        "fao-fish-supply-2023": meats["fish"],
    }
    for key, rows in series.items():
        print(f"{key} {len(rows)}")
    (BACK / "series.json").write_text(json.dumps(series))
    print("wrote", BACK / "series.json")


if __name__ == "__main__":
    main()
