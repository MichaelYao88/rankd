/* Dailies after 2027-05-12: finger-count tiers, one-zone population rankers,
   and a time-zone tier. Idempotent. The 2026 public-execution Name it is not
   added: only Iran is verified for a 2026 public execution (AP, Human Rights
   Watch). Afghanistan's last documented public execution is 2 December 2025.
   Saudi Arabia, North Korea, Somalia, Yemen, and the United States do not
   clear the source bar for a completed 2026 public execution. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}

const practiceText = fs.readFileSync(path.join(root, "practice-data.js"), "utf8");
const practice = JSON.parse(practiceText.slice(practiceText.indexOf("{")).replace(/;\s*$/, ""));
const C = practice.countries;
const byName = new Map(Object.entries(C).map(([iso, row]) => [row[0], iso]));
function isoOf(name) {
  const iso = byName.get(name);
  if (!iso) throw new Error("missing country " + name);
  return iso;
}
function country(iso) { return C[iso][0]; }
function emoji(iso) { return C[iso][1]; }

/* Wikipedia "No. of time zones" column, List of time zones by country.
   Dependent territories are inside the sovereign row. Antarctica is excluded.
   Everyone else on that table who is in the practice catalog is 1, except: */
const MULTI = {
  FRA: 12, RUS: 11, USA: 11, AUS: 9, GBR: 9, CAN: 5, NZL: 5,
  BRA: 4, DNK: 4, MEX: 4, CHL: 3, IDN: 3, KIR: 3,
  COD: 2, ECU: 2, FSM: 2, NLD: 2, MNG: 2, PNG: 2, PRT: 2, ZAF: 2, ESP: 2,
};
const NOT_ON_TABLE = new Set([
  "ASM", "AIA", "ABW", "BMU", "VGB", "CYM", "CHI", "COK", "CUW", "GB-ENG", "FRO",
  "GUF", "PYF", "GIB", "GRL", "GLP", "GUM", "GGY", "IMN", "JEY", "XKX", "MTQ",
  "MYT", "NCL", "NIU", "MNP", "PRI", "REU", "MAF", "GB-SCT", "SCG", "SXM", "TKL",
  "TCA", "VIR",
]);
for (const iso of Object.keys(MULTI)) {
  if (!C[iso]) throw new Error("multi iso missing " + iso);
}
const zones = [];
for (const iso of Object.keys(C)) {
  if (NOT_ON_TABLE.has(iso)) continue;
  const n = MULTI[iso] || 1;
  zones.push([iso, n]);
}
zones.sort((a, b) => a[0].localeCompare(b[0]));
const zoneOf = Object.fromEntries(zones);

const pop = {};
for (const line of fs.readFileSync(path.join(root, "country_attributes.csv"), "utf8").replace(/^\uFEFF/, "").trim().split("\n").slice(1)) {
  const cols = line.split(",");
  if (cols[3]) pop[cols[0]] = Number(cols[3]);
}
const oneZone = zones.filter(([iso, n]) => n === 1 && pop[iso]).map(([iso]) => [iso, pop[iso]]);
oneZone.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const noGiants = oneZone.filter(([iso]) => iso !== "CHN" && iso !== "IND");

function rankOf(list, iso) {
  const value = list.find(r => r[0] === iso)[1];
  return 1 + list.filter(r => r[1] > value).length;
}

const WIKI = "https://en.wikipedia.org/wiki/List_of_time_zones_by_country";
const BBC = "https://www.bbc.com/future/article/20210902-how-finger-counting-gives-away-your-nationality";
const ZONE_RULE = "Wikipedia, List of time zones by country. The number is the table's own count of standard UTC offsets. Dependent territories are included, Antarctic claims are not, and daylight saving is not an extra zone. Unofficial offsets count only when the table lists them, so Australia includes UTC+08:45 and China does not include Xinjiang Time. France is 12, not 13.";
const POP_SRC = "World Bank, Population, total (SP.POP.TOTL), 2024, via country_attributes.csv. " + ZONE_RULE + " A country is on this list only when that table says 1.";

function rankItem(list, iso) {
  return {
    name: country(iso), emoji: emoji(iso), value: pop[iso], year: "2024", iso3: iso,
    gRank: rankOf(list, iso), gTotal: list.length, gScope: list === oneZone ? "one time zone" : "one time zone, excluding China and India",
  };
}

const topAll = ["IND", "CHN", "PAK", "NGA", "BGD", "ETH"].map(iso => rankItem(oneZone, iso));
const topRest = ["PAK", "NGA", "BGD", "ETH", "JPN", "EGY"].map(iso => rankItem(noGiants, iso));

const oneClock = {
  type: "rank", id: "one-time-zone-pop", order: 221, emoji: "🕐", headline: "One Clock",
  question: "Most populous countries with one time zone",
  stat: "Population of countries with one time zone", unit: "people",
  higherIs: "top", valuesVisible: false, art: "globe", support: "",
  source: POP_SRC, sourceUrl: WIKI, year: "2024", dataset: "one-time-zone-pop",
  fact: "India, at 1,450,935,791 people in 2024, is ahead of China at 1,408,975,000, and both keep a single legal time. China's row is UTC+8 because unofficial Xinjiang Time is not counted. Pakistan is third at 251,269,164. The United States is off this list: Wikipedia gives it 11 zones once Baker Island and Wake Island are included. Ethiopia, at 132,059,767, is larger than Japan and just misses this six.",
  items: topAll,
};
const nextLine = {
  type: "rank", id: "one-time-zone-pop-ex-giants", order: 222, emoji: "🕑", headline: "Next in Line",
  question: "Most populous one-zone countries after China and India",
  stat: "Population, one time zone, excluding China and India", unit: "people",
  higherIs: "top", valuesVisible: false, art: "globe", support: "",
  source: POP_SRC + " China and India are removed on this board.", sourceUrl: WIKI, year: "2024",
  dataset: "one-time-zone-pop-ex-giants",
  fact: "Pakistan leads once China and India are removed, at 251,269,164, ahead of Nigeria and Bangladesh. Ethiopia, at 132,059,767, is larger than Japan at 123,975,371. Egypt finishes this six at 116,538,258, just ahead of the Philippines at 115,843,670. The count is Wikipedia's, so overseas territories are included and Antarctica is not.",
  items: topRest,
};

const manyFact = "France has 12 time zones because overseas territories count, and would have 13 only if its Antarctic claim were included. The United States has 11, the same as Russia, once Baker Island and Wake Island are counted, not the four zones of the mainland. The United Kingdom has 9, the same as Australia, almost all of them outside Great Britain. Kiribati has 3, including UTC+14, and South Africa has 2 only because of the Prince Edward Islands. China has 1. No country on the list has 6, 7, or 8, and the only 10 is Antarctica, which is not a country.";
const manyClocks = {
  type: "tier", id: "time-zones-by-country", order: 223, emoji: "🌐", headline: "Many Clocks",
  question: "How many time zones a country has",
  stat: "Time zones, including dependent territories", unit: "time zones",
  source: ZONE_RULE, sourceUrl: WIKI, fact: manyFact, art: "globe", support: "",
  dataset: "wiki-time-zones", year: "",
  tiers: [
    { label: "10 or more", value: 10 },
    { label: "5 to 9", value: 5 },
    { label: "2 to 4", value: 2 },
    { label: "1", value: 1 },
  ],
  items: [
    ["CHN", 1, 3], ["FRA", 12, 0], ["ZAF", 2, 2], ["USA", 11, 0], ["KIR", 3, 2], ["GBR", 9, 1],
  ].map(([iso, value, tierIndex]) => ({ name: country(iso), emoji: emoji(iso), value, tierIndex, iso3: iso })),
};

const fingerFact = "India counts the lines between finger segments, four to a finger, so one hand reaches 20. China counts to five like the United States, then shows six through ten as gestures on that same hand: six is the thumb and the pinky. The United Kingdom runs from thumb to pinky, the United States from index finger to thumb, and Iran starts at the pinky, so each of those stops at five. The article does not name Pakistan, Bangladesh, Vietnam, Turkey, or Egypt.";
const fingers = {
  type: "tier", id: "finger-count-one-hand", order: 220, emoji: "✋", headline: "Past Five",
  question: "How far a common finger count goes on one hand",
  stat: "Numbers one hand can show", unit: "on one hand",
  source: "BBC Future, How the way you count reveals more than you think, 3 September 2021. The country methods are the ones that article describes. Andrea Bender is quoted there on how much finger counting varies.",
  sourceUrl: BBC, fact: fingerFact, art: "candle", support: "",
  dataset: "finger-count-one-hand", year: "2021",
  tiers: [
    { label: "Counts past 5 on one hand", value: 1 },
    { label: "Counts only to 5 on one hand", value: 0 },
  ],
  items: [
    ["USA", 5, 1], ["IND", 20, 0], ["IRN", 5, 1], ["CHN", 10, 0], ["GBR", 5, 1],
  ].map(([iso, value, tierIndex]) => ({ name: country(iso), emoji: emoji(iso), value, tierIndex, iso3: iso })),
};

function dataset(spec) {
  const values = spec.rows.map(r => r[1]);
  let dec = 0;
  for (const v of values) {
    const s = String(v);
    const i = s.indexOf(".");
    if (i >= 0) dec = Math.max(dec, s.length - i - 1);
  }
  const ds = {
    id: spec.id, title: spec.title, stat: spec.stat, unit: spec.unit,
    src: spec.src, url: spec.url, year: spec.year, hi: "top", dec,
    emoji: spec.emoji, fact: spec.fact, caveat: spec.caveat || "",
    sens: 0, coverage: spec.coverage, rows: spec.rows,
  };
  if (spec.kind) ds.kind = spec.kind;
  if (spec.labels) ds.labels = spec.labels;
  return ds;
}

const zoneLabels = {};
for (const n of [1, 2, 3, 4, 5, 9, 11, 12]) zoneLabels[String(n)] = n === 1 ? "1 time zone" : n + " time zones";

const datasets = [
  dataset({
    id: "finger-count-one-hand", title: "Past Five",
    stat: fingers.stat, unit: fingers.unit, src: fingers.source, url: BBC, year: "2021",
    emoji: "✋", fact: fingerFact, coverage: "partial", kind: "tier",
    labels: { "20": "20 on one hand", "10": "10 on one hand", "5": "5 on one hand" },
    caveat: "Only methods the BBC article states for a country. India is the lines between finger segments (20 on one hand). China shows 6 through 10 as gestures on one hand. The United Kingdom, the United States, and Iran are the five-finger orders the article describes. Pakistan, Bangladesh, Vietnam, Turkey, and Egypt are not named.",
    rows: [["IND", 20], ["CHN", 10], ["GBR", 5], ["USA", 5], ["IRN", 5]],
  }),
  dataset({
    id: "one-time-zone-pop", title: "One Clock",
    stat: oneClock.stat, unit: "people", src: POP_SRC, url: WIKI, year: "2024",
    emoji: "🕐", fact: oneClock.fact, coverage: "full",
    caveat: "2024 World Bank population where Wikipedia lists exactly one time zone. Hong Kong, Macao, and Taiwan are one zone on that table and have no population in country_attributes.csv, so they are not ranked here. Kosovo is not on the Wikipedia table. Vatican City is one zone there and is not in the practice country list.",
    rows: oneZone.map(([iso, value]) => [iso, value, "2024"]),
  }),
  dataset({
    id: "one-time-zone-pop-ex-giants", title: "Next in Line",
    stat: nextLine.stat, unit: "people", src: nextLine.source, url: WIKI, year: "2024",
    emoji: "🕑", fact: nextLine.fact, coverage: "full",
    caveat: "The one-zone population list with China and India removed. Same Wikipedia zone rule and same 2024 populations.",
    rows: noGiants.map(([iso, value]) => [iso, value, "2024"]),
  }),
  dataset({
    id: "wiki-time-zones", title: "Many Clocks",
    stat: manyClocks.stat, unit: "time zones", src: ZONE_RULE, url: WIKI, year: "",
    emoji: "🌐", fact: manyFact, coverage: "full", kind: "tier", labels: zoneLabels,
    caveat: "Dependent territories are counted inside the sovereign country and are not separate rows. Antarctic claims are excluded. Kosovo is not on the Wikipedia table. Hong Kong, Macao, and Taiwan each have their own row of 1. Vatican City is 1 on Wikipedia and is not in the practice country list.",
    rows: zones,
  }),
];

function spliceArray(file, marker, objects) {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, "utf8");
  const fresh = objects.filter(o => !text.includes('"id":"' + o.id + '"'));
  if (!fresh.length) { console.log("skip splice", file); return; }
  const idx = text.indexOf(marker);
  const end = text.indexOf("];", idx);
  const blob = fresh.map(o => JSON.stringify(o)).join(",");
  const prefix = text[end - 1] === "[" ? "" : ",";
  text = text.slice(0, end) + prefix + blob + text.slice(end);
  fs.writeFileSync(full, text);
}

function csvQuote(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function appendRankCsv(puzzles) {
  const file = path.join(root, "puzzles.csv");
  let text = fs.readFileSync(file, "utf8");
  const header = text.replace(/^\uFEFF/, "").split("\n")[0];
  const fields = header.split(",");
  const lines = [];
  for (const p of puzzles) {
    if (text.includes("\n" + p.id + ",")) continue;
    p.items.forEach((it, n) => {
      const row = {
        puzzle_id: p.id, daily_order: n === 0 ? p.order : "", puzzle_emoji: n === 0 ? p.emoji : "",
        question: n === 0 ? p.question : "", stat_label: n === 0 ? p.stat : "", unit: n === 0 ? p.unit : "",
        higher_is: n === 0 ? p.higherIs : "", values_visible: n === 0 ? "no" : "",
        item_name: it.name, item_emoji: it.emoji, value: it.value, data_year: it.year || "",
        source_name: n === 0 ? p.source : "", source_url: n === 0 ? p.sourceUrl : "",
        fun_fact: n === 0 ? p.fact : "", global_rank: it.gRank || "", global_total: it.gTotal || "",
        global_scope: it.gScope || "", art: n === 0 ? (p.art || "") : "", support_url: "",
        dataset: n === 0 ? (p.dataset || "") : "", series_title: "", headline: n === 0 ? p.headline : "",
      };
      lines.push(fields.map(f => csvQuote(row[f] == null ? "" : row[f])).join(","));
    });
  }
  if (!lines.length) return;
  if (!text.endsWith("\n")) text += "\n";
  fs.writeFileSync(file, text + lines.join("\n") + "\n");
}

function appendTierCsv(puzzles) {
  const file = path.join(root, "tier_puzzles.csv");
  let text = fs.readFileSync(file, "utf8");
  const lines = [];
  for (const p of puzzles) {
    if (text.includes("\n" + p.id + ",") || text.includes("\r\n" + p.id + ",")) continue;
    p.items.forEach((it, n) => {
      const tier = p.tiers[it.tierIndex];
      const row = [
        n === 0 ? p.id : "", n === 0 ? p.order : "", n === 0 ? p.emoji : "", n === 0 ? p.headline : "",
        n === 0 ? p.question : "", n === 0 ? p.stat : "", n === 0 ? p.unit : "",
        n === 0 ? p.source : "", n === 0 ? p.sourceUrl : "", n === 0 ? p.fact : "", n === 0 ? (p.art || "") : "",
        tier.value, tier.label, it.name, it.emoji, it.iso3, it.value, p.year || "",
        n === 0 ? p.dataset : "", "", "",
      ];
      lines.push(row.map(csvQuote).join(","));
    });
  }
  if (!lines.length) return;
  if (!text.endsWith("\n")) text += "\n";
  fs.writeFileSync(file, text + lines.join("\n") + "\n");
}

function insertDatasets() {
  const text = fs.readFileSync(path.join(root, "practice-data.js"), "utf8");
  const fresh = datasets.filter(d => !text.includes('"id":"' + d.id + '"'));
  if (!fresh.length) { console.log("datasets already present"); return; }
  const needle = '],"minTop5":';
  const at = text.indexOf(needle);
  if (at < 0) throw new Error("practice insert point missing");
  const blob = fresh.map(d => JSON.stringify(d)).join(",");
  fs.writeFileSync(path.join(root, "practice-data.js"), text.slice(0, at) + "," + blob + text.slice(at));
}

const expectTop = [
  ["IND", 1450935791], ["CHN", 1408975000], ["PAK", 251269164], ["NGA", 232679478],
  ["BGD", 173562364], ["ETH", 132059767], ["JPN", 123975371], ["EGY", 116538258], ["PHL", 115843670],
];
expectTop.forEach(([iso, value], i) => {
  const row = oneZone[i];
  if (!row || row[0] !== iso || row[1] !== value) throw new Error("order " + iso + " got " + (row && row.join("=")));
});
if (zoneOf.FRA !== 12 || zoneOf.RUS !== 11 || zoneOf.USA !== 11 || zoneOf.GBR !== 9 || zoneOf.AUS !== 9) throw new Error("headline zones");
if (zoneOf.CHN !== 1 || zoneOf.IND !== 1 || zoneOf.ZAF !== 2 || zoneOf.KIR !== 3) throw new Error("sample zones");
if (zones.some(([, n]) => n === 6 || n === 7 || n === 8 || n === 10)) throw new Error("unexpected zone count");
if (zoneOf.XKX || zoneOf.ASM || zoneOf.GRL) throw new Error("territory counted alone");
console.log("zones", zones.length, "one-zone pop", oneZone.length, "ex giants", noGiants.length);
console.log("one clock", topAll.map(it => it.name + " " + it.value + " #" + it.gRank + "/" + it.gTotal).join(" | "));
console.log("next", topRest.map(it => it.name + " " + it.value + " #" + it.gRank + "/" + it.gTotal).join(" | "));

function appendXlsx() {
  const { execFileSync } = require("child_process");
  function sheetItems(puzzles, kind) {
    const items = [];
    for (const p of puzzles) {
      p.items.forEach((it, n) => {
        if (kind === "rank") {
          items.push({
            id: p.id,
            first: n === 0,
            cells: n === 0 ? [
              ["B", p.order], ["C", p.emoji], ["D", p.question], ["E", p.stat], ["F", p.unit],
              ["G", "top"], ["H", "no"], ["I", it.name], ["J", it.emoji], ["K", it.value],
              ["L", it.year || ""], ["M", p.source], ["N", p.sourceUrl], ["O", p.fact],
              ["P", it.gRank], ["Q", it.gTotal], ["R", it.gScope], ["S", p.art || ""],
              ["U", p.dataset], ["W", p.headline],
            ] : [
              ["I", it.name], ["J", it.emoji], ["K", it.value], ["L", it.year || ""],
              ["P", it.gRank], ["Q", it.gTotal], ["R", it.gScope],
            ],
          });
        } else {
          const tier = p.tiers[it.tierIndex];
          items.push({
            id: p.id,
            first: n === 0,
            cells: n === 0 ? [
              ["B", p.order], ["C", p.emoji], ["D", p.headline], ["E", p.question], ["F", p.stat],
              ["G", p.unit], ["H", p.source], ["I", p.sourceUrl], ["J", p.fact], ["K", p.art || ""],
              ["L", tier.value], ["M", tier.label], ["N", it.name], ["O", it.emoji], ["P", it.iso3],
              ["Q", it.value], ["R", p.year || ""], ["S", p.dataset],
            ] : [
              ["L", tier.value], ["M", tier.label], ["N", it.name], ["O", it.emoji], ["P", it.iso3], ["Q", it.value],
            ],
          });
        }
      });
    }
    return items;
  }
  // Rewrite python to walk per-item ids. Simpler to do the whole patch in JS-free python from JSON.
  const payload = {
    ranks: sheetItems([oneClock, nextLine], "rank"),
    tiers: sheetItems([fingers, manyClocks], "tier"),
  };
  fs.writeFileSync("/tmp/rankd-xlsx-rows.json", JSON.stringify(payload));
  const script = `
import json, re, zipfile
from pathlib import Path
root = Path(${JSON.stringify(root)})
xlsx = root / "puzzles.xlsx"
payload = json.loads(Path("/tmp/rankd-xlsx-rows.json").read_text())
def esc(s):
    return ("" if s is None else str(s)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def cell(col, row, text):
    if text is None or text == "":
        return ""
    return f'<c r="{col}{row}" t="inlineStr"><is><t>{esc(text)}</t></is></c>'
def patch(xml, items):
    added = 0
    rows = []
    last = max(int(n) for n in re.findall(r'<row r="(\\d+)"', xml))
    pending = []
    for item in items:
        if item["id"] in xml and item["first"]:
            continue
        if item["id"] in xml:
            continue
        pending.append(item)
    # If the id is already present, skip every row of that id.
    seen = set()
    for item in items:
        if item["id"] in xml:
            seen.add(item["id"])
    for item in items:
        if item["id"] in seen:
            continue
        last += 1
        added += 1
        parts = [cell("A", last, item["id"])] + [cell(col, last, val) for col, val in item["cells"]]
        rows.append(f'<row r="{last}">' + "".join(parts) + "</row>")
    if not rows:
        return xml, 0
    xml = xml.replace("</sheetData>", "".join(rows) + "</sheetData>", 1)
    dim = re.search(r'<dimension ref="([A-Z]+)1:([A-Z]+)(\\d+)"\\s*/>', xml)
    if dim:
        xml = xml[:dim.start()] + f'<dimension ref="{dim.group(1)}1:{dim.group(2)}{last}" />' + xml[dim.end():]
    return xml, added
with zipfile.ZipFile(xlsx) as book:
    stored = {info.filename: (info, book.read(info.filename)) for info in book.infolist()}
s1, n1 = patch(stored["xl/worksheets/sheet1.xml"][1].decode("utf-8"), payload["ranks"])
s7, n7 = patch(stored["xl/worksheets/sheet7.xml"][1].decode("utf-8"), payload["tiers"])
if n1 == 0 and n7 == 0:
    print("xlsx already has the puzzles")
    raise SystemExit(0)
stored["xl/worksheets/sheet1.xml"] = (stored["xl/worksheets/sheet1.xml"][0], s1.encode("utf-8"))
stored["xl/worksheets/sheet7.xml"] = (stored["xl/worksheets/sheet7.xml"][0], s7.encode("utf-8"))
tmp = xlsx.with_suffix(".xlsx.tmp")
with zipfile.ZipFile(tmp, "w") as dest:
    for name, (info, data) in stored.items():
        dest.writestr(info, data)
tmp.replace(xlsx)
print("xlsx rows", n1, n7)
`;
  execFileSync("python3", ["-c", script], { stdio: "inherit" });
}

spliceArray("puzzles-data.js", "RANKD_PUZZLES = ", [fingers, oneClock, nextLine, manyClocks]);
appendRankCsv([oneClock, nextLine]);
appendTierCsv([fingers, manyClocks]);
insertDatasets();
appendXlsx();
console.log("wrote finger, one clock, next in line, many clocks");
