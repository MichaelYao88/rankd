/* Live puzzle-list filter. No dependencies. Works from a script tag (window.RankdSearch)
   and from node (module.exports) so the match rules can be unit-tested.
   A query matches a puzzle when it hits a country in the puzzle's rows (partial, plus a few
   aliases) or a keyword in the headline, subtitle, stat, value gloss, source, unit, or category. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RankdSearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Each group is already normalized. A row whose name is any member matches every member.
  // Short tokens (us, uk, usa) match the whole query only, so "us" does not hit Australia.
  const ALIAS_GROUPS = [
    ["united states", "united states of america", "usa", "us"],
    ["united kingdom", "uk", "britain", "great britain"],
    ["south korea", "korea", "republic of korea"],
  ];
  const ALIAS_OF = new Map();
  ALIAS_GROUPS.forEach(group => group.forEach(name => ALIAS_OF.set(name, group)));

  function normQuery(s) {
    return String(s ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  // 3+ characters: substring. Shorter: a word must start with the query, so "us" is not found inside "russia".
  function textMatches(text, q) {
    const t = normQuery(text);
    if (!t || !q) return false;
    if (q.length >= 3) return t.includes(q);
    return t.split(" ").some(w => w.startsWith(q));
  }

  function nameMatches(name, q) {
    if (textMatches(name, q)) return true;
    const aliases = ALIAS_OF.get(normQuery(name));
    if (!aliases) return false;
    for (const a of aliases) {
      if (a.length <= 3) { if (q === a) return true; }
      else if (q.length >= 3 ? a.includes(q) : a.split(" ").some(w => w.startsWith(q))) return true;
    }
    return false;
  }

  function rowNames(p) {
    const names = [];
    const add = n => { if (n != null && String(n).trim()) names.push(String(n)); };
    for (const it of (p && p.items) || []) add(it && it.name);
    for (const c of (p && p.countries) || []) add(c && (c.name || c.country || (typeof c === "string" ? c : "")));
    for (const person of (p && p.people) || []) { add(person && person.country); add(person && person.name); }
    return names;
  }

  function categoryText(p) {
    if (!p) return "";
    if (p.type === "top5") return "Guess the top 5";
    if (p.type === "match") return "Match it";
    if (p.type === "tier") return "Tier it";
    const items = p.items || [];
    const flags = items.length > 0 && items.every(it => /^\p{RI}\p{RI}$/u.test(it.emoji || ""));
    const bits = ["Rank it"];
    if (items.length === 6) bits.push("6-country", "6 countries");
    bits.push(flags || !items.length ? "countries" : "groups");
    return bits.join(" ");
  }

  function matches(p, query, opts) {
    const q = normQuery(query);
    if (!q) return true;
    if (!p) return false;
    const gloss = opts && Object.prototype.hasOwnProperty.call(opts, "gloss") ? opts.gloss : (p.valueGloss || "");
    const fields = [p.headline, p.question, p.stat, p.source, p.unit, gloss, categoryText(p)];
    if (fields.some(f => textMatches(f, q))) return true;
    return rowNames(p).some(n => nameMatches(n, q));
  }

  function countLabel(n) {
    const c = Math.max(0, Number(n) || 0);
    return c === 1 ? "1 puzzle" : `${c} puzzles`;
  }

  function emptyCopy(query) {
    const q = String(query ?? "").trim().replace(/\s+/g, " ");
    if (!q) return "No puzzles to show.";
    const shown = q.length > 60 ? q.slice(0, 57) + "…" : q;
    return `No puzzles match “${shown}”. Try a country, a headline word, or part of a name.`;
  }

  // input + clear button. onApply() reads the input itself. Returns a re-run function.
  function bindSearch(input, clearBtn, onApply) {
    const run = () => {
      onApply();
      if (clearBtn) clearBtn.hidden = !String(input.value || "").trim();
    };
    input.addEventListener("input", run);
    input.addEventListener("search", run);
    input.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !input.value) return;
      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      run();
    });
    if (clearBtn) clearBtn.addEventListener("click", () => { input.value = ""; input.focus(); run(); });
    run();
    return run;
  }

  return { normQuery, textMatches, nameMatches, rowNames, categoryText, matches, countLabel, emptyCopy, bindSearch };
});
