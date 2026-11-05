const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");

test("both lenses are stored and Rank it comes before any Match it fallback", () => {
  const expect = JSON.parse(fs.readFileSync(path.join(root, "tools/director/expectations.json"), "utf8"));
  assert.equal(expect.popular.length, 7);
  for (const [id, spec] of Object.entries(expect.stats)) {
    for (const key of ["expectHigh", "expectLow", "paternalisticHigh", "paternalisticLow"]) {
      assert.equal(spec[key].length, 7, id + " " + key);
      assert.equal(new Set(spec[key]).size, 7, id + " " + key);
    }
    for (const name of spec.expectHigh) assert.equal(spec.expectLow.includes(name), false, id + " " + name);
    for (const name of spec.paternalisticHigh) assert.equal(spec.paternalisticLow.includes(name), false, id + " " + name);
  }
  execFileSync(process.execPath, ["tools/director/run.js"], { cwd: root, stdio: "pipe" });
  const report = fs.readFileSync(path.join(root, "tools/director/report.md"), "utf8");
  assert.match(report, /Paternalistic, expected high/);
  assert.match(report, /Conventional, expected high/);
  const rankAt = report.indexOf("## Rank it");
  const guessAt = report.indexOf("## Guess the number");
  const nameAt = report.indexOf("## Name it");
  const matchAt = report.indexOf("## Match it");
  assert.ok(rankAt > 0 && rankAt < guessAt && guessAt < nameAt && nameAt < matchAt);
  assert.match(report, /Fallback only/);
  assert.match(fs.readFileSync(path.join(root, "tools/director/PLAYBOOK.md"), "utf8"), /Neither is shown to players/);
});
