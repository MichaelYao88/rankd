/* Guess the number. One real value is shown; the player types the other.
   Scoring uses the error ratio bigger/smaller. Bands, out of 2:
     ratio ≤ 1.25 → 2
     ratio ≤ 1.5  → 1.5
     ratio ≤ 2    → 1
     ratio ≤ 3    → 0.5
     otherwise    → 0
   A blank, zero, or negative guess scores 0. The package max stays 2,
   an integer. The earned score can be a half, and the UI prints it as 1.5/2.
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
    if (!Number.isFinite(g) || !Number.isFinite(t) || g <= 0 || t <= 0) return { ratio: null, points: 0 };
    const ratio = Math.max(g, t) / Math.min(g, t);
    let points = 0;
    if (ratio <= 1.25) points = 2;
    else if (ratio <= 1.5) points = 1.5;
    else if (ratio <= 2) points = 1;
    else if (ratio <= 3) points = 0.5;
    return { ratio: ratio, points: points };
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
    return { type: "number", guess: null, phase: "ask", done: false, solved: false, points: 0, ratio: null, tries: 0 };
  }

  function lock(g, puzzle, raw) {
    if (!g || g.done || !puzzle || !puzzle.ask) return g;
    const scored = score(raw, puzzle.ask.value);
    const points = scored.points;
    return {
      type: "number",
      guess: String(raw),
      phase: "reveal",
      done: true,
      solved: points >= 2,
      points: points,
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
