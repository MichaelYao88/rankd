/* Three Who Invented It? dailies, 2027-05-18 through 2027-05-20.
   Eight questions each. Idempotent: replaces any earlier copy of these ids.
   Dropped: the dinner fork (Egypt, China, and the Byzantine court in today's
   Turkey and Greece all have a real claim). Clinical trials are al-Razi in
   Iran, not Ibn Sina. See the facts for the other rewordings. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const practiceText = fs.readFileSync(path.join(root, "practice-data.js"), "utf8");
const practice = JSON.parse(practiceText.slice(practiceText.indexOf("{")).replace(/;\s*$/, ""));
const C = practice.countries;
function place(iso) {
  if (!C[iso]) throw new Error("missing country " + iso);
  return { iso3: iso, name: C[iso][0], emoji: C[iso][1] };
}
function opts(isos) {
  const rows = isos.map(place);
  if (new Set(rows.map(r => r.iso3)).size !== 4) throw new Error("need 4 countries " + isos.join(","));
  return rows;
}
function card(id, prompt, ask, answer, isos, fact, source, sourceUrl) {
  return { id, prompt, ask, answer, options: opts(isos), fact, source, sourceUrl };
}

const CAVEAT = "One shot per question. The card says exactly what is being asked, and the reveal names the rival claim.";

const day1 = [
  card("emoji", "Emoji", "Which country invented emoji?", "JPN", ["USA", "JPN", "KOR", "SWE"],
    "SoftBank shipped 90 emoji in 1997, and Shigetaka Kurita drew 176 for NTT Docomo in 1999. The set in the museum is not the first, but both are Japanese. American emoticons and Korean stickers came from somewhere else.",
    "Emojipedia, Correcting the Record on the First Emoji Set; MoMA, Shigetaka Kurita, Emoji, 1998–1999",
    "https://blog.emojipedia.org/correcting-the-record-on-the-first-emoji-set/"),
  card("qr", "The QR code", "Which country invented the QR code?", "JPN", ["USA", "DEU", "JPN", "KOR"],
    "Masahiro Hara at Denso in Japan built the QR code in 1994 so a factory scanner could hold more than a barcode, including kanji. The barcode it replaced was American, which is why the United States looks right.",
    "Japan Patent Office, QR Code (Denso)",
    "https://www.jpo.go.jp/e/news/koho/innovation/01_qrcode_e.html"),
  card("spotify", "Spotify", "Which country started Spotify?", "SWE", ["USA", "SWE", "NOR", "KOR"],
    "Daniel Ek and Martin Lorentzon started Spotify in Stockholm in 2006. The United States is where streaming got huge, which is why it looks like the answer, and Norway is the Scandinavian trap.",
    "Wikipedia, Spotify",
    "https://en.wikipedia.org/wiki/Spotify"),
  card("webcam", "The coffee-pot camera that became the first webcam", "Which country set up the coffee-pot camera that became the first webcam?", "GBR", ["USA", "CHE", "GBR", "JPN"],
    "In 1991 Quentin Stafford-Fraser and Paul Jardetzky pointed a camera at the Trojan Room coffee pot in Cambridge so they would not climb the stairs for an empty pot. It became a webcam in 1993, still in Cambridge, when the same pot went on the web. The web itself started in Switzerland, which is the trap.",
    "University of Cambridge Computer Laboratory, Trojan Room coffee pot timeline",
    "https://www.cl.cam.ac.uk/coffee/qsf/timeline.html"),
  card("usb-flash", "The first patent for a USB flash disk", "Which country filed the first patent for a USB flash disk?", "ISR", ["ISR", "SGP", "USA", "CHN"],
    "M-Systems in Israel filed that patent in April 1999, and it still described a cable. Singapore's Trek sold the ThumbDrive in 2000, the first one you plug straight in. IBM then sold the Israeli design in the United States as the DiskOnKey.",
    "The New Yorker, Object of Interest: The Flash Drive",
    "https://www.newyorker.com/tech/annals-of-technology/object-of-interest-the-flash-drive"),
  card("gasoline-car", "The first gasoline car", "Which country built the first gasoline car, Benz's Patent-Motorwagen of 1886?", "DEU", ["FRA", "DEU", "USA", "GBR"],
    "Karl Benz built the Patent-Motorwagen in Mannheim in 1886, a gasoline tricycle with a patent. Nicolas-Joseph Cugnot's 1769 wagon was French, and it was steam, which is why France looks right.",
    "Encyclopaedia Britannica, Karl Benz",
    "https://www.britannica.com/biography/Karl-Benz"),
  card("shampoo", "The word shampoo, and the hair treatment that came with it", "Which country gave English the word shampoo, and the hair treatment that came with it?", "IND", ["FRA", "IND", "GBR", "DEU"],
    "Shampoo is Hindi chāmpo, press or knead. Sake Dean Mahomed, from Patna, opened his Indian vapour baths in Brighton in 1814 and shampooed with Indian oils. Soap you pour on your hair came later in Europe, which is why Germany looks right.",
    "Etymonline, shampoo; Royal College of Surgeons of England, Sake Dean Mahomed",
    "https://www.etymonline.com/word/shampoo"),
  card("ketchup", "The fermented sauce that became ketchup", "Which country made the fermented sauce that became ketchup?", "CHN", ["USA", "VNM", "CHN", "GBR"],
    "Tomato ketchup is American, and British mushroom ketchup is a later pickle. The name is Amoy Chinese kê-tsiap, a brine of pickled fish, which Malay borrowed as kecap. Vietnam's fish sauce is a cousin, not where the word started.",
    "Collins English Dictionary, ketchup, from Amoy Chinese kōetsiap",
    "https://www.collinsdictionary.com/dictionary/english/ketchup"),
];

const day2 = [
  card("toothbrush", "The bristle toothbrush", "Which country invented the bristle toothbrush?", "CHN", ["EGY", "GBR", "USA", "CHN"],
    "Hog-bristle brushes are Chinese. The Smithsonian puts bone-handled ones in the Tang dynasty, and the Library of Congress dates a written one to 1498. William Addis in England mass-produced them around 1780. Egyptian chew sticks are older, and they are not brushes.",
    "Library of Congress, Who invented the toothbrush?; Smithsonian National Museum of American History",
    "https://www.loc.gov/item/who-invented-the-toothbrush-and-when-was-it-invented/"),
  card("playing-cards", "Playing cards", "Which country invented paper playing cards?", "CHN", ["ITA", "IND", "CHN", "EGY"],
    "Paper playing cards show up in China in the Tang dynasty. European packs, including the Italian ones, are a later import, which is why Italy looks right.",
    "Wikipedia, Playing card",
    "https://en.wikipedia.org/wiki/Playing_card"),
  card("umbrella", "The collapsible umbrella", "Which country invented the collapsible umbrella, the one with ribs that fold?", "CHN", ["EGY", "GBR", "CHN", "FRA"],
    "Fixed sunshades are older in Egypt and Mesopotamia. The folding frame, with ribs that close, is the Chinese umbrella. Britain's steel-rib umbrellas are a later factory version.",
    "Wikipedia, Umbrella",
    "https://en.wikipedia.org/wiki/Umbrella"),
  card("anesthesia", "The first recorded surgery under a general anesthetic", "Which country recorded the first surgery under a general anesthetic, in 1804?", "JPN", ["USA", "CHN", "JPN", "GBR"],
    "Hanaoka Seishu, in Kishu, removed a breast tumor on 13 October 1804 after a herbal drink, mafutsusan. The public ether demonstration was in Boston in 1846, which is why the United States looks right. Hua Tuo in China is said to have used a similar drink, but no dated case like Hanaoka's survives.",
    "Japanese Society of Anesthesiologists, History",
    "https://anesth.or.jp/users/english/about_jsa/history"),
  card("chess", "The game that became chess", "Which country invented the game that became chess?", "IND", ["IND", "IRN", "CHN", "GRC"],
    "The pieces Western chess still uses started in India as chaturanga. Persia renamed it shatranj, so Iran looks like the source, and Europe learned the game from there. China's xiangqi is a cousin, with a river and cannons, not the parent.",
    "Encyclopaedia Britannica, Chess",
    "https://www.britannica.com/topic/chess"),
  card("rhinoplasty", "Rebuilding a nose from a flap of skin", "Which country first wrote down rebuilding a nose from a flap of skin?", "IND", ["ITA", "EGY", "GBR", "IND"],
    "The Sushruta Samhita, the old Indian surgical text, describes rebuilding a nose from a flap of skin. British surgeons then copied the operation they saw in India: the 1794 report of Cowasjee, and Joseph Carpue's London book in 1816.",
    "Wikipedia, Sushruta Samhita",
    "https://en.wikipedia.org/wiki/Sushruta_Samhita"),
  card("rope-bridge", "The Inca grass-rope suspension bridges", "Which country built the grass-rope suspension bridges on the Inca roads?", "PER", ["CHN", "PER", "MEX", "ESP"],
    "The Inca hung grass-rope bridges across Andean gorges, and one is still rebuilt every year in Peru. China had vine bridges, and later iron-chain bridges, many centuries earlier, so this is not the world's first suspension bridge.",
    "Wikipedia, Inca rope bridge",
    "https://en.wikipedia.org/wiki/Inca_rope_bridge"),
  card("windmill", "The vertical-axis windmills at Nashtifan", "Which country built the ancient vertical-axis windmills still standing at Nashtifan?", "IRN", ["NLD", "CHN", "IRN", "ESP"],
    "Nashtifan, in eastern Iran, still grinds grain with vertical-shaft windmills, the early Persian kind. Dutch tower mills are a later design that turns to face the wind, which is why the Netherlands looks right.",
    "Wikipedia, Nashtifan windmills",
    "https://en.wikipedia.org/wiki/Nashtifan_windmills"),
];

const day3 = [
  card("mobile-money", "The mobile-money service later ones copied", "Which country launched the mobile-money service that later ones copied?", "KEN", ["PHL", "KEN", "GBR", "IND"],
    "The Philippines launched Smart Money in 2001, with a payment card and a bank partner. Kenya's M-Pesa, from Safaricom in March 2007, let people put cash in and take it out through agents, with no bank account, and later services copied that. Vodafone is British, which is why the UK is the trap.",
    "UNCDF, Where in the World is Mobile Money Prominent?; GSMA, Mobile Money in the Philippines (Smart Money, 2001)",
    "https://www.uncdf.org/article/7904/where-in-the-world-is-mobile-money-prominent"),
  card("variolation", "The smallpox inoculation that reached Britain", "Variolation, the older smallpox inoculation, reached Britain from which country?", "TUR", ["CHN", "IND", "TUR", "GBR"],
    "Lady Mary Wortley Montagu saw Ottoman inoculation in Constantinople and pushed it in England in the 1720s. China and India had practiced variolation earlier, which is why they look right. Edward Jenner's cowpox vaccine was English, in 1796.",
    "Encyclopaedia Britannica, Lady Mary Wortley Montagu",
    "https://www.britannica.com/biography/Lady-Mary-Wortley-Montagu"),
  card("quarantine", "The first law keeping plague ships out", "Which country passed the first law that kept people from a plague port outside the city, in 1377?", "HRV", ["ITA", "HRV", "FRA", "GBR"],
    "Ragusa, today's Dubrovnik, ordered 30 days outside the city on 27 July 1377. The word quarantine is Italian for 40 days, the stretch Venice used later, and Venice opened a permanent plague island in 1423. That is why Italy looks like the answer.",
    "CDC Emerging Infectious Diseases, The Old Port of Dubrovnik",
    "https://wwwnc.cdc.gov/eid/article/8/1/ac-0801_article"),
  card("algorithm", "The word algorithm", "The word algorithm comes from the name of the Persian mathematician al-Khwarizmi. Which country is that?", "IRN", ["IRN", "GRC", "IND", "EGY"],
    "Latin algorismus is al-Khwarizmi's name, and historians call him Persian. He was born in Khwarazm, in today's Uzbekistan, and he wrote his algebra in Baghdad, in today's Iraq. Greece, India and Egypt have older mathematics, which is why they look right.",
    "Encyclopaedia Britannica, al-Khwarizmi",
    "https://www.britannica.com/biography/al-Khwarizmi"),
  card("cheque", "The word cheque", "The word cheque comes from the Arabic sakk, a written order to pay, used in the Abbasid capital. Which country is that capital in today?", "IRQ", ["IRN", "IRQ", "ITA", "GBR"],
    "Sakk were paper orders to pay, and the Abbasid capital was Baghdad, in today's Iraq. The caliphate also ruled Persia, today's Iran, which is why Iran looks right. Italian banks and British cheques came later.",
    "Wikipedia, Cheque",
    "https://en.wikipedia.org/wiki/Cheque"),
  card("clinical-trial", "The first written test that left a group untreated", "Which country was home to the physician who first wrote that he treated one group and left another untreated?", "IRN", ["GBR", "UZB", "IRN", "FRA"],
    "Al-Razi, in Rayy, now part of Tehran, wrote that he bled one group of patients and deliberately left another, to see who developed meningitis. Ibn Sina, born near Bukhara in today's Uzbekistan, later wrote rules for judging a single drug. James Lind's scurvy trial, the one British textbooks call the first, was in 1747.",
    "PMC, Experimental medicine 1000 years ago",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC3130477/"),
  card("oldest-school", "The oldest school still open, by Guinness", "Guinness calls the oldest school still open, founded in 859, in which country?", "MAR", ["ITA", "EGY", "MAR", "TUN"],
    "Guinness calls the University of al-Qarawiyyin in Fez, founded in 859, the oldest existing school still operating. Bologna, founded in 1088, is the oldest in Europe, which is why Italy looks right. UNESCO's Fez listing also calls it the oldest university. Some historians say it was a mosque school until Morocco made it a state university in 1963.",
    "Guinness World Records, Oldest higher-learning institution",
    "https://www.guinnessworldrecords.com/world-records/oldest-university"),
  card("paper-money", "The first government paper money", "Which country issued the first government paper money?", "CHN", ["SWE", "USA", "CHN", "ITA"],
    "Song-dynasty China issued jiaozi, notes you could spend. Tang flying cash was a deposit receipt, not that note. Sweden's Stockholms Banco printed Europe's first banknotes in 1661, which is why Sweden looks right.",
    "Encyclopaedia Britannica, jiaozi",
    "https://www.britannica.com/topic/jiaozi"),
];

const DAYS = [
  {
    id: "who-invented-it", order: 225, headline: "Who Invented It?",
    question: "Four countries. One answer.",
    fact: "Japan takes emoji and the QR code, but Spotify is Swedish and the gasoline car is German. The first patent for a USB flash disk was filed in Israel, while Singapore sold the first one you plug straight in.",
    lead: "Emojipedia, on the first emoji set; every other card links its own source",
    url: day1[0].sourceUrl,
    questions: day1,
  },
  {
    id: "who-invented-older", order: 226, headline: "Older Than It Looks",
    question: "Four countries. One answer.",
    fact: "China has the bristle toothbrush, paper playing cards and the folding umbrella. The grass-rope bridges still rebuilt in the Andes are Peruvian, and China had vine and iron-chain bridges long before them.",
    lead: "Library of Congress, on the bristle toothbrush; every other card links its own source",
    url: day2[0].sourceUrl,
    questions: day2,
  },
  {
    id: "who-invented-words", order: 227, headline: "The Word Came Later",
    question: "Four countries. One answer.",
    fact: "The word quarantine is Italian, for 40 days, but the first law that kept plague ships out was passed in Croatia. Guinness puts the oldest school still open in Morocco, and Bologna is the oldest in Europe.",
    lead: "UNCDF, on the mobile-money service later countries copied; every other card links its own source",
    url: day3[0].sourceUrl,
    questions: day3,
  },
];

const IDS = new Set(DAYS.map(d => d.id));

function puzzleOf(day) {
  for (const q of day.questions) {
    if (q.options.length !== 4) throw new Error(q.id);
    if (!q.options.some(o => o.iso3 === q.answer)) throw new Error("answer " + q.id);
    if (!q.fact || !q.sourceUrl.startsWith("https://")) throw new Error("source " + q.id);
  }
  if (day.questions.length !== 8) throw new Error(day.id + " count");
  return {
    type: "quiz", id: day.id, order: day.order, emoji: "💡", headline: day.headline,
    question: day.question, stat: "One shot each, then the fact", unit: "",
    source: day.lead, sourceUrl: day.url, fact: day.fact, caveat: CAVEAT,
    art: "sun", support: "", dataset: day.id, year: "", questions: day.questions,
  };
}
function datasetOf(day, puzzle) {
  return {
    id: day.id, title: day.headline, stat: puzzle.stat, unit: "correct answers",
    src: puzzle.source, url: puzzle.sourceUrl, year: "", hi: "top", dec: 0,
    emoji: "💡", fact: puzzle.fact, caveat: CAVEAT, sens: 0, coverage: "full",
    kind: "quiz", question: puzzle.question, questions: day.questions,
    rows: day.questions.map((q, i) => [q.answer, i + 1, q.prompt]),
  };
}

const puzzles = DAYS.map(puzzleOf);
const datasets = DAYS.map((day, i) => datasetOf(day, puzzles[i]));

function splicePuzzles() {
  const file = path.join(root, "puzzles-data.js");
  let text = fs.readFileSync(file, "utf8");
  const marker = '{"type":"quiz","id":"who-invented-it"';
  const obj = text.lastIndexOf(marker);
  const at = obj > 0 && text[obj - 1] === "," ? obj - 1 : obj;
  const end = text.lastIndexOf("]");
  if (at < 0 || end < at) throw new Error("quiz puzzle marker missing");
  const blob = puzzles.map(p => JSON.stringify(p)).join(",");
  text = text.slice(0, at) + "," + blob + text.slice(end);
  fs.writeFileSync(file, text);
}

function splicePractice() {
  const file = path.join(root, "practice-data.js");
  let text = fs.readFileSync(file, "utf8");
  const needle = '],"minTop5":';
  const end = text.indexOf(needle);
  const at = text.lastIndexOf(',{"id":"who-invented-it"', end);
  if (at < 0 || end < 0) throw new Error("quiz dataset marker missing");
  const blob = datasets.map(d => JSON.stringify(d)).join(",");
  text = text.slice(0, at) + "," + blob + text.slice(end);
  fs.writeFileSync(file, text);
}

splicePuzzles();
splicePractice();

function rewriteCsv() {
  const file = path.join(root, "puzzles.csv");
  const lines = fs.readFileSync(file, "utf8").split(/\n/);
  const kept = lines.filter(line => !/^who-invented-(it|older|words),/.test(line));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  const rows = puzzles.map(p => [
    p.id, String(p.order), p.emoji, p.question, p.stat, "", "top", "no",
    "", "", "", "", p.source, p.sourceUrl, p.fact, "", "", "", "sun", "", p.dataset, "", p.headline,
  ]);
  const out = [];
  function quote(v) {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  for (const row of rows) out.push(row.map(quote).join(","));
  fs.writeFileSync(file, kept.join("\n") + "\n" + out.join("\n") + "\n");
}

function rewriteXlsx() {
  const { execFileSync } = require("child_process");
  const payload = puzzles.map(p => ({ id: p.id, order: p.order }));
  fs.writeFileSync("/tmp/rankd-quiz-xlsx.json", JSON.stringify(payload));
  execFileSync("python3", ["-c", `
import json, re, zipfile
from pathlib import Path
root = Path(${JSON.stringify(root)})
xlsx = root / "puzzles.xlsx"
items = json.loads(Path("/tmp/rankd-quiz-xlsx.json").read_text())
ids = {item["id"] for item in items}
xml = zipfile.ZipFile(xlsx).read("xl/worksheets/sheet1.xml").decode("utf-8")
xml = re.sub(r'<row r="\\d+"><c r="A\\d+" t="inlineStr"><is><t>(?:who-invented-it|who-invented-older|who-invented-words)</t></is></c>.*?</row>', "", xml)
last = max(int(n) for n in re.findall(r'<row r="(\\d+)"', xml))
rows = []
for item in items:
    last += 1
    rows.append(
        f'<row r="{last}"><c r="A{last}" t="inlineStr"><is><t>{item["id"]}</t></is></c>'
        f'<c r="B{last}" t="inlineStr"><is><t>{item["order"]}</t></is></c></row>'
    )
xml = xml.replace("</sheetData>", "".join(rows) + "</sheetData>", 1)
dim = re.search(r'<dimension ref="([A-Z]+)1:([A-Z]+)(\\d+)"\\s*/>', xml)
if dim:
    xml = xml[:dim.start()] + f'<dimension ref="{dim.group(1)}1:{dim.group(2)}{last}" />' + xml[dim.end():]
tmp = xlsx.with_suffix(".xlsx.tmp")
with zipfile.ZipFile(xlsx) as book, zipfile.ZipFile(tmp, "w") as dest:
    for info in book.infolist():
        data = xml.encode("utf-8") if info.filename == "xl/worksheets/sheet1.xml" else book.read(info.filename)
        dest.writestr(info, data)
tmp.replace(xlsx)
print("xlsx rows", len(rows), "last", last)
`], { stdio: "inherit" });
}

rewriteCsv();
rewriteXlsx();
console.log(puzzles.map(p => p.id + " " + p.order + " " + p.questions.map(q => q.answer).join(",")).join("\n"));
