const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {}, TextEncoder, TextDecoder, btoa, atob };
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "challenge.js"), "utf8"), context, { filename: "challenge.js" });
vm.runInContext(fs.readFileSync(path.join(root, "challenge-preview.js"), "utf8"), context, { filename: "challenge-preview.js" });
const RC = sandbox.window.RankdChallenge;
const P = sandbox.window.RankdChallengePreview;

const sample = {
  k: "d", id: "2026-11-12", tries: 3, dnf: false, acc: 82,
  grid: ["GYMGR", "GGGGG"], name: "Alex",
};

test("the preview page carries the sender's score in the unfurl tags", () => {
  const token = RC.encode(sample);
  const ch = RC.decode(token);
  const html = P.page(token, ch, "https://ranki.gg");
  assert.match(html, /<meta property="og:title" content="Alex scored 82% on ranki\.gg">/);
  assert.match(html, /<meta property="og:description" content="Alex solved this puzzle in 3 tries \(accuracy 82\)\. Can you beat them\?/);
  assert.match(html, /<meta property="og:url" content="https:\/\/ranki\.gg\/c\//);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="twitter:title" content="Alex scored 82% on ranki\.gg">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/ranki\.gg\/c\//);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
});

test("the preview shows the spoiler-free square grid but never an answer", () => {
  const token = RC.encode(sample);
  const ch = RC.decode(token);
  const html = P.page(token, ch, "https://ranki.gg");
  assert.match(html, /\u{1F7E9}\u{1F7E8}\u2B1C\u{1F7E9}\u{1F7E5}/u);
  assert.match(html, /\u{1F7E9}\u{1F7E9}\u{1F7E9}\u{1F7E9}\u{1F7E9}/u);
  assert.equal(html.includes("Indonesia"), false);
  assert.equal(html.includes("answer"), false);
});

test("a human opening the preview lands on the same challenge in the app", () => {
  const token = RC.encode(sample);
  const ch = RC.decode(token);
  const html = P.page(token, ch, "https://ranki.gg");
  const target = "https://ranki.gg/#d=2026-11-12&c=" + token;
  const escTarget = target.replace(/&/g, "&amp;").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rawTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(html, new RegExp('<meta http-equiv="refresh" content="0; url=' + escTarget + '">'));
  assert.match(html, new RegExp('location\\.replace\\("' + rawTarget + '"\\)'));
});

test("a DNF preview says so, and a nameless link says Your friend", () => {
  const dnf = RC.encode({ ...sample, tries: 5, dnf: true, acc: 40, name: "" });
  const ch = RC.decode(dnf);
  const html = P.page(dnf, ch, "https://ranki.gg");
  assert.match(html, /Your friend didn&#39;t finish ranki\.gg/);
  assert.match(html, /didn&#39;t finish this puzzle in 5 tries \(accuracy 40\)\. Can you beat them\?/);
  assert.doesNotMatch(html, /scored/);
});

test("a hostile name cannot inject markup into the preview", () => {
  const token = RC.encode({ ...sample, name: "<img src=x onerror=alert(1)>" });
  const ch = RC.decode(token);
  const html = P.page(token, ch, "https://ranki.gg");
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("onerror="), false);
});

test("the token is the only input, so an invalid one is refused before rendering", () => {
  assert.equal(RC.decode("not-a-token"), null);
  assert.equal(RC.decode(""), null);
  const fn = fs.readFileSync(path.join(root, "functions", "c", "[token].js"), "utf8");
  assert.match(fn, /challenge\.decode\(token\)/);
  assert.match(fn, /status: 302/);
  assert.match(fn, /Location: SITE \+ "\/"/);
});

test("the shell adopts /c/<token> before relative assets load", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  const adopt = head.slice(head.indexOf("function () {"), head.indexOf("})();"));
  assert.match(adopt, /location\.pathname/);
  assert.match(adopt, /\[A-Za-z0-9_-\]\{8,800\}/);
  assert.match(adopt, /location\.replace\(/);
  assert.match(adopt, /"\/#" \+ parts\[1\] \+ "=" \+ encodeURIComponent\(parts\[2\]\) \+ "&c=" \+ token/);
  assert.ok(head.indexOf("function () {") < head.indexOf("styles.css"), "the rewrite runs before the stylesheet");
  assert.ok(head.indexOf("function () {") > 0, "the rewrite is in the document head");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.equal(app.includes("adoptChallengePath"), false);
});

test("challenge shares and the QR point at the preview route, not the bare hash", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const built = app.slice(app.indexOf("function buildChallengeShare"), app.indexOf("function qrMaker"));
  assert.match(built, /challengeShareUrl\(token\)/);
  assert.doesNotMatch(built, /shareUrl\(\) \+ "&c="/);
  const helper = app.slice(app.indexOf("function challengeShareUrl"), app.indexOf("function buildChallengeShare"));
  assert.match(helper, /"\/c\/" \+ token/);
  assert.match(helper, /https:\/\/ranki\.gg/);
});

test("the build publishes only /c/* to the Functions runtime and keeps the source out of _site", () => {
  const build = fs.readFileSync(path.join(root, "tools", "build_review_site.js"), "utf8");
  assert.match(build, /"_routes\.json"/);
  assert.match(build, /include: \["\/c\/\*"\]/);
  assert.match(build, /"functions"/);
});
