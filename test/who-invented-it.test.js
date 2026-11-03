const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function load(file) {
  const box = { window: {} };
  vm.runInNewContext(read(file), box, { filename: file });
  return box.window;
}

const puzzles = load("puzzles-data.js").RANKD_PUZZLES;
const practice = load("practice-data.js").RANKD_PRACTICE;
const Quiz = load("invent-quiz.js").RankdQuiz;
const epoch = Date.UTC(2026, 9, 6);
const dateOf = order => new Date(epoch + (Math.round(order) - 1) * 864e5).toISOString().slice(0, 10);

function bootStudio() {
  const document = {
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} },
    addEventListener() {},
  };
  const storage = () => ({ getItem: () => null, setItem() {}, removeItem() {}, key: () => null, get length() { return 0; } });
  const box = {
    window: { RANKD_STUDIO: true },
    document,
    localStorage: storage(),
    sessionStorage: storage(),
    location: { protocol: "http:", pathname: "/", search: "", hostname: "localhost", hash: "" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    URLSearchParams, console, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp,
    Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout,
    fetch: () => Promise.reject(new Error("no")),
    AbortController,
  };
  box.globalThis = box;
  box.window.document = document;
  box.window.localStorage = box.localStorage;
  box.window.sessionStorage = box.sessionStorage;
  box.window.location = box.location;
  box.window.matchMedia = box.matchMedia;
  vm.createContext(box);
  for (const file of ["puzzles-data.js", "practice-data.js", "name-puzzles.js", "part1-puzzles.js", "name-it.js", "invent-quiz.js", "app.js"]) {
    vm.runInContext(read(file), box, { filename: file });
  }
  return box.window;
}

test("who invented it is the main puzzle on 2027-05-18 and the streak day", () => {
  const quiz = puzzles.find(p => p.id === "who-invented-it");
  const older = puzzles.find(p => p.id === "who-invented-older");
  const words = puzzles.find(p => p.id === "who-invented-words");
  assert.equal(quiz.type, "quiz");
  assert.equal(quiz.order, 225);
  assert.equal(older.order, 226);
  assert.equal(words.order, 227);
  assert.equal(dateOf(quiz.order), "2027-05-18");
  assert.equal(dateOf(older.order), "2027-05-19");
  assert.equal(dateOf(words.order), "2027-05-20");
  assert.equal(dateOf(224), "2027-05-17");
  for (const p of [quiz, older, words]) {
    assert.equal(p.type, "quiz");
    assert.equal(p.sensitive, undefined);
    assert.equal(p.questions.length, 9);
    assert.equal(p.questions.filter(q => /fish-sauce|grass-rope/i.test(q.prompt + " " + q.ask)).length, 0);
  }
  const win = bootStudio();
  const scheduled = win.RankdShared.puzzles;
  const n = scheduled.findIndex(p => p.id === "who-invented-it");
  assert.equal(win.RankdShared.keyFromDay(n), "2027-05-18");
  assert.equal(win.RankdBonus.types.includes("quiz"), false);
  const part1 = win.RankdBonus.forDay(n);
  assert.notEqual(part1.id, "who-invented-it");
  assert.equal(win.RankdBonus.types.includes(part1.type), true);
  assert.equal(part1.sensitive, undefined);
  for (const id of ["who-invented-it", "who-invented-older", "who-invented-words"]) {
    const i = scheduled.findIndex(p => p.id === id);
    assert.equal(win.RankdBonus.forDay(i).type === "quiz", false, id);
  }
});

test("each card has one sourced answer and three other countries", () => {
  const quiz = puzzles.find(p => p.id === "who-invented-it");
  const expect = [
    ["emoji", "JPN", "Which country invented emoji?"],
    ["qr", "JPN", "Which country invented the QR code?"],
    ["spotify", "SWE", "Which country started Spotify?"],
    ["webcam", "GBR", "Which country set up the coffee-pot camera that became the first webcam?"],
    ["usb-flash", "ISR", "Which country filed the first patent for a USB flash disk?"],
    ["gasoline-car", "DEU", "Which country built the first gasoline car, Benz's Patent-Motorwagen of 1886?"],
    ["shampoo", "IND", "Which country gave English the word shampoo?"],
    ["bluetooth", "SWE", "Ericsson developed the short-range radio that became Bluetooth in which country?"],
    ["ketchup", "CHN", "Ketchup was invented in which country?"],
  ];
  assert.equal(JSON.stringify(quiz.questions.map(q => [q.id, q.answer, q.ask])), JSON.stringify(expect));
  for (const day of puzzles.filter(p => p.type === "quiz")) for (const q of day.questions) {
    assert.equal(q.options.length, 4, q.id);
    assert.equal(new Set(q.options.map(o => o.iso3)).size, 4, q.id);
    assert.equal(q.options.filter(o => o.iso3 === q.answer).length, 1, q.id);
    assert.equal(q.sourceUrl.startsWith("https://"), true, q.id);
    assert.match(q.fact, /\S/, q.id);
    assert.equal(/tomato ketchup was invented/i.test(q.ask + q.prompt), false, q.id);
  }
  const older = puzzles.find(p => p.id === "who-invented-older");
  const words = puzzles.find(p => p.id === "who-invented-words");
  assert.equal(older.questions.find(q => q.id === "rope-bridge").answer, "PER");
  assert.match(older.questions.find(q => q.id === "rope-bridge").ask, /suspension bridges across the Andes/);
  assert.doesNotMatch(older.questions.find(q => q.id === "rope-bridge").ask, /grass-rope/);
  assert.match(older.questions.find(q => q.id === "rope-bridge").fact, /China/);
  assert.match(older.questions.find(q => q.id === "rope-bridge").fact, /chain/);
  const fork = older.questions.find(q => q.id === "fork");
  assert.equal(fork.answer, "CHN");
  assert.match(fork.ask, /fork first/);
  assert.match(fork.fact, /Qijia/);
  assert.match(fork.fact, /Egypt/);
  assert.match(fork.fact, /Byzantine/);
  assert.equal(older.questions.find(q => q.id === "anesthesia").answer, "JPN");
  assert.equal(words.questions.find(q => q.id === "quarantine").answer, "HRV");
  assert.match(words.questions.find(q => q.id === "quarantine").fact, /Italian/);
  assert.equal(words.questions.find(q => q.id === "variolation").answer, "TUR");
  assert.equal(words.questions.find(q => q.id === "clinical-trial").answer, "IRN");
  assert.match(words.questions.find(q => q.id === "clinical-trial").fact, /Uzbekistan/);
  assert.equal(words.questions.find(q => q.id === "oldest-school").answer, "MAR");
  assert.match(words.questions.find(q => q.id === "oldest-school").fact, /Bologna/);
  assert.equal(words.questions.find(q => q.id === "cheque").answer, "IRQ");
  assert.equal(words.questions.find(q => q.id === "algorithm").answer, "IRN");
  assert.equal(words.questions.find(q => q.id === "algebra").answer, "IRN");
  assert.match(words.questions.find(q => q.id === "algebra").fact, /al-Khwarizmi/i);
  assert.match(words.questions.find(q => q.id === "algebra").fact, /Uzbekistan/);
  assert.match(words.questions.find(q => q.id === "algebra").fact, /Iraq/);
  const usb = quiz.questions.find(q => q.id === "usb-flash");
  assert.match(usb.fact, /Singapore/);
  assert.match(usb.fact, /1999/);
  const money = words.questions.find(q => q.id === "mobile-money");
  assert.match(money.fact, /Philippines/);
  assert.match(money.fact, /M-Pesa/);
  const ketchup = quiz.questions.find(q => q.id === "ketchup");
  assert.match(ketchup.fact, /kê-tsiap|Amoy/i);
  assert.match(ketchup.fact, /Tomato ketchup is American/);
  assert.doesNotMatch(ketchup.ask + ketchup.prompt + ketchup.fact, /fish-sauce|fish sauce/i);
  assert.equal(quiz.questions.filter(q => /shampoo/i.test(q.id)).length, 1);
  const shampoo = quiz.questions.find(q => q.id === "shampoo");
  assert.match(shampoo.fact, /chāmpo/);
  assert.match(shampoo.fact, /Mahomed/);
  const bluetooth = quiz.questions.find(q => q.id === "bluetooth");
  assert.equal(bluetooth.answer, "SWE");
  assert.match(bluetooth.fact, /Denmark/);
  assert.match(bluetooth.fact, /1994/);
  assert.match(bluetooth.fact, /Lund/);
  for (const day of [quiz, older, words]) {
    assert.equal(day.questions.length, 9, day.id);
    for (const q of day.questions) {
      assert.doesNotMatch(q.ask, / and the /i, q.id);
    }
  }
  for (const id of ["who-invented-it", "who-invented-older", "who-invented-words"]) {
    const p = puzzles.find(x => x.id === id);
    const ds = practice.datasets.find(d => d.id === id);
    assert.equal(ds.kind, "quiz");
    assert.equal(ds.sens, 0);
    assert.equal(ds.coverage, "full");
    assert.equal(JSON.stringify(ds.questions), JSON.stringify(p.questions));
  }
});

test("a run scores out of the questions, reveals one fact, and shares one square each", () => {
  const quiz = puzzles.find(p => p.id === "who-invented-it");
  let g = Quiz.blank(quiz);
  assert.equal(g.phase, "ask");
  g = Quiz.choose(g, quiz, "USA");
  assert.equal(g.phase, "reveal");
  assert.equal(g.hits, 0);
  assert.equal(g.marks[0], "bad");
  const stuck = Quiz.choose(g, quiz, "JPN");
  assert.equal(stuck.hits, 0);
  g = Quiz.advance(g, quiz);
  assert.equal(g.index, 1);
  assert.equal(g.phase, "ask");
  for (let i = 1; i < quiz.questions.length; i++) {
    g = Quiz.choose(g, quiz, quiz.questions[i].answer);
    g = Quiz.advance(g, quiz);
  }
  assert.equal(g.done, true);
  assert.equal(g.solved, false);
  const n = quiz.questions.length;
  assert.equal(g.hits, n - 1);
  assert.equal(Quiz.accuracy(g), Math.round((n - 1) / n * 100));
  const bits = Quiz.shareBits(quiz, g);
  assert.equal(bits.line, (n - 1) + "/" + n);
  assert.equal(bits.grid, "🟥" + "🟩".repeat(n - 1));
  let perfect = Quiz.blank(quiz);
  for (const q of quiz.questions) {
    perfect = Quiz.choose(perfect, quiz, q.answer);
    perfect = Quiz.advance(perfect, quiz);
  }
  assert.equal(perfect.solved, true);
  assert.equal(perfect.hits, quiz.questions.length);
  assert.equal(Quiz.accuracy(perfect), 100);
});

test("practice can deal the same nine questions", () => {
  const win = bootStudio();
  let found = null;
  for (let seed = 1; seed <= 4000 && !found; seed++) {
    const dealt = win.RankdPractice.generate(seed);
    if (dealt && dealt.dataset === "who-invented-it") found = dealt;
  }
  assert.ok(found, "quiz dataset is in the practice draw");
  assert.equal(found.type, "quiz");
  assert.equal(found.practice, true);
  assert.equal(found.sensitive, false);
  assert.equal(found.questions.length, 9);
  assert.equal(found.questions[0].answer, "JPN");
});
