/* Daily for 2027-05-17: tier countries by where the main language's weekday
   names come from. Idempotent. Classifications follow Wikipedia,
   "Names of the days of the week". Mixed systems stay off the board. */
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
function country(iso) {
  if (!C[iso]) throw new Error("missing country " + iso);
  return C[iso][0];
}
function emoji(iso) { return C[iso][1]; }

const WIKI = "https://en.wikipedia.org/wiki/Names_of_the_days_of_the_week";
const FACT = "Portugal is the odd one out beside France: segunda-feira means second day, because Martin of Braga refused pagan god names and counted Monday as the second church feria, while French mardi is still Mars. India's Monday is Somvar, the moon, the same planet week as English. Vietnam also says second, thứ hai, while China's Monday is 星期一, week one, and Japan's Tuesday is 火曜日, Mars written as the element fire. Korean 화요일 is that same fire.";
const SOURCE = "Wikipedia, Names of the days of the week. English Sunday through Saturday are the sun, the moon, Tiw, Woden, Thor, Frigg, and Saturn. French Monday through Friday are the planets (mardi is Mars); dimanche and samedi are Lord's Day and Sabbath. Hindi names all seven for planets (Somvār, सोमवार, is the moon). Portuguese Monday through Friday are numbered ferias because Martin of Braga, archbishop of Braga (died 580), rejected the pagan names; domingo and sábado stay Lord's Day and Sabbath. Standard Chinese numbers Monday through Saturday (星期一 is week one) and Sunday is 星期日, the sun. Vietnamese numbers Monday through Saturday, and Monday, thứ hai, is second; Sunday is chủ nhật, Lord's Day. Japanese and Korean keep the seven luminaries, so Tuesday is fire: Japanese 火曜日 and Korean 화요일, the planet Mars. Greek, Russian, and Persian are left off as mixed: Greek numbers only Monday through Thursday, then Paraskevi and the Sabbath; Russian numbers only Tuesday, Thursday, and Friday; Persian numbers Sunday through Thursday from the Sabbath, and Friday is jom'e.";
const CAVEAT = "Partial list of eight countries, each by its main language. Hindi is used for India. Standard Chinese Sunday is 星期日, the sun, not a number. Vietnamese Sunday is chủ nhật, Lord's Day, and Monday is thứ hai, second. Greek, Russian, and Persian are excluded as mixed: Greek numbers only Monday through Thursday, then Paraskevi and the Sabbath; Russian numbers only Tuesday, Thursday, and Friday; Persian numbers Sunday through Thursday from the Sabbath and calls Friday jom'e. German Mittwoch means mid-week and Samstag comes from Sabbath, so Germany is not the planetary example. Brazilian Portuguese matches Portugal and is not a second row.";

const puzzle = {
  type: "tier", id: "weekday-name-origin", order: 224, emoji: "📅", headline: "Day Names",
  question: "Where do their weekday names come from?",
  stat: "Origin of the weekday names", unit: "naming system",
  source: SOURCE, sourceUrl: WIKI, fact: FACT, art: "candle", support: "",
  dataset: "weekday-name-origin", year: "",
  tiers: [
    { label: "Gods & planets", value: 3 },
    { label: "Numbers", value: 2 },
    { label: "Elements", value: 1 },
  ],
  items: [
    ["GBR", 3, 0], ["VNM", 2, 1], ["JPN", 1, 2], ["IND", 3, 0],
    ["CHN", 2, 1], ["FRA", 3, 0], ["KOR", 1, 2], ["PRT", 2, 1],
  ].map(([iso, value, tierIndex]) => ({ name: country(iso), emoji: emoji(iso), value, tierIndex, iso3: iso })),
};

for (const tier of puzzle.tiers) {
  const words = tier.label.trim().split(/\s+/).filter(Boolean);
  if (words.length > 3) throw new Error("tier label too long: " + tier.label);
}
if (puzzle.items.length < 6 || puzzle.items.length > 8) throw new Error("country count");
const perTier = puzzle.tiers.map((_, i) => puzzle.items.filter(it => it.tierIndex === i).length);
if (perTier.some(n => n < 2)) throw new Error("need two countries per tier " + perTier.join(","));

function dataset() {
  return {
    id: "weekday-name-origin", title: "Day Names",
    stat: puzzle.stat, unit: puzzle.unit, src: SOURCE, url: WIKI, year: "",
    hi: "top", dec: 0, emoji: "📅", fact: FACT, caveat: CAVEAT,
    sens: 0, coverage: "partial", kind: "tier",
    question: puzzle.question,
    labels: { "3": "Gods & planets", "2": "Numbers", "1": "Elements" },
    rows: puzzle.items.map(it => [it.iso3, it.value]),
  };
}

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
  const spec = dataset();
  if (text.includes('"id":"' + spec.id + '"')) { console.log("dataset already present"); return; }
  const needle = '],"minTop5":';
  const at = text.indexOf(needle);
  if (at < 0) throw new Error("practice insert point missing");
  fs.writeFileSync(path.join(root, "practice-data.js"), text.slice(0, at) + "," + JSON.stringify(spec) + text.slice(at));
}

function appendXlsx() {
  const { execFileSync } = require("child_process");
  const items = puzzle.items.map((it, n) => {
    const tier = puzzle.tiers[it.tierIndex];
    return {
      id: puzzle.id,
      first: n === 0,
      cells: n === 0 ? [
        ["B", puzzle.order], ["C", puzzle.emoji], ["D", puzzle.headline], ["E", puzzle.question],
        ["F", puzzle.stat], ["G", puzzle.unit], ["H", puzzle.source], ["I", puzzle.sourceUrl],
        ["J", puzzle.fact], ["K", puzzle.art || ""], ["L", tier.value], ["M", tier.label],
        ["N", it.name], ["O", it.emoji], ["P", it.iso3], ["Q", it.value], ["R", puzzle.year || ""],
        ["S", puzzle.dataset],
      ] : [
        ["L", tier.value], ["M", tier.label], ["N", it.name], ["O", it.emoji], ["P", it.iso3], ["Q", it.value],
      ],
    };
  });
  fs.writeFileSync("/tmp/rankd-weekday-xlsx.json", JSON.stringify(items));
  const script = `
import json, re, zipfile
from pathlib import Path
root = Path(${JSON.stringify(root)})
xlsx = root / "puzzles.xlsx"
items = json.loads(Path("/tmp/rankd-weekday-xlsx.json").read_text())
def esc(s):
    return ("" if s is None else str(s)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def cell(col, row, text):
    if text is None or text == "":
        return ""
    return f'<c r="{col}{row}" t="inlineStr"><is><t>{esc(text)}</t></is></c>'
xml = zipfile.ZipFile(xlsx).read("xl/worksheets/sheet7.xml").decode("utf-8")
if "weekday-name-origin" in xml:
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
tmp = xlsx.with_suffix(".xlsx.tmp")
with zipfile.ZipFile(xlsx) as book, zipfile.ZipFile(tmp, "w") as dest:
    for info in book.infolist():
        data = xml.encode("utf-8") if info.filename == "xl/worksheets/sheet7.xml" else book.read(info.filename)
        dest.writestr(info, data)
tmp.replace(xlsx)
print("xlsx tier rows", len(rows))
`;
  execFileSync("python3", ["-c", script], { stdio: "inherit" });
}

spliceArray("puzzles-data.js", "RANKD_PUZZLES = ", [puzzle]);
appendTierCsv([puzzle]);
insertDatasets();
appendXlsx();
console.log("wrote weekday-name-origin", puzzle.items.map(it => it.iso3 + ":" + puzzle.tiers[it.tierIndex].label).join(", "));
