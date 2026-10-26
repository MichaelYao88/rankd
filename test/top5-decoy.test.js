const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "puzzles-data.js"), "utf8"), sandbox, { filename: "puzzles-data.js" });
const puzzles = sandbox.window.RANKD_PUZZLES.filter(p => p.type === "top5");

function beats(a, b) {
  return a.value > b.value || (a.value === b.value && a.exact != null && b.exact != null && a.exact > b.exact);
}
function tieRank(list, c) {
  return 1 + list.filter(x => beats(x, c)).length;
}
function slots(countries) {
  const cs = countries.slice().sort((a, b) => b.value - a.value || (b.exact || 0) - (a.exact || 0));
  const groups = cs.slice(0, 4).map(c => [c]);
  groups.push(cs.slice(4).filter(c => c.value === cs[4].value && (c.exact ?? null) === (cs[4].exact ?? null)));
  return groups;
}

test("every Top 5 puzzle has a same-list decoy outside the top 5", () => {
  assert.equal(puzzles.length, 8);
  for (const p of puzzles) {
    assert.ok(p.decoy, p.id + " missing decoy");
    const c = p.countries.find(x => x.iso3 === p.decoy.iso3 || x.name === p.decoy.name);
    assert.ok(c, p.id + " decoy not in its country list");
    assert.equal(p.decoy.value, c.value, p.id + " value");
    assert.equal(p.decoy.rank, tieRank(p.countries, c), p.id + " rank");
    assert.ok(p.decoy.rank >= 6, p.id + " rank " + p.decoy.rank);
    assert.equal(String(p.decoy.year), String(c.year));
    assert.equal(String(p.decoy.year), String(p.year));
    const slotVals = new Set(slots(p.countries).map(g => g[0].value));
    assert.equal(slotVals.has(c.value), false, p.id + " decoy shares a top-5 value");
    const inGroup = slots(p.countries).some(g => g.includes(c));
    assert.equal(inGroup, false, p.id + " decoy is inside a slot");
  }
});

test("top5_puzzles.csv and puzzles.xlsx carry the same decoy columns", () => {
  const csv = fs.readFileSync(path.join(root, "top5_puzzles.csv"), "utf8").replace(/^\uFEFF/, "");
  const [header, ...lines] = csv.trim().split(/\n/);
  for (const col of ["decoy_country", "decoy_iso3", "decoy_emoji", "decoy_value", "decoy_rank"]) {
    assert.ok(header.split(",").includes(col), col);
  }
  assert.equal(lines.length, 8);
  const { execFileSync } = require("child_process");
  const out = execFileSync("python3", ["-c", `
import openpyxl
wb = openpyxl.load_workbook("puzzles.xlsx", read_only=True, data_only=True)
ws = wb["top5_puzzles"]
rows = list(ws.iter_rows(values_only=True))
head = list(rows[0])
need = ["decoy_country","decoy_iso3","decoy_emoji","decoy_value","decoy_rank"]
missing = [c for c in need if c not in head]
assert not missing, missing
idx = {h:i for i,h in enumerate(head)}
body = [r for r in rows[1:] if r[0]]
assert len(body)==8
for r in body:
    assert r[idx["decoy_country"]] and r[idx["decoy_rank"]] >= 6
print("ok", len(body))
`], { cwd: root, encoding: "utf8" });
  assert.match(out, /ok 8/);
});
