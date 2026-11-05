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

const lines = ["# Director report", "", "Expectations are not shown to players. A higher surprise score means the real rank is further from the written expectation.", ""];
const surprises = [];

for (const [id, spec] of Object.entries(expect.stats)) {
  const data = series(id);
  lines.push("## " + (spec.label || id), "");
  if (!data) {
    lines.push("No series named `" + id + "` is loaded yet.", "");
    continue;
  }
  lines.push("Countries with a figure: " + data.n + ".", "");
  const blocks = [
    ["Expected high", spec.expectHigh || [], "high"],
    ["Expected low", spec.expectLow || [], "low"],
    ["Popular", (spec.popular || expect.popular).slice(0, 7), "popular"],
  ];
  for (const [title, names, kind] of blocks) {
    lines.push("### " + title, "");
    lines.push("| Country | Value | Rank | Surprise |");
    lines.push("|---|---:|---:|---:|");
    for (const name of names) {
      const found = data.rank.get(name);
      if (!found) {
        lines.push("| " + name + " | — | missing | — |");
        surprises.push({ id, name, kind, surprise: null, missing: true });
        continue;
      }
      const surprise = scoreOne(found, data.n, kind);
      lines.push("| " + name + " | " + found.value + " | " + found.rank + " of " + data.n + " | " + (kind === "popular" ? "—" : surprise.toFixed(2)) + " |");
      if (kind !== "popular") surprises.push({ id, label: spec.label, name, kind, surprise, rank: found.rank, n: data.n, value: found.value });
    }
    lines.push("");
  }
}

surprises.sort((a, b) => (b.surprise || -1) - (a.surprise || -1));
lines.push("## Highest surprises", "");
lines.push("| Stat | Country | Expectation | Rank | Score |");
lines.push("|---|---|---|---:|---:|");
for (const row of surprises.filter(r => !r.missing).slice(0, 15)) {
  lines.push("| " + row.label + " | " + row.name + " | " + row.kind + " | " + row.rank + " of " + row.n + " | " + row.surprise.toFixed(2) + " |");
}
lines.push("", "## Missing from the series", "");
const missingSeen = new Set();
const missing = surprises.filter(r => r.missing && missingSeen.has(r.id + "|" + r.name) ? false : (r.missing && missingSeen.add(r.id + "|" + r.name), r.missing));
if (!missing.length) lines.push("None.");
else for (const row of missing) lines.push("- " + row.name + " is not in `" + row.id + "`.");
lines.push("", "## Candidate puzzles", "");
lines.push("Proposals only. The expectation is not copied into the puzzle. A pair or window is listed only when both numbers are in the series.", "");
for (const [id, spec] of Object.entries(expect.stats)) {
  const data = series(id);
  if (!data) continue;
  const top = surprises.filter(r => r.id === id && !r.missing).sort((a, b) => b.surprise - a.surprise)[0];
  if (!top) continue;
  const popular = (spec.popular || expect.popular).filter(name => name !== top.name && data.rank.has(name));
  const known = popular[0];
  if (known) {
    const k = data.rank.get(known);
    lines.push("- Guess the number, " + spec.label + ": show " + known + " (" + k.value + ") and ask for " + top.name + " (" + top.value + ", rank " + top.rank + " of " + top.n + ").");
  }
  const anchors = popular.map(name => data.rank.get(name)).filter(Boolean).sort((a, b) => a.value - b.value);
  const windows = [];
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const low = anchors[i].value, high = anchors[j].value;
      const between = data.rows.filter(r => r.value > low && r.value < high);
      if (between.length >= 2 && between.length <= 12) windows.push({ low: anchors[i], high: anchors[j], n: between.length });
    }
  }
  const window = windows.find(w => top.value > w.low.value && top.value < w.high.value) || windows[0];
  if (window) {
    lines.push("- Name it window, " + spec.label + ": strictly between " + window.low.name + " (" + window.low.value + ") and " + window.high.name + " (" + window.high.value + "), " + window.n + " countries.");
  }
  const board = [top.name].concat(popular).filter((name, i, arr) => arr.indexOf(name) === i && data.rank.has(name)).slice(0, 6);
  if (board.length >= 4) {
    const ordered = board.map(name => data.rank.get(name)).sort((a, b) => b.value - a.value);
    const distinct = new Set(ordered.map(r => r.value)).size === ordered.length;
    if (distinct) lines.push("- Rank it, " + spec.label + ": " + ordered.map(r => r.name + " " + r.value).join(", ") + ".");
  }
}
lines.push("");

const out = lines.join("\n");
fs.writeFileSync(path.join(__dirname, "report.md"), out);
console.log(out);
