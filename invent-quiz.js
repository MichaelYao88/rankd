/* Who Invented It? One shot per question, then the fact.
   The puzzle data lives on the daily (puzzles-data.js) and in the practice
   dataset. This file only scores a run. Loaded before app.js. */
(function (root) {
  "use strict";

  function questions(p) {
    return (p && Array.isArray(p.questions)) ? p.questions : [];
  }

  function blank(p) {
    return {
      type: "quiz",
      picks: [],
      marks: [],
      guesses: [],
      index: 0,
      phase: "ask",
      done: false,
      solved: false,
      hits: 0,
      tries: 1,
      total: questions(p).length,
    };
  }

  function option(q, iso) {
    return (q && q.options || []).find(o => o && o.iso3 === iso) || null;
  }

  function grade(q, iso) {
    return q && iso === q.answer ? "good" : "bad";
  }

  function choose(g, p, iso) {
    if (!g || g.done || g.phase !== "ask") return g;
    const q = questions(p)[g.index];
    const opt = option(q, iso);
    if (!q || !opt) return g;
    const mark = grade(q, iso);
    const picks = g.picks.concat([{ iso3: iso, name: opt.name, emoji: opt.emoji || "", mark: mark, id: q.id }]);
    const marks = g.marks.concat([mark]);
    const hits = marks.filter(m => m === "good").length;
    return Object.assign({}, g, { picks: picks, marks: marks, guesses: picks, hits: hits, phase: "reveal" });
  }

  function advance(g, p) {
    if (!g || g.done || g.phase !== "reveal") return g;
    const n = questions(p).length;
    if (g.index + 1 >= n) {
      const hits = g.hits || 0;
      return Object.assign({}, g, { done: true, solved: n > 0 && hits === n, tries: 1, total: n });
    }
    return Object.assign({}, g, { index: g.index + 1, phase: "ask" });
  }

  function accuracy(g) {
    const marks = (g && g.marks) || [];
    if (!marks.length) return null;
    const hits = marks.filter(m => m === "good").length;
    return Math.round(hits / marks.length * 100);
  }

  function shareBits(p, g) {
    const n = questions(p).length || ((g && g.marks) || []).length;
    const hits = g && Number.isFinite(Number(g.hits)) ? Number(g.hits) : ((g && g.marks) || []).filter(m => m === "good").length;
    const grid = ((g && g.marks) || []).map(m => m === "good" ? "🟩" : "🟥").join("");
    return { hits: hits, total: n, line: hits + "/" + n, grid: grid };
  }

  root.RankdQuiz = {
    questions: questions,
    blank: blank,
    choose: choose,
    advance: advance,
    grade: grade,
    accuracy: accuracy,
    shareBits: shareBits,
  };
})(typeof window !== "undefined" ? window : globalThis);
