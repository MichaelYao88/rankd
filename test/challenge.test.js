const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {}, TextEncoder, TextDecoder, btoa, atob };
sandbox.globalThis = sandbox;
vm.runInContext(fs.readFileSync(path.join(root, "challenge.js"), "utf8"), vm.createContext(sandbox), { filename: "challenge.js" });
const RC = sandbox.window.RankdChallenge;

const sample = {
  k: "d", id: "2026-10-06", tries: 3, dnf: false, acc: 82,
  grid: ["GRRG", "GGGG"], name: "Alex",
};

test("round-trips tries, accuracy, squares and a short name", () => {
  const token = RC.encode(sample);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(token.includes("="), false);
  const back = JSON.parse(JSON.stringify(RC.decode(token)));
  assert.deepEqual(back, { v: 1, k: "d", id: "2026-10-06", tries: 3, dnf: false, acc: 82, grid: ["GRRG", "GGGG"], name: "Alex" });
  assert.equal(RC.bannerLine(back), "Alex solved this in 3 tries (accuracy 82). Can you beat them?");
  assert.equal(RC.bannerLine(back).includes("🟩"), false);
  assert.equal(RC.gridText(back.grid), "🟩🟥🟥🟩\n🟩🟩🟩🟩");
});

test("the payload does not carry an ordering or country names", () => {
  const token = RC.encode({ ...sample, name: "Alex" });
  const raw = Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  assert.equal(raw.includes("Indonesia"), false);
  assert.equal(raw.includes("order"), false);
  assert.match(raw, /^1\|d\|2026-10-06\|3\|0\|82\|GRRG\.GGGG\|Alex$/);
});

test("sanitizes and remembers a short display name", () => {
  assert.equal(RC.sanitizeName("<b>Sam</b>"), "Sam");
  assert.equal(RC.sanitizeName('<img src=x onerror="alert(1)">'), "");
  assert.equal(RC.sanitizeName("  Alex   P  "), "Alex P");
  assert.equal(RC.sanitizeName("A".repeat(40)).length, 16);
  assert.equal(RC.sanitizeName("Hi|there"), "Hithere");
  assert.equal(RC.sanitizeName("🟩🟩 sneak"), "sneak");
  const named = RC.decode(RC.encode({ ...sample, name: "<script>alert(1)</script>Mina" }));
  assert.equal(named.name, "Mina");
  assert.equal(RC.displayName({ name: "" }), "Your friend");
  assert.equal(RC.bannerLine({ ...sample, name: "" }), "Your friend solved this in 3 tries (accuracy 82). Can you beat them?");
});

test("unicode names survive the url token", () => {
  const back = RC.decode(RC.encode({ ...sample, name: "Álex" }));
  assert.equal(back.name, "Álex");
});

test("malformed tokens are ignored", () => {
  assert.equal(RC.decode(""), null);
  assert.equal(RC.decode("!!!!"), null);
  assert.equal(RC.decode("abcd"), null);
  assert.equal(RC.decode(RC.encode(sample).slice(0, 12)), null);
  assert.equal(RC.encode({ ...sample, acc: 101 }), "");
  assert.equal(RC.encode({ ...sample, tries: -1 }), "");
  assert.equal(RC.encode({ ...sample, k: "z" }), "");
  assert.equal(RC.encode({ ...sample, grid: ["GGX"] }), "");
  assert.equal(RC.encode({ ...sample, id: "not-a-date" }), "");
  assert.equal(RC.tokenFromHash("#d=2026-10-06&c=!!!"), "");
  assert.equal(RC.tokenFromHash("#d=2026-10-06"), "");
});

test("a challenge for another day does not match or bypass the lock", () => {
  const ch = RC.decode(RC.encode(sample));
  assert.equal(RC.matches(ch, { k: "d", id: "2026-10-06" }), true);
  assert.equal(RC.matches(ch, { k: "d", id: "2026-10-07" }), false);
  assert.equal(RC.bypassArchiveAd(ch, "2026-10-06"), true);
  assert.equal(RC.bypassArchiveAd(ch, "2026-10-07"), false);
  assert.equal(RC.bypassArchiveAd(null, "2026-10-06"), false);
  assert.equal(RC.bypassArchiveAd(RC.decode("not-a-token"), "2026-10-06"), false);
});

test("fewer tries wins, accuracy breaks a tie, a finish beats DNF", () => {
  const row = (tries, acc, dnf) => ({ tries, acc, dnf });
  assert.equal(RC.winner(row(2, 50, false), row(3, 99, false)), "you");
  assert.equal(RC.winner(row(3, 80, false), row(3, 90, false)), "them");
  assert.equal(RC.winner(row(3, 80, false), row(3, 80, false)), "tie");
  assert.equal(RC.winner(row(5, 10, false), row(1, 100, true)), "you");
  assert.equal(RC.winner(row(5, 90, true), row(5, 10, false)), "them");
  assert.equal(RC.winner(row(4, 10, true), row(5, 99, true)), "you");
  assert.equal(RC.verdictLine("you"), "You win!");
  assert.equal(RC.verdictLine("them"), "They win");
  assert.equal(RC.verdictLine("tie"), "Tie");
});

test("share text names the score and leaves the squares in the token", () => {
  const line = RC.shareLine("Alex", { tries: 3, acc: 82, dnf: false });
  assert.equal(line, "Alex solved this Ranki puzzle in 3 tries (accuracy 82). Can you beat them?");
  assert.equal(line.includes("🟩"), false);
  assert.equal(RC.shareLine("", { tries: 1, acc: 100, dnf: false }), "I solved this Ranki puzzle in 1 try (accuracy 100). Can you beat me?");
  assert.match(RC.shareLine("", { tries: 5, acc: 40, dnf: true }), /didn't finish/);
});

test("top 5 challenge grids keep one row of marks per lock-in", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const fn = app.slice(app.indexOf("function gridFromResult"), app.indexOf("function scoreForChallenge"));
  assert.match(fn, /r\.attempts/);
  assert.ok(fn.indexOf("r.attempts") < fn.indexOf("r.marks"), "per-try marks come before the last-try fallback");
});

test("the page wires the button, the events, and the archive bypass", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="challengeFriendBtn"/);
  assert.match(html, /id="challengeBanner"/);
  assert.match(html, /id="h2h"/);
  assert.match(html, /src="challenge\.js"/);
  assert.match(app, /challenge_link_created/);
  assert.match(app, /challenge_link_opened/);
  assert.match(app, /bypassArchiveAd/);
  assert.match(app, /rankd\.challengeName\.v1/);
  const opened = app.slice(app.indexOf("challenge_link_opened"), app.indexOf("challenge_link_opened") + 120);
  assert.equal(opened.includes("name"), false);
  assert.match(app, /viaChallenge/);
  assert.doesNotMatch(app.slice(app.indexOf("const viaChallenge"), app.indexOf("const viaChallenge") + 500), /applyArchiveAdUnlock|setArchiveUnlockedDays/);
});
