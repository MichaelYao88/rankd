/* Retired. The live rankers are male-testosterone and male-testosterone-b,
   rebuilt from Orwoll et al., J Clin Endocrinol Metab 2010 (PMC3050097),
   men aged 65+. Do not re-run this script: it would put the old
   TestosteroneDecline.com compilation back.
   Idempotent. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}

const practice = load("practice-data.js").RANKD_PRACTICE;
const C = practice.countries;
const byName = new Map(Object.entries(C).map(([iso, row]) => [row[0], iso]));

/* Ranking table on testosteronedecline.com/what-country-has-highest-testosterone/
   (page updated 25 Nov 2024). French West Indies is not a country and is omitted.
   The printed table still has the United States at 459. The same page's 25 Nov 2024
   note replaces that with 451 from NHANES 2021-2023, which is the value stored here,
   so the United States sits just below Argentina. Croatia (752 in 1987) and Armenia
   (556 in 1980) are not in this table: the compiler has no current figure. */
const TABLE = [
  ["Uzbekistan", 773],
  ["Cameroon", 731],
  ["Azerbaijan", 694],
  ["Mongolia", 693],
  ["Ethiopia", 671],
  ["Democratic Republic of Congo", 668],
  ["Nigeria", 625],
  ["Saudi Arabia", 599],
  ["Sudan", 588],
  ["Uganda", 586],
  ["Netherlands", 571],
  ["Serbia", 570],
  ["Ghana", 569],
  ["Denmark", 566],
  ["Algeria", 563],
  ["Belgium", 561],
  ["Kenya", 552],
  ["Russia", 547],
  ["Bulgaria", 534],
  ["Sri Lanka", 533],
  ["Tunisia", 532],
  ["Yemen", 531],
  ["United Kingdom", 521],
  ["China", 521],
  ["Egypt", 521],
  ["Indonesia", 503],
  ["Vietnam", 503],
  ["Iceland", 502],
  ["Japan", 502],
  ["Iraq", 500],
  ["Morocco", 497],
  ["Spain", 496],
  ["Taiwan", 492],
  ["Iran", 490],
  ["Sweden", 489],
  ["Jordan", 488],
  ["India", 487],
  ["Myanmar", 481],
  ["Italy", 480],
  ["Qatar", 474],
  ["Portugal", 472],
  ["South Africa", 472],
  ["Switzerland", 472],
  ["Pakistan", 465],
  ["Malaysia", 464],
  ["South Korea", 462],
  ["Argentina", 455],
  ["United States", 451],
  ["Greece", 448],
  ["Norway", 443],
  ["Austria", 438],
  ["Cuba", 438],
  ["Germany", 434],
  ["Thailand", 433],
  ["New Zealand", 428],
  ["Bangladesh", 423],
  ["France", 420],
  ["Turkey", 420],
  ["Peru", 414],
  ["Slovakia", 414],
  ["Philippines", 413],
  ["Mexico", 412],
  ["Palestine", 407],
  ["Kyrgyzstan", 405],
  ["Ukraine", 404],
  ["Uruguay", 404],
  ["Australia", 403],
  ["Canada", 402],
  ["Israel", 395],
  ["Ireland", 394],
  ["Romania", 394],
  ["Lithuania", 392],
  ["Venezuela", 384],
  ["Kuwait", 379],
  ["Brazil", 375],
  ["Finland", 375],
  ["Honduras", 374],
  ["Poland", 373],
  ["Estonia", 369],
  ["Chile", 358],
  ["Kazakhstan", 356],
  ["Belarus", 356],
  ["Bahrain", 346],
  ["Latvia", 342],
  ["Czechia", 315],
];

const YEAR = "2000–2024";
const USA_YEAR = "2021–2023";
const SOURCE = "TestosteroneDecline.com, age-adjusted compilation of small, non-uniform studies (ranking table updated 25 Nov 2024). World Population Review cites this page. Often one city, measured in different labs and years, then shifted onto a US age curve.";
const URL = "https://testosteronedecline.com/what-country-has-highest-testosterone/";
const FACT_EAST = "China, Japan and South Korea all sit above the United States, Germany and Canada, the opposite of the low-testosterone East Asia story. The compiler age-adjusted small studies, often one city, onto a US age curve so different age groups could be compared. Note: the Netherlands (571 ng/dL), Denmark (566) and Belgium (561) are still higher than China. Labs, sample sizes and years differ.";
const FACT_WEST = "Cameroon and Ethiopia sit above the Netherlands, the highest European figure in this compilation, and India (487 ng/dL) sits above the United States (451). The compiler age-adjusted small studies, often one city, onto a US age curve. Note: the United Kingdom (521) is still above India. Labs, sample sizes and years differ.";
const CAVEAT = "Age-adjusted ng/dL from small, non-uniform studies, often one city, not one survey. Many countries have no usable study. French West Indies is not a country. Croatia (752 in 1987) and Armenia (556 in 1980) are left out because the compiler has no current figure. The printed table still shows the United States at 459; the 25 Nov 2024 note revises it to 451 (NHANES 2021-2023).";

const rows = TABLE.map(([name, value]) => {
  const iso = byName.get(name);
  if (!iso) throw new Error("no iso for " + name);
  return [iso, value, name === "United States" ? USA_YEAR : YEAR];
});
if (new Set(rows.map(r => r[0])).size !== rows.length) throw new Error("duplicate iso");
const total = rows.length;
function rankOf(value) {
  return 1 + rows.filter(r => r[1] > value).length;
}
const scope = "compiled countries";

if (total !== 85) throw new Error("expected 85 countries, got " + total);
function boardItems(names) {
  const items = names.map(name => {
    const iso = byName.get(name);
    const row = rows.find(r => r[0] === iso);
    if (!row) throw new Error("missing " + name);
    return {
      name, emoji: C[iso][1], value: row[1], year: row[2],
      gRank: rankOf(row[1]), gTotal: total, gScope: scope,
    };
  });
  for (let i = 1; i < items.length; i++) {
    if (!(items[i - 1].value > items[i].value)) throw new Error("board order " + items[i].name);
  }
  return items;
}
const STAT = "Average male testosterone, age-adjusted";
const puzzles = [
  {
    type: "rank", id: "male-testosterone", order: 228, emoji: "🧪",
    headline: "Serum Levels",
    question: "Average male testosterone 🇨🇳🇯🇵",
    stat: STAT, unit: "ng/dL", higherIs: "top", valuesVisible: false,
    source: SOURCE, sourceUrl: URL, fact: FACT_EAST, caveat: CAVEAT,
    art: "chart", support: "", dataset: "tdc-male-testosterone",
    year: YEAR, items: boardItems(["China", "Japan", "South Korea", "United States", "Germany", "Canada"]),
  },
  {
    type: "rank", id: "male-testosterone-b", order: 229, emoji: "🧪",
    headline: "Higher Still",
    question: "Average male testosterone 🇮🇳🇬🇧",
    stat: STAT, unit: "ng/dL", higherIs: "top", valuesVisible: false,
    source: SOURCE, sourceUrl: URL, fact: FACT_WEST, caveat: CAVEAT,
    art: "chart", support: "", dataset: "tdc-male-testosterone",
    year: YEAR, items: boardItems(["Cameroon", "Ethiopia", "Netherlands", "United Kingdom", "India", "United States"]),
  },
];
const shared = puzzles[0].items.map(it => it.name).filter(name => puzzles[1].items.some(it => it.name === name));
if (shared.length !== 1 || shared[0] !== "United States") throw new Error("shared " + shared.join(","));

const dataset = {
  id: "tdc-male-testosterone", title: "Serum Levels",
  stat: STAT, unit: "ng/dL",
  src: SOURCE, url: URL, year: YEAR, hi: "top",
  dec: 0, emoji: "🧪", fact: FACT_EAST, caveat: CAVEAT,
  sens: 0, coverage: "full",
  rows,
};

function splicePuzzle() {
  const file = path.join(root, "puzzles-data.js");
  let text = fs.readFileSync(file, "utf8");
  if (text.includes('"id":"male-testosterone"')) {
    console.log("puzzle already present");
    return;
  }
  const end = text.lastIndexOf("];");
  if (end < 0) throw new Error("puzzles array end missing");
  text = text.slice(0, end) + "," + puzzles.map(p => JSON.stringify(p)).join(",") + text.slice(end);
  fs.writeFileSync(file, text);
}

function spliceDataset() {
  const file = path.join(root, "practice-data.js");
  let text = fs.readFileSync(file, "utf8");
  if (text.includes('"id":"tdc-male-testosterone"')) {
    console.log("dataset already present");
    return;
  }
  const needle = '],"minTop5":';
  const at = text.indexOf(needle);
  if (at < 0) throw new Error("practice insert point missing");
  text = text.slice(0, at) + "," + JSON.stringify(dataset) + text.slice(at);
  fs.writeFileSync(file, text);
}

function appendCsv() {
  const file = path.join(root, "puzzles.csv");
  let text = fs.readFileSync(file, "utf8");
  if (text.includes("\nmale-testosterone,")) return;
  const header = text.replace(/^\uFEFF/, "").split("\n")[0];
  const fields = header.split(",");
  const q = v => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [];
  for (const puzzle of puzzles) {
    if (text.includes("\n" + puzzle.id + ",")) continue;
    puzzle.items.forEach((it, n) => {
      const row = {
        puzzle_id: puzzle.id,
        daily_order: n === 0 ? puzzle.order : "",
        puzzle_emoji: n === 0 ? puzzle.emoji : "",
        question: n === 0 ? puzzle.question : "",
        stat_label: n === 0 ? puzzle.stat : "",
        unit: n === 0 ? puzzle.unit : "",
        higher_is: n === 0 ? puzzle.higherIs : "",
        values_visible: n === 0 ? "no" : "",
        item_name: it.name,
        item_emoji: it.emoji,
        value: it.value,
        data_year: it.year || "",
        source_name: n === 0 ? puzzle.source : "",
        source_url: n === 0 ? puzzle.sourceUrl : "",
        fun_fact: n === 0 ? puzzle.fact : "",
        global_rank: it.gRank || "",
        global_total: it.gTotal || "",
        global_scope: it.gScope || "",
        art: n === 0 ? puzzle.art : "",
        support_url: "",
        dataset: n === 0 ? puzzle.dataset : "",
        series_title: "",
        headline: n === 0 ? puzzle.headline : "",
      };
      lines.push(fields.map(f => q(row[f] == null ? "" : row[f])).join(","));
    });
  }
  if (!lines.length) return;
  if (!text.endsWith("\n")) text += "\n";
  fs.writeFileSync(file, text + lines.join("\n") + "\n");
}

function appendXlsx() {
  const payload = [];
  for (const puzzle of puzzles) {
    puzzle.items.forEach((it, n) => {
      payload.push({
        id: puzzle.id,
        cells: n === 0 ? [
          ["B", puzzle.order], ["C", puzzle.emoji], ["D", puzzle.question], ["E", puzzle.stat],
          ["F", puzzle.unit], ["G", "top"], ["H", "no"], ["I", it.name], ["J", it.emoji],
          ["K", it.value], ["L", it.year || ""], ["M", puzzle.source], ["N", puzzle.sourceUrl],
          ["O", puzzle.fact], ["P", it.gRank], ["Q", it.gTotal], ["R", it.gScope],
          ["S", puzzle.art], ["U", puzzle.dataset], ["W", puzzle.headline],
        ] : [
          ["I", it.name], ["J", it.emoji], ["K", it.value], ["L", it.year || ""],
          ["P", it.gRank], ["Q", it.gTotal], ["R", it.gScope],
        ],
      });
    });
  }
  fs.writeFileSync("/tmp/rankd-t-xlsx.json", JSON.stringify(payload));
  const script = `
import json, re, zipfile
from pathlib import Path
xlsx = Path(${JSON.stringify(path.join(root, "puzzles.xlsx"))})
items = json.loads(Path("/tmp/rankd-t-xlsx.json").read_text())
def esc(s):
    return ("" if s is None else str(s)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def cell(col, row, text):
    if text is None or text == "":
        return ""
    return f'<c r="{col}{row}" t="inlineStr"><is><t>{esc(text)}</t></is></c>'
xml = None
with zipfile.ZipFile(xlsx) as book:
    stored = {info.filename: (info, book.read(info.filename)) for info in book.infolist()}
xml = stored["xl/worksheets/sheet1.xml"][1].decode("utf-8")
if "male-testosterone" in xml:
    print("xlsx already has the puzzle")
    raise SystemExit(0)
last = max(int(n) for n in re.findall(r'<row r="(\\d+)"', xml))
rows = []
for item in items:
    last += 1
    parts = [cell("A", last, item["id"])] + [cell(col, last, val) for col, val in item["cells"]]
    rows.append(f'<row r="{last}">' + "".join(parts) + "</row>")
xml = xml.replace("</sheetData>", "".join(rows) + "</sheetData>", 1)
dim = re.search(r'<dimension ref="([A-Z]+)1:([A-Z]+)(\\d+)"\\s*/>', xml)
if dim:
    xml = xml[:dim.start()] + f'<dimension ref="{dim.group(1)}1:{dim.group(2)}{last}" />' + xml[dim.end():]
stored["xl/worksheets/sheet1.xml"] = (stored["xl/worksheets/sheet1.xml"][0], xml.encode("utf-8"))
tmp = xlsx.with_suffix(".xlsx.tmp")
with zipfile.ZipFile(tmp, "w") as dest:
    for name, (info, data) in stored.items():
        dest.writestr(info, data)
tmp.replace(xlsx)
print("xlsx rows", len(rows))
`;
  execFileSync("python3", ["-c", script], { stdio: "inherit" });
}

splicePuzzle();
spliceDataset();
appendCsv();
appendXlsx();

const loaded = load("puzzles-data.js").RANKD_PUZZLES;
const ds = load("practice-data.js").RANKD_PRACTICE.datasets.find(d => d.id === "tdc-male-testosterone");
if (!ds || ds.rows.length !== total) throw new Error("row count");
for (const puzzle of puzzles) {
  const check = loaded.find(p => p.id === puzzle.id);
  if (!check) throw new Error("reload " + puzzle.id);
  console.log(check.id, check.items.map(it => `${it.name} ${it.value} #${it.gRank}/${it.gTotal}`).join(" | "));
}
console.log("countries", total, "usa", ds.rows.find(r => r[0] === "USA"));
