/* Three Tier it dailies after 2027-05-22, and one merged shampoo card
   on Who Invented It? (2027-05-18) plus a Bluetooth card so the day stays at 9.
   Idempotent. */
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

const practice = load("practice-data.js").RANKD_PRACTICE;
const C = practice.countries;
function country(iso) {
  if (!C[iso]) throw new Error("missing country " + iso);
  return C[iso][0];
}
function emoji(iso) { return C[iso][1]; }

const RAE = "https://dle.rae.es/chile";
const PERIOD = "https://www.cambridge.org/core/journals/language-and-cognition/article/women-blood-and-dangerous-things-sociocultural-variation-in-the-conceptualization-of-menstruation/237909774A715FADE12F617C349DF807";
const GLOTTO = "https://glottolog.org/";

const SLANG_FACT = "Spain's polla is a young hen and the vulgar word, so it sits with Britain's cock, the male chicken. Mexico's chile is the chili pepper, and the same academy lists that as a vulgar word for a penis in Mexico. South Korea's gochu, 고추, is that pepper, and the Korean dictionary's second sense is a little boy's penis. Italy's uccello is the ordinary word for a bird. Brazil's pinto is a chick. Vietnam's chim is a bird. Indonesia's burung is a bird, and the national dictionary's colloquial sense is the male genitals.";
const SLANG_SOURCE = "Royal Spanish Academy, Diccionario de la lengua española: chile is the chili and, marked vulgar for Mexico, El Salvador and Guatemala, a penis; polla is a vulgar word for a penis and also a young hen. National Institute of Korean Language, Korean Basic Dictionary, 고추: a red pepper, and figuratively a young boy's genitals. Oxford English Dictionary, cock, n.1: coarse slang for the penis, and the male bird. Treccani, uccello: a bird, and popularly the male organ. Michaelis, pinto: a young chicken, and colloquially a penis; Priberam marks that penis sense Brazilian and informal. Vietnamese Wiktionary, chim: a bird, and thông tục a penis. Badan Pengembangan dan Pembinaan Bahasa, KBBI, burung: a bird, and colloquially the male genitals. Thai Wiktionary lists phrik, พริก, as the chili plant, a jacana, and a snake, with no genital sense, so Thailand is off the board. French zizi is a childish word for a penis and does not mean a bird; coq was not entered as a penis sense. The United States uses cock as well and is not a second row.";
const SLANG_CAVEAT = "Partial list of eight countries. The other meaning of the word is a chili pepper or a bird. South Korea's gochu is the dictionary's word for a young boy's penis, not the adult vulgar word. Spain's polla is unmarked as a vulgar penis and as a young hen; in much of Latin America it is also a bet, which is why Mexico is chile. Thailand's phrik, French coq, and a Hebrew rooster word were not found as dictionary senses for a penis.";

const PERIOD_FACT = "China's 大姨妈 means big aunt, and the Netherlands says tante Rosa, Aunt Rose, so both are a visit. Germany's phrase is die rote Tante, the red aunt. The United States says Aunt Flo, and Flo is a pun on flow. France says les Anglais ont débarqué, the English have landed, because the coats were red. Denmark says kommunister i lysthuset, communists in the gazebo. Brazil says estar com o chico, which the dictionary defines as menstruating. Japan's 月のもの is the moon's thing, a name for the monthly cycle.";
const PERIOD_SOURCE = "Margot Vancauwenbergh and Karlien Franco, Women, blood, and dangerous things, Language and Cognition, 2023: Mandarin 大姨妈 'big aunt', German die rote Tante 'the red aunt', Dutch tante Rosa 'aunt Rose'. The paper's visitation example from the earlier literature is Auntie Flo. Wiktionary, Aunt Flo: a personification of menstruation, a pun on flow. French Wiktionary, les Anglais ont débarqué: familiar for the menses, cited from 1851 and 2004, from the red British coats. English Wiktionary, kommunister i lysthuset: slang for menstruation, cited from 1980, 1983 and 2016; lysthuset is a gazebo. Caldas Aulete, chico: Brazilian, vulgar, menstruation; estar com o chico means to be menstruating. Japanese Wikipedia, 月経, citing Suzuki Akiko, おんなの身体論 (Iwata Shoin, 2018), p. 47, for 月のもの as a traditional name. Norway, and a South African granny or aunt, were not found in a dictionary. Tante Rosa is the Dutch phrase in the 2023 study, so it is not the German row.";
const PERIOD_CAVEAT = "Partial list of eight countries. An aunt visit is 大姨妈, die rote Tante, tante Rosa, or Aunt Flo. The other tier is a different picture: red coats, communists in the gazebo, chico, or the moon's thing. Germany is die rote Tante. Japan is 月のもの, not an aunt. Norway and a South African granny were left off as unverified.";

const FAMILY_FACT = "Iran sorts with Germany because Persian is Indo-European, written in the Arabic script, while Arabic is Semitic. Hungary, Finland and Estonia are Uralic, beside Indo-European neighbors. Turkish and Kazakh are both Turkic, and Kazakh is still mainly written in Cyrillic, so it looks Slavic. Mongolia writes Mongolian in Cyrillic too, and Mongolian is Mongolic, so the script is the trap: it is not Slavic, and it is not Turkic like Kazakh. Vietnam's Latin letters are Austroasiatic, and Malta's are Afroasiatic, the same alphabet trap, and neither is on this board.";
const FAMILY_SOURCE = "Glottolog: German and Persian are Indo-European, Hungarian, Finnish and Estonian are Uralic, Turkish and Kazakh are Turkic, and Khalkha Mongolian is Mongolic. Mongolic is its own family, not a branch of Turkic. Wikipedia, Kazakh alphabets: Cyrillic is the script used in Kazakhstan; a 2017 decree ordered a Latin alphabet and in 2021 the deadline moved to 2031. Wikipedia, Mongolian Cyrillic alphabet: the script used for Mongolian in Mongolia. Persian is written in a Perso-Arabic alphabet. Vietnamese is Austroasiatic and Maltese is Semitic, inside Afroasiatic; both use the Latin alphabet and are named only in the fact.";
const FAMILY_CAVEAT = "Partial list of eight countries, each by its main or state language. Kazakh is the state language of Kazakhstan; Russian is co-official, and the row is Kazakh. Persian is the official language of Iran. Kazakh is still mainly written in Cyrillic while a Latin alphabet is being introduced. Vietnam and Malta are left off the board because Austroasiatic and Afroasiatic would be a fifth and sixth family.";

function tierPuzzle(spec) {
  const puzzle = {
    type: "tier", id: spec.id, order: spec.order, emoji: spec.emoji, headline: spec.headline,
    question: spec.question, stat: spec.stat, unit: spec.unit,
    source: spec.source, sourceUrl: spec.url, fact: spec.fact, art: "candle", support: "",
    dataset: spec.id, year: "",
    tiers: spec.tiers,
    items: spec.items.map(([iso, value, tierIndex]) => ({
      name: country(iso), emoji: emoji(iso), value, tierIndex, iso3: iso,
    })),
  };
  if (spec.sensitive) puzzle.sensitive = true;
  for (const tier of puzzle.tiers) {
    const words = tier.label.trim().split(/\s+/).filter(Boolean);
    if (words.length > 3) throw new Error("tier label too long: " + tier.label);
  }
  if (puzzle.items.length < 6 || puzzle.items.length > 8) throw new Error(spec.id + " country count");
  const seen = new Set();
  for (const it of puzzle.items) {
    if (seen.has(it.iso3)) throw new Error("duplicate " + it.iso3);
    seen.add(it.iso3);
    if (puzzle.tiers[it.tierIndex].value !== it.value) throw new Error("tier mismatch " + it.iso3);
  }
  return puzzle;
}

const slang = tierPuzzle({
  id: "pepper-or-bird", order: 230, emoji: "🌶️", headline: "Pepper or Bird",
  question: "Is their slang a chili pepper or a bird?",
  stat: "Slang for a penis, by the word's other meaning", unit: "kind of word",
  source: SLANG_SOURCE, url: RAE, fact: SLANG_FACT, sensitive: true,
  tiers: [{ label: "Chili pepper", value: 2 }, { label: "Bird", value: 1 }],
  items: [
    ["MEX", 2, 0], ["ITA", 1, 1], ["KOR", 2, 0], ["ESP", 1, 1],
    ["BRA", 1, 1], ["GBR", 1, 1], ["VNM", 1, 1], ["IDN", 1, 1],
  ],
});
const period = tierPuzzle({
  id: "period-euphemism", order: 231, emoji: "🔴", headline: "Aunt or Not",
  question: "Is the euphemism an aunt visiting?",
  stat: "Euphemism for a period", unit: "kind of phrase",
  source: PERIOD_SOURCE, url: PERIOD, fact: PERIOD_FACT, sensitive: true,
  tiers: [{ label: "An aunt visits", value: 2 }, { label: "Something else", value: 1 }],
  items: [
    ["CHN", 2, 0], ["FRA", 1, 1], ["DEU", 2, 0], ["DNK", 1, 1],
    ["NLD", 2, 0], ["BRA", 1, 1], ["USA", 2, 0], ["JPN", 1, 1],
  ],
});
const family = tierPuzzle({
  id: "language-family", order: 232, emoji: "🗣️", headline: "Language Families",
  question: "Which family is their main language in?",
  stat: "Family of the main or state language", unit: "language family",
  source: FAMILY_SOURCE, url: GLOTTO, fact: FAMILY_FACT, sensitive: false,
  tiers: [
    { label: "Indo-European", value: 4 },
    { label: "Uralic", value: 3 },
    { label: "Turkic", value: 2 },
    { label: "Mongolic", value: 1 },
  ],
  items: [
    ["DEU", 4, 0], ["HUN", 3, 1], ["TUR", 2, 2], ["MNG", 1, 3],
    ["IRN", 4, 0], ["FIN", 3, 1], ["KAZ", 2, 2], ["EST", 3, 1],
  ],
});
for (const [puzzle, min] of [[slang, 2], [period, 2]]) {
  const counts = puzzle.tiers.map((_, i) => puzzle.items.filter(it => it.tierIndex === i).length);
  if (counts.some(n => n < min)) throw new Error(puzzle.id + " needs two per tier " + counts.join(","));
}

function datasetOf(puzzle, caveat, labels) {
  return {
    id: puzzle.id, title: puzzle.headline, stat: puzzle.stat, unit: puzzle.unit,
    src: puzzle.source, url: puzzle.sourceUrl, year: "", hi: "top", dec: 0,
    emoji: puzzle.emoji, fact: puzzle.fact, caveat, sens: puzzle.sensitive ? 1 : 0,
    coverage: "partial", kind: "tier", question: puzzle.question, labels,
    rows: puzzle.items.map(it => [it.iso3, it.value]),
  };
}
const datasets = [
  datasetOf(slang, SLANG_CAVEAT, { "2": "Chili pepper", "1": "Bird" }),
  datasetOf(period, PERIOD_CAVEAT, { "2": "An aunt visits", "1": "Something else" }),
  datasetOf(family, FAMILY_CAVEAT, { "4": "Indo-European", "3": "Uralic", "2": "Turkic", "1": "Mongolic" }),
];

function spliceArray(file, marker, objects) {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, "utf8");
  const fresh = objects.filter(o => !text.includes('"id":"' + o.id + '"'));
  if (!fresh.length) { console.log("skip splice", file); return; }
  const idx = text.indexOf(marker);
  const end = text.indexOf("];", idx);
  if (idx < 0 || end < 0) throw new Error("splice point missing in " + file);
  const blob = fresh.map(o => JSON.stringify(o)).join(",");
  const prefix = text[end - 1] === "[" ? "" : ",";
  text = text.slice(0, end) + prefix + blob + text.slice(end);
  fs.writeFileSync(full, text);
}

function insertDatasets() {
  const full = path.join(root, "practice-data.js");
  let text = fs.readFileSync(full, "utf8");
  const fresh = datasets.filter(d => !text.includes('"id":"' + d.id + '"'));
  if (!fresh.length) { console.log("datasets already present"); return; }
  const needle = '],"minTop5":';
  const at = text.indexOf(needle);
  if (at < 0) throw new Error("practice insert point missing");
  text = text.slice(0, at) + "," + fresh.map(d => JSON.stringify(d)).join(",") + text.slice(at);
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
    if (text.includes("\n" + p.id + ",")) continue;
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

function appendXlsx(puzzles) {
  const { execFileSync } = require("child_process");
  const items = [];
  for (const puzzle of puzzles) {
    puzzle.items.forEach((it, n) => {
      const tier = puzzle.tiers[it.tierIndex];
      items.push({
        id: puzzle.id,
        cells: n === 0 ? [
          ["B", puzzle.order], ["C", puzzle.emoji], ["D", puzzle.headline], ["E", puzzle.question],
          ["F", puzzle.stat], ["G", puzzle.unit], ["H", puzzle.source], ["I", puzzle.sourceUrl],
          ["J", puzzle.fact], ["K", puzzle.art || ""], ["L", tier.value], ["M", tier.label],
          ["N", it.name], ["O", it.emoji], ["P", it.iso3], ["Q", it.value], ["R", puzzle.year || ""],
          ["S", puzzle.dataset],
        ] : [
          ["L", tier.value], ["M", tier.label], ["N", it.name], ["O", it.emoji], ["P", it.iso3], ["Q", it.value],
        ],
      });
    });
  }
  fs.writeFileSync("/tmp/rankd-tier-xlsx.json", JSON.stringify(items));
  const script = `
import json, re, zipfile
from pathlib import Path
root = Path(${JSON.stringify(root)})
xlsx = root / "puzzles.xlsx"
items = json.loads(Path("/tmp/rankd-tier-xlsx.json").read_text())
def esc(s):
    return ("" if s is None else str(s)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def cell(col, row, text):
    if text is None or text == "":
        return ""
    return f'<c r="{col}{row}" t="inlineStr"><is><t>{esc(text)}</t></is></c>'
xml = zipfile.ZipFile(xlsx).read("xl/worksheets/sheet7.xml").decode("utf-8")
if "pepper-or-bird" in xml:
    print("xlsx already has the puzzles")
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

function replaceJsonArray(text, marker, key, value) {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error("missing marker " + marker);
  const keyAt = text.indexOf('"' + key + '":', at);
  const bracket = text.indexOf("[", keyAt);
  if (keyAt < 0 || bracket < 0) throw new Error("missing " + key + " after " + marker);
  let depth = 0, inStr = false, esc = false;
  for (let i = bracket; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0 && c === "]") return text.slice(0, bracket) + JSON.stringify(value) + text.slice(i + 1);
    }
  }
  throw new Error("unterminated " + key);
}

function patchQuiz() {
  const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
  const quiz = puzzles.find(p => p.id === "who-invented-it");
  if (!quiz) throw new Error("quiz missing");
  if (!quiz.questions.some(q => q.id === "shampoo-treatment")) {
    console.log("quiz already merged");
    return;
  }
  const word = quiz.questions.find(q => q.id === "shampoo-word");
  const ketchup = quiz.questions.find(q => q.id === "ketchup");
  const shampoo = {
    ...word,
    id: "shampoo",
    fact: "Shampoo is Hindi chāmpo, to press or knead, which is why an English word looks British. Sake Dean Mahomed, from Patna, opened Indian vapour baths in Brighton in 1814 and worked oils into the scalp. Poured soap came later in Europe.",
    source: "Etymonline, shampoo; Wikipedia, Sake Dean Mahomed",
    sourceUrl: "https://www.etymonline.com/word/shampoo",
  };
  const bluetooth = {
    id: "bluetooth",
    prompt: "Bluetooth",
    ask: "Ericsson developed the short-range radio that became Bluetooth in which country?",
    answer: "SWE",
    options: ["DNK", "FIN", "SWE", "USA"].map(iso => ({ iso3: iso, name: country(iso), emoji: emoji(iso) })),
    fact: "The name is Denmark's king, Harald Bluetooth, which is why Denmark looks right. In the summer of 1994 Jaap Haartsen moved to Lund, where Ericsson had him build a short-range radio. Nokia joined later from Finland, and Intel and IBM from the United States.",
    source: "Jaap Haartsen, How we made Bluetooth, Nature Electronics, 2018; Bluetooth SIG, Origin of the name",
    sourceUrl: "https://doi.org/10.1038/s41928-018-0186-x",
  };
  const questions = [...quiz.questions.slice(0, 6), shampoo, bluetooth, ketchup];
  if (questions.length !== 9) throw new Error("quiz count " + questions.length);
  const oldFact = quiz.fact;
  const newFact = oldFact + " Bluetooth is named for a Danish king, and Ericsson developed it in Sweden.";
  const rows = questions.map((q, i) => [q.answer, i + 1, q.prompt]);

  for (const file of ["puzzles-data.js", "practice-data.js"]) {
    let text = fs.readFileSync(path.join(root, file), "utf8");
    const hits = text.split(oldFact).length - 1;
    if (hits < 1) throw new Error("fact missing in " + file);
    text = text.split(oldFact).join(newFact);
    text = replaceJsonArray(text, '"id":"who-invented-it"', "questions", questions);
    if (file === "practice-data.js") text = replaceJsonArray(text, '"id":"who-invented-it"', "rows", rows);
    if (text.includes("shampoo-treatment") || text.includes("shampoo-word")) throw new Error("old shampoo ids remain in " + file);
    fs.writeFileSync(path.join(root, file), text);
  }
  const csvPath = path.join(root, "puzzles.csv");
  let csv = fs.readFileSync(csvPath, "utf8");
  if (!csv.includes(oldFact)) throw new Error("fact missing in csv");
  fs.writeFileSync(csvPath, csv.split(oldFact).join(newFact));
  console.log("merged shampoo, added bluetooth");
}

const puzzles = [slang, period, family];
spliceArray("puzzles-data.js", "RANKD_PUZZLES = ", puzzles);
insertDatasets();
appendTierCsv(puzzles);
appendXlsx(puzzles);
patchQuiz();
console.log(puzzles.map(p => p.id + " " + p.order + " " + p.items.map(it => it.iso3).join(",")).join("\n"));
