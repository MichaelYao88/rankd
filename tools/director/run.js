/* Score written expectations against a real series. See PLAYBOOK.md. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "..");
const expect = JSON.parse(fs.readFileSync(path.join(__dirname, "expectations.json"), "utf8"));

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), "utf8"), box, { filename: file });
  return box.window;
}

const practice = load("practice-data.js").RANKD_PRACTICE;
const byName = new Map(Object.entries(practice.countries).map(([iso, row]) => [row[0], iso]));

function series(id) {
  const ds = practice.datasets.find(d => d.id === id);
  if (!ds) return null;
  const rows = ds.rows.map(r => ({
    iso: r[0],
    name: practice.countries[r[0]] ? practice.countries[r[0]][0] : r[0],
    value: Number(r[1]),
  })).filter(r => Number.isFinite(r.value) && practice.countries[r.iso]);
  rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const rank = new Map();
  rows.forEach((r, i) => rank.set(r.name, { name: r.name, rank: i + 1, value: r.value, n: rows.length }));
  return { rows, rank, n: rows.length };
}

function scoreOne(found, n, kind) {
  if (!found) return null;
  if (kind === "high") return (found.rank - 1) / Math.max(1, n - 1);
  if (kind === "low") return (n - found.rank) / Math.max(1, n - 1);
  return 0;
}

const lines = ["# Director report", "", "Neither lens is shown to players. A higher surprise score means the real rank is further from that lens.", ""];
const surprises = [];
const LENSES = [
  ["conventional", "Conventional", "expectHigh", "expectLow"],
  ["paternalistic", "Paternalistic", "paternalisticHigh", "paternalisticLow"],
];

for (const [id, spec] of Object.entries(expect.stats)) {
  const data = series(id);
  lines.push("## " + (spec.label || id), "");
  if (!data) {
    lines.push("No series named `" + id + "` is loaded yet.", "");
    continue;
  }
  lines.push("Countries with a figure: " + data.n + ".", "");
  const blocks = [];
  for (const [lens, title, highKey, lowKey] of LENSES) {
    blocks.push([title + ", expected high", spec[highKey] || [], "high", lens]);
    blocks.push([title + ", expected low", spec[lowKey] || [], "low", lens]);
  }
  blocks.push(["Popular", (spec.popular || expect.popular).slice(0, 7), "popular", "popular"]);
  for (const [title, names, kind, lens] of blocks) {
    lines.push("### " + title, "");
    lines.push("| Country | Value | Rank | Surprise |");
    lines.push("|---|---:|---:|---:|");
    for (const name of names) {
      const found = data.rank.get(name);
      if (!found) {
        lines.push("| " + name + " | — | missing | — |");
        surprises.push({ id, lens, name, kind, surprise: null, missing: true });
        continue;
      }
      const surprise = scoreOne(found, data.n, kind);
      lines.push("| " + name + " | " + found.value + " | " + found.rank + " of " + data.n + " | " + (kind === "popular" ? "—" : surprise.toFixed(2)) + " |");
      if (kind !== "popular") surprises.push({ id, label: spec.label, lens, name, kind, surprise, rank: found.rank, n: data.n, value: found.value });
    }
    lines.push("");
  }
}

surprises.sort((a, b) => (b.surprise || -1) - (a.surprise || -1));
lines.push("## Highest surprises", "");
lines.push("| Stat | Lens | Country | Expectation | Rank | Score |");
lines.push("|---|---|---|---|---:|---:|");
for (const row of surprises.filter(r => !r.missing).slice(0, 15)) {
  lines.push("| " + row.label + " | " + row.lens + " | " + row.name + " | " + row.kind + " | " + row.rank + " of " + row.n + " | " + row.surprise.toFixed(2) + " |");
}
lines.push("", "## Missing from the series", "");
const missingSeen = new Set();
const missing = surprises.filter(r => {
  if (!r.missing) return false;
  const key = r.id + "|" + r.lens + "|" + r.name;
  if (missingSeen.has(key)) return false;
  missingSeen.add(key);
  return true;
});
if (!missing.length) lines.push("None.");
else for (const row of missing) lines.push("- " + row.name + " is not in `" + row.id + "` (" + row.lens + ").");

function rankBoard(data, rows) {
  const picked = [];
  const seen = new Set();
  const tied = [];
  for (const row of rows.filter(r => !r.missing).sort((a, b) => b.surprise - a.surprise)) {
    if (seen.has(row.name)) continue;
    const found = data.rank.get(row.name);
    if (!found) continue;
    seen.add(row.name);
    if (picked.some(p => p.value === found.value)) { tied.push(found.name); continue; }
    picked.push(found);
    if (picked.length === 6) break;
  }
  picked.sort((a, b) => b.value - a.value);
  return { picked, tied };
}

lines.push("", "## Rank it", "");
lines.push("The highest scores become a Rank it board: the surprising countries, in real order. A board needs four different values. The lens is not copied into the puzzle.", "");
const fallbacks = [];
for (const [id, spec] of Object.entries(expect.stats)) {
  const data = series(id);
  if (!data) continue;
  const rows = surprises.filter(r => r.id === id);
  const board = rankBoard(data, rows);
  if (board.picked.length >= 4) {
    lines.push("- **" + spec.label + ":** " + board.picked.map(r => r.name + " " + r.value).join(", ") + ".");
    continue;
  }
  fallbacks.push({ spec, board, data });
}
lines.push("", "## Guess the number", "");
lines.push("One published value is shown. The most surprising country is the one to guess.", "");
for (const [id, spec] of Object.entries(expect.stats)) {
  const data = series(id);
  if (!data) continue;
  const top = surprises.filter(r => r.id === id && !r.missing).sort((a, b) => b.surprise - a.surprise)[0];
  if (!top) continue;
  const popular = (spec.popular || expect.popular).filter(name => name !== top.name && data.rank.has(name));
  const known = popular[0];
  if (!known) continue;
  const k = data.rank.get(known);
  lines.push("- " + spec.label + ": show " + known + " (" + k.value + ") and ask for " + top.name + " (" + top.value + ", " + top.lens + " expected it " + top.kind + ", rank " + top.rank + " of " + top.n + ").");
}
lines.push("", "## Name it", "");
lines.push("A window between two real values. It is kept when at least two countries sit strictly inside it.", "");
for (const [id, spec] of Object.entries(expect.stats)) {
  const data = series(id);
  if (!data) continue;
  const top = surprises.filter(r => r.id === id && !r.missing).sort((a, b) => b.surprise - a.surprise)[0];
  if (!top) continue;
  const anchors = (spec.popular || expect.popular).map(name => data.rank.get(name)).filter(Boolean).sort((a, b) => a.value - b.value);
  const windows = [];
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const between = data.rows.filter(r => r.value > anchors[i].value && r.value < anchors[j].value);
      if (between.length >= 2 && between.length <= 12) windows.push({ low: anchors[i], high: anchors[j], n: between.length });
    }
  }
  const window = windows.find(w => top.value > w.low.value && top.value < w.high.value) || windows[0];
  if (!window) continue;
  lines.push("- " + spec.label + ": strictly between " + window.low.name + " (" + window.low.value + ") and " + window.high.name + " (" + window.high.value + "), " + window.n + " countries.");
}
lines.push("", "## Match it", "");
lines.push("Fallback only. Used when the surprising countries do not make a strict Rank it of at least four.", "");
if (!fallbacks.length) lines.push("No stat needed a fallback. Every series above has a strict Rank it.");
for (const item of fallbacks) {
  const names = item.board.picked.map(r => r.name + " " + r.value).join(", ");
  const why = item.board.tied.length ? " Tied values kept out " + item.board.tied.join(", ") + "." : " Fewer than four of the surprising countries have a figure.";
  lines.push("- " + item.spec.label + ": " + (names || "no measured countries") + "." + why);
}
lines.push("");

const out = lines.join("\n");
fs.writeFileSync(path.join(__dirname, "report.md"), out);
console.log(out);
