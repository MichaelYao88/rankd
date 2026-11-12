const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

// The review build rewrites one source-label entry. A string there made sourceBrand()
// call .test() on a string, which threw while rendering any hero whose source did not
// match an earlier label, so a card could fail to open partway through.
test("the review build keeps every source label a regular expression", () => {
  const build = read("tools/build_review_site.js");
  assert.match(build, /'\[\/unodc\/i, "UNODC"\],'/);
  assert.doesNotMatch(build, /'\["unodc", "UNODC"\],'/);
  const app = read("app.js");
  const start = app.indexOf("const SOURCE_BRAND = [");
  const end = app.indexOf("];", start) + 2;
  const block = app.slice(start, end);
  const reviewed = block.replace(/\[\/unodc\|united nations office on drugs\/i, "UNODC"\],/, "[/unodc/i, \"UNODC\"],");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(reviewed + ";globalThis.__SB = SOURCE_BRAND;", ctx);
  const entries = vm.runInContext("__SB", ctx);
  assert.ok(entries.length >= 20);
  for (const [re, label] of entries) {
    assert.equal(typeof re.test, "function", String(label));
    assert.equal(typeof label, "string");
  }
});

test("a malformed source label is skipped instead of throwing", () => {
  const app = read("app.js");
  assert.match(app, /if \(re && typeof re\.test === "function" && re\.test\(raw\)\) return label;/);
});
