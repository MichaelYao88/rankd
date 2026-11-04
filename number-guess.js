/* Guess the number. One real value is shown; the player types the other.
   Accuracy is out of 100, from the error ratio bigger/smaller:
     accuracy = round(100 * max(0, 1 - ln(ratio) / ln(3)))
   A matching guess is 100. The score falls smoothly and reaches 0 when the
   guess is 3× the truth, or the truth is 3× the guess. A blank, zero, or
   negative guess is 0. The 2 on this part is only its weight in the day's
   package, not a score out of 2. There is no half-point display.
   Other stats can be added as more sets in number-puzzles.js. */
(function (root) {
  "use strict";

  function fmtRate(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function score(guess, truth) {
    const g = Number(guess);
    const t = Number(truth);
    if (!Number.isFinite(g) || !Number.isFinite(t) || g <= 0 || t <= 0) return { ratio: null, accuracy: 0 };
    const ratio = Math.max(g, t) / Math.min(g, t);
    const drop = Math.log(ratio) / Math.log(3);
    const accuracy = Math.max(0, Math.min(100, Math.round(100 * (1 - drop))));
    return { ratio: ratio, accuracy: accuracy };
  }

  function sets() {
    return Array.isArray(root.RANKD_NUMBER) ? root.RANKD_NUMBER : [];
  }

  function card(set, pair) {
    const known = pair.known, ask = pair.ask;
    const unit = set.unit || "";
    return {
      type: "number",
      id: set.id + "#" + known.iso3 + "-" + ask.iso3,
      fillerOnly: true,
      parentId: set.id,
      fillerDate: set.fillerDate || "2027-05-06",
      sensitive: !!set.sensitive,
      emoji: set.emoji || "📊",
      headline: set.headline || "Guess the number",
      question: known.name + " is " + fmtRate(known.value) + (unit ? " " + unit : "") + ". What is " + ask.name + "?",
      stat: set.stat || "",
      unit: unit,
      source: set.source || "",
      sourceUrl: set.sourceUrl || "",
      year: String(ask.year || set.year || ""),
      fact: pair.fact || "",
      art: set.art || "scale",
      dataset: set.dataset || set.id,
      known: known,
      ask: ask,
    };
  }

  function cards(set) {
    return (set && set.pairs || []).map(pair => card(set, pair));
  }

  function allCards() {
    const out = [];
    sets().forEach(set => cards(set).forEach(c => out.push(c)));
    return out;
  }

  function practicePuzzle(seed, safe) {
    let all = allCards();
    if (safe) all = all.filter(c => !c.sensitive);
    if (!all.length) return null;
    const s = Number(seed) >>> 0;
    const pick = all[s % all.length];
    const clone = JSON.parse(JSON.stringify(pick));
    clone.seed = s;
    clone.practice = true;
    clone.fillerOnly = false;
    clone.id = "rp-" + s;
    clone.order = null;
    return clone;
  }

  function blank() {
    return { type: "number", guess: null, phase: "ask", done: false, solved: false, accuracy: 0, ratio: null, tries: 0 };
  }

  function lock(g, puzzle, raw) {
    if (!g || g.done || !puzzle || !puzzle.ask) return g;
    const scored = score(raw, puzzle.ask.value);
    return {
      type: "number",
      guess: String(raw),
      phase: "reveal",
      done: true,
      solved: scored.accuracy >= 100,
      accuracy: scored.accuracy,
      ratio: scored.ratio,
      tries: 1,
    };
  }

  root.RankdNumber = {
    fmtRate: fmtRate,
    score: score,
    sets: sets,
    card: card,
    cards: cards,
    allCards: allCards,
    practicePuzzle: practicePuzzle,
    blank: blank,
    lock: lock,
  };
})(typeof window !== "undefined" ? window : globalThis);
