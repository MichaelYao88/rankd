/* Guess the number. One real value is shown; the player types the other.
   Accuracy is out of 100, from the error ratio bigger/smaller:
     accuracy = round(100 * max(0, 1 - ln(ratio) / ln(factor)))
   A matching guess is 100. The score falls smoothly and reaches 0 when the
   guess is `factor` times the truth, or the truth is `factor` times the guess.
   `factor` is the stat's scoreFactor. It is the interquartile ratio of the
   full series (75th percentile / 25th percentile of positive values), clamped
   to the range 1.15–3. A wide stat clamps at 3, which is the old rule: 0 at
   a 3× miss. A tight middle, such as life expectancy, clamps near 1.15, so
   the same relative miss scores lower. A blank, zero, or negative guess is 0.
   The 2 on this part is only its weight in the day's package, not a score
   out of 2. There is no half-point display.
   The prompt is one sentence with both flags. The result line uses the same
   sentence shape for the hidden country. Other stats can be added as more
   sets in number-puzzles.js. */
(function (root) {
  "use strict";

  function fmtRate(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function factorFromValues(values) {
    const xs = (values || []).map(Number).filter(v => v > 0).sort((a, b) => a - b);
    if (xs.length < 8) return 3;
    const at = p => xs[Math.min(xs.length - 1, Math.round((xs.length - 1) * p))];
    const lo = at(0.25);
    const hi = at(0.75);
    if (!(lo > 0) || !(hi >= lo)) return 3;
    const iqr = hi / lo;
    return Math.max(1.15, Math.min(3, Math.round(iqr * 100) / 100));
  }

  function scoreFactor(puzzle) {
    const f = Number(puzzle && puzzle.scoreFactor);
    return Number.isFinite(f) && f > 1 ? f : 3;
  }

  function score(guess, truth, factor) {
    const g = Number(guess);
    const t = Number(truth);
    const tol = scoreFactor({ scoreFactor: factor });
    if (!Number.isFinite(g) || !Number.isFinite(t) || g <= 0 || t <= 0) return { ratio: null, accuracy: 0, factor: tol };
    const ratio = Math.max(g, t) / Math.min(g, t);
    const drop = Math.log(ratio) / Math.log(tol);
    const accuracy = Math.max(0, Math.min(100, Math.round(100 * (1 - drop))));
    return { ratio: ratio, accuracy: accuracy, factor: tol };
  }

  const THE = /^(United |Netherlands$|Philippines$|Bahamas$|Gambia$|Czech Republic$|Democratic Republic)/;

  function withThe(name, cap) {
    const n = String(name || "");
    if (!THE.test(n)) return n;
    return (cap ? "The " : "the ") + n;
  }

  function poss(name) {
    const n = String(name || "");
    return /s$/i.test(n) ? n + "'" : n + "'s";
  }

  function labeledPoss(name, cap) {
    const prefix = THE.test(String(name || "")) ? (cap ? "The " : "the ") : "";
    return prefix + poss(name);
  }

  function article(noun) {
    return /^[aeiou]/i.test(String(noun || "")) ? "an" : "a";
  }

  function valueUnit(value, unit) {
    const u = String(unit || "");
    if (!u) return value;
    if (u.charAt(0) === "%") return value + u;
    return value + " " + u;
  }

  function promptSentence(set, known, ask) {
    const noun = set.noun || set.stat || "figure";
    const unit = set.unitSpoken || set.unit || "";
    const knownValue = fmtRate(known.value);
    const shown = valueUnit(knownValue, unit);
    if (set.prompt === "vote") {
      return known.emoji + " " + withThe(known.name, true) + " gave Donald Trump " + knownValue + "% of the 2024 presidential vote. What share did " + ask.emoji + " " + withThe(ask.name, false) + " give him?";
    }
    if (set.prompt === "share") {
      return known.emoji + " " + labeledPoss(known.name, true) + " richest 1% hold " + knownValue + "% of private wealth. What share does " + ask.emoji + " " + labeledPoss(ask.name, false) + " richest 1% hold?";
    }
    return known.emoji + " " + withThe(known.name, true) + " has " + article(noun) + " " + noun + " of " + shown + ". What is " + ask.emoji + " " + labeledPoss(ask.name, false) + "?";
  }

  function revealSentence(puzzle) {
    const ask = puzzle.ask || {};
    const noun = puzzle.noun || puzzle.stat || "figure";
    const unit = puzzle.unitSpoken || puzzle.unit || "";
    const value = fmtRate(ask.value);
    const shown = valueUnit(value, unit);
    if (puzzle.prompt === "vote") {
      return ask.emoji + " " + withThe(ask.name, true) + " gave Donald Trump " + value + "% of the 2024 presidential vote.";
    }
    if (puzzle.prompt === "share") {
      return ask.emoji + " " + labeledPoss(ask.name, true) + " richest 1% hold " + value + "% of private wealth.";
    }
    return ask.emoji + " " + labeledPoss(ask.name, true) + " " + noun + " is " + shown + ".";
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
      question: promptSentence(set, known, ask),
      noun: set.noun || set.stat || "",
      unitSpoken: set.unitSpoken || unit,
      prompt: set.prompt || "",
      scoreFactor: scoreFactor(set),
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
      poolFrom: pair.poolFrom || set.poolFrom || "",
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
    const scored = score(raw, puzzle.ask.value, puzzle.scoreFactor);
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
    factorFromValues: factorFromValues,
    scoreFactor: scoreFactor,
    promptSentence: promptSentence,
    reveal: revealSentence,
    sets: sets,
    card: card,
    cards: cards,
    allCards: allCards,
    practicePuzzle: practicePuzzle,
    blank: blank,
    lock: lock,
  };
})(typeof window !== "undefined" ? window : globalThis);
