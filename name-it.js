/* Name it. Type any country that passes a letter rule and a stat rule.
   Works from a script tag (window.RankdName) and from node (module.exports).
   The play screen is mounted by app.js; the checks below do not need the DOM. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RankdName = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_TRIES = 5;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
  }

  function normQuery(s) {
    const search = readGlobal("RankdSearch");
    if (search && search.normQuery) return search.normQuery(s);
    return String(s ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function fold(s) {
    return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function playable(c) {
    if (!c || !c.iso3 || !c.name) return false;
    if (String(c.iso3).indexOf("GB-") === 0) return false;
    const e = c.emoji || "";
    if (!e || e === "🏳️") return false;
    return /^\p{RI}\p{RI}$/u.test(e);
  }

  function readGlobal(key) {
    const g = typeof globalThis !== "undefined" ? globalThis : {};
    if (g[key] != null) return g[key];
    if (g.window && g.window[key] != null) return g.window[key];
    return null;
  }

  function catalog() {
    const practice = readGlobal("RANKD_PRACTICE");
    if (practice && practice.countries) {
      return Object.keys(practice.countries).map(iso3 => ({ iso3, name: practice.countries[iso3][0], emoji: practice.countries[iso3][1] })).filter(playable);
    }
    return (readGlobal("RANKD_NAME_COUNTRIES") || []).filter(playable);
  }

  function aliasGroup(name) {
    const search = readGlobal("RankdSearch");
    if (!search || !search.aliasGroup) return null;
    return search.aliasGroup(name);
  }

  function byIso(iso) {
    return catalog().find(c => c.iso3 === iso) || null;
  }

  function letterPass(name, rule) {
    if (!rule) return false;
    if (Array.isArray(rule.any)) return rule.any.some(part => letterPass(name, part));
    const n = fold(name);
    const text = fold(rule.text || "");
    if (!text) return false;
    if (rule.op === "starts") return n.startsWith(text);
    if (rule.op === "ends") return n.endsWith(text);
    if (rule.op === "contains") return n.includes(text);
    if (rule.op === "count") return n.split(text).length - 1 >= (Number(rule.min) || 1);
    return false;
  }

  function roundTo(n, places) {
    const f = 10 ** places;
    return Math.round(Number(n) * f) / f;
  }

  function formatValue(puzzle, value) {
    const fmt = (puzzle.statRule && puzzle.statRule.format) || "";
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    if (fmt === "hdi") return roundTo(n, 3).toFixed(3);
    if (fmt === "millions") return roundTo(n / 1e6, 1).toFixed(1) + " million";
    if (fmt === "years") return roundTo(n, 1).toFixed(1) + " years";
    if (fmt === "percent") return roundTo(n, 1).toFixed(1) + "%";
    return String(n);
  }

  function statClause(puzzle, value, pass) {
    const rule = puzzle.statRule || {};
    const shown = formatValue(puzzle, value);
    const tail = pass ? rule.above : rule.below;
    const noun = rule.noun ? rule.noun + " " : "";
    return `${noun}${shown}, ${tail}`;
  }

  function compare(op, value, threshold) {
    if (op === "gte") return value >= threshold;
    return value > threshold;
  }

  function hasValue(puzzle, iso) {
    const values = puzzle.values || {};
    if (!Object.prototype.hasOwnProperty.call(values, iso)) return false;
    const n = Number(values[iso]);
    return Number.isFinite(n);
  }

  function resolveCountry(raw) {
    const q = normQuery(raw);
    if (!q) return { status: "empty" };
    const list = catalog();
    const exact = list.filter(c => normQuery(c.name) === q);
    if (exact.length === 1) return { status: "ok", country: exact[0] };
    if (exact.length > 1) return { status: "ambiguous", options: exact };
    const group = aliasGroup(q);
    if (group) {
      const hits = list.filter(c => group.indexOf(normQuery(c.name)) >= 0);
      if (hits.length === 1) return { status: "ok", country: hits[0] };
      if (hits.length > 1) return { status: "ambiguous", options: hits };
    }
    return { status: "unknown" };
  }

  function suggestions(raw, used) {
    const q = normQuery(raw);
    if (!q) return [];
    const skip = used || new Set();
    const tierOf = c => {
      const n = normQuery(c.name);
      if (n.startsWith(q)) return 0;
      if (n.split(" ").some(w => w.startsWith(q))) return 1;
      if (q.length >= 3 && n.includes(q)) return 2;
      const group = aliasGroup(c.name);
      if (group && group.some(a => (a.length <= 3 ? q === a : (q.length >= 3 ? a.includes(q) : a.split(" ").some(w => w.startsWith(q)))))) return 1;
      return 9;
    };
    return catalog()
      .filter(c => !skip.has(c.iso3) && tierOf(c) < 9)
      .sort((a, b) => tierOf(a) - tierOf(b) || a.name.localeCompare(b.name, "en"))
      .slice(0, 8);
  }

  /* status: empty | unknown | ambiguous | duplicate | wrong | correct.
     counts is true only for wrong and correct. previous is a Set of iso3. */
  function judge(puzzle, raw, previous) {
    const seen = previous || new Set();
    const found = resolveCountry(raw);
    if (found.status === "empty") return { status: "empty", counts: false };
    if (found.status === "unknown") return { status: "unknown", counts: false, line: "That's not a country." };
    if (found.status === "ambiguous") return { status: "ambiguous", counts: false, line: "Which country? Pick one from the list." };
    const c = found.country;
    if (seen.has(c.iso3)) return { status: "duplicate", counts: false, country: c, line: `Already guessed ${c.name}.` };
    const letterOk = letterPass(c.name, puzzle.letter);
    const known = hasValue(puzzle, c.iso3);
    const value = known ? Number(puzzle.values[c.iso3]) : null;
    const statOk = known && compare((puzzle.statRule && puzzle.statRule.op) || "gt", value, Number(puzzle.threshold));
    const head = `${c.emoji ? c.emoji + " " : ""}${c.name}`;
    const rule = puzzle.statRule || {};
    let line;
    if (letterOk && statOk) line = `${head}: ${statClause(puzzle, value, true)}`;
    else if (letterOk && !known) line = `${head}: ${rule.missing || "no figure in this dataset"}`;
    else if (letterOk && !statOk) line = `${head}: ${statClause(puzzle, value, false)}`;
    else if (!letterOk && statOk) line = `${head}: ${puzzle.letterFail || "doesn't match the letter rule"}`;
    else if (!letterOk && !known) line = `${head}: ${rule.missing || "no figure in this dataset"}, and ${puzzle.letterFail || "doesn't match the letter rule"}`;
    else line = `${head}: ${statClause(puzzle, value, false)}, and ${puzzle.letterFail || "doesn't match the letter rule"}`;
    return {
      status: letterOk && statOk ? "correct" : "wrong",
      counts: true,
      country: c,
      letterOk,
      statOk,
      value,
      line,
    };
  }

  function fresh(puzzle) {
    return {
      type: "name",
      guesses: [],
      attempts: [],
      marks: [],
      tries: 0,
      solved: false,
      done: false,
      pick: null,
      maxTries: puzzle.maxTries || MAX_TRIES,
    };
  }

  function answerRows(puzzle) {
    const answers = puzzle.answers || [];
    return answers.map(iso => {
      const meta = (puzzle.countries || []).find(c => c.iso3 === iso) || byIso(iso) || { iso3: iso, name: iso, emoji: "" };
      const value = hasValue(puzzle, iso) ? Number(puzzle.values[iso]) : (meta.value != null ? Number(meta.value) : null);
      return { iso3: iso, name: meta.name, emoji: meta.emoji || "", value };
    }).filter(row => row.name);
  }

  function revealHtml(puzzle, result) {
    const yours = result && result.pick;
    const rows = answerRows(puzzle);
    const chips = rows.map(row => {
      const shown = row.value == null ? "" : formatValue(puzzle, row.value);
      const mine = yours && row.name === yours;
      return `<button type="button" class="name-chip${mine ? " is-yours" : ""}" data-name="${esc(row.name)}" tabindex="-1"><span class="name-flag">${esc(row.emoji)}</span><span class="name-nm">${esc(row.name)}</span>${shown ? `<span class="name-val">${esc(shown)}</span>` : ""}<span class="name-pct" hidden></span><span class="name-rare" hidden>Rare pick!</span></button>`;
    }).join("");
    const rule = puzzle.thresholdLabel ? `<p class="name-threshold">${esc(puzzle.thresholdLabel)}</p>` : "";
    return `${rule}<div class="name-answers" id="nameAnswers">${chips}</div><p class="name-rarity" id="nameRarity" hidden></p>`;
  }

  function pickShare(puzzle, snapshot, name) {
    const world = snapshot && snapshot.firstGuessWorld;
    const bars = world && Array.isArray(world.bars) ? world.bars : null;
    const players = world ? Number(world.players) || 0 : 0;
    if (bars && bars.length && players > 0) {
      const hit = bars.find(bar => bar && bar.name === name);
      return { pct: hit ? Number(hit.pct) || 0 : 0, players, seeded: players === 1 };
    }
    if (puzzle && puzzle.seedPick) return { pct: name === puzzle.seedPick ? 100 : 0, players: 1, seeded: true };
    return null;
  }

  function isRare(puzzle, pct) {
    const n = (puzzle.answers || []).length || 1;
    return Number(pct) < 100 / n;
  }

  function paintRarity(puzzle, snapshot) {
    const rootDoc = typeof document !== "undefined" ? document : null;
    if (!rootDoc || !puzzle) return null;
    const box = rootDoc.getElementById("nameAnswers");
    if (!box) return null;
    let players = null;
    let seeded = false;
    box.querySelectorAll(".name-chip").forEach(chip => {
      const share = pickShare(puzzle, snapshot, chip.dataset.name || "");
      const pctEl = chip.querySelector(".name-pct");
      const rareEl = chip.querySelector(".name-rare");
      if (!share) {
        if (pctEl) pctEl.hidden = true;
        if (rareEl) rareEl.hidden = true;
        return;
      }
      players = share.players;
      seeded = share.seeded;
      if (pctEl) {
        pctEl.hidden = false;
        pctEl.textContent = `${Math.round(share.pct)}%`;
      }
      if (rareEl) rareEl.hidden = !isRare(puzzle, share.pct);
    });
    const note = rootDoc.getElementById("nameRarity");
    if (note) {
      if (players == null) note.hidden = true;
      else {
        note.hidden = false;
        note.textContent = seeded && players === 1
          ? "Early tally · 1 play. A rarer valid answer is a Rare pick."
          : `Share of solved plays that named each country${players ? ` · ${players.toLocaleString()} ${players === 1 ? "play" : "plays"}` : ""}.`;
      }
    }
    return { players, seeded };
  }

  function seedSnapshot(puzzle) {
    if (!puzzle || !puzzle.seedPick) return null;
    const c = byIso((puzzle.countries || []).find(row => row.name === puzzle.seedPick)?.iso3) || (puzzle.countries || []).find(row => row.name === puzzle.seedPick);
    const bar = { name: puzzle.seedPick, pct: 100 };
    if (c && c.emoji) bar.emoji = c.emoji;
    const block = () => ({ players: 1, bars: [Object.assign({}, bar)] });
    return {
      type: "name",
      seeded: true,
      players: 900,
      firstGuessWorld: block(),
      firstGuessByCountry: { US: block(), TW: block(), SG: block() },
    };
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* About 12% of practice seeds become a Name it puzzle. The roll uses its own
     generator, so every other seed still walks Practice's RNG unchanged. */
  function practiceFromSeed(seed) {
    const puzzles = readGlobal("RANKD_NAME_PUZZLES") || [];
    if (!puzzles.length) return null;
    const s = Number(seed) >>> 0;
    if (mulberry(s ^ 0x4e414d45)() >= 0.12) return null;
    const pick = puzzles[Math.floor(mulberry(s ^ 0x4e414d21)() * puzzles.length)];
    if (!pick) return null;
    const clone = JSON.parse(JSON.stringify(pick));
    clone.seed = s;
    clone.practice = true;
    clone.sourceId = pick.id;
    clone.id = "rp-" + s;
    clone.order = null;
    return clone;
  }

  function $(id) { return document.getElementById(id); }

  let sugg = [];
  let sIdx = -1;
  let mounted = null;

  function closeSuggest() {
    const ul = $("nameSuggest");
    const input = $("nameInput");
    if (ul) ul.classList.add("hidden");
    if (input) input.setAttribute("aria-expanded", "false");
    sugg = [];
    sIdx = -1;
  }

  function showSuggest(list, active) {
    sugg = list;
    sIdx = active;
    const ul = $("nameSuggest");
    const input = $("nameInput");
    if (!ul) return;
    ul.innerHTML = list.length
      ? list.map((c, i) => `<li role="option" data-i="${i}" class="${i === sIdx ? "active" : ""}"><span>${esc(c.emoji || "🏳️")}</span>${esc(c.name)}</li>`).join("")
      : `<li class="empty">No country matches</li>`;
    ul.classList.remove("hidden");
    if (input) input.setAttribute("aria-expanded", "true");
  }

  function usedSet(g) {
    return new Set((g.guesses || []).map(guess => guess.iso3).filter(Boolean));
  }

  function paint(g) {
    const log = $("nameLog");
    const tries = $("nameTries");
    const form = $("nameForm");
    const max = g.maxTries || MAX_TRIES;
    if (log) {
      log.innerHTML = (g.guesses || []).map(guess => `<li class="${guess.status === "correct" ? "good" : "bad"}">${esc(guess.line || "")}</li>`).join("");
    }
    if (tries) {
      const dots = Array.from({ length: max }, (_, n) => {
        const mark = (g.marks || [])[n];
        if (!mark) return "<i></i>";
        return `<i class="${mark === "good" ? "win" : "used"}"></i>`;
      }).join("");
      const left = max - (g.tries || 0);
      const label = g.done ? (g.solved ? `Solved in ${g.tries}` : "Out of tries") : `${left} ${left === 1 ? "try" : "tries"} left`;
      tries.innerHTML = `${dots}<span>${label}</span>`;
    }
    if (form) {
      form.classList.toggle("hidden", !!g.done);
      const foot = form.querySelector(".card-foot");
      if (foot) foot.classList.toggle("hidden", !!g.done);
    }
  }

  function mount(host) {
    const puzzle = host.puzzle;
    const g = host.saved && host.saved.type === "name" && Array.isArray(host.saved.guesses) ? host.saved : fresh(puzzle);
    g.type = "name";
    g.maxTries = puzzle.maxTries || host.maxTries || MAX_TRIES;
    mounted = { host, puzzle, g };
    const dir = $("nameDir");
    const rule = $("nameRule");
    if (dir) dir.textContent = "Any valid country wins";
    if (rule) rule.textContent = puzzle.thresholdLabel || "";
    const input = $("nameInput");
    const form = $("nameForm");
    if (input) input.value = "";
    closeSuggest();
    paint(g);
    if (form && !form.dataset.nameBound) {
      form.dataset.nameBound = "1";
      form.addEventListener("submit", e => { e.preventDefault(); onSubmit(); });
      input.addEventListener("input", () => {
        const state = mounted;
        if (!state || state.g.done) return;
        const list = suggestions(input.value, usedSet(state.g));
        const q = normQuery(input.value);
        if (!q) { closeSuggest(); return; }
        if (list.length === 1 && normQuery(list[0].name) === q) { closeSuggest(); return; }
        showSuggest(list, list.length ? 0 : -1);
      });
      input.addEventListener("keydown", e => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (!sugg.length) return;
          e.preventDefault();
          sIdx = e.key === "ArrowDown" ? Math.min(sugg.length - 1, sIdx + 1) : Math.max(0, sIdx - 1);
          showSuggest(sugg, sIdx);
        } else if (e.key === "Escape") closeSuggest();
      });
      input.addEventListener("focus", () => { if (mounted && mounted.host.onFit) mounted.host.onFit(); });
      const ul = $("nameSuggest");
      if (ul) ul.addEventListener("mousedown", e => {
        const li = e.target.closest("li[data-i]");
        if (!li || li.classList.contains("empty")) return;
        e.preventDefault();
        const c = sugg[+li.dataset.i];
        if (c && input) { input.value = c.name; closeSuggest(); input.focus(); }
      });
    }
    if (g.done && host.onFinish) host.onFinish(g, { restore: true });
    return g;
  }

  function onSubmit() {
    const state = mounted;
    if (!state || state.g.done) return;
    const input = $("nameInput");
    if (!input) return;
    const raw = input.value;
    const exact = resolveCountry(raw);
    if (exact.status !== "ok") {
      if (sIdx >= 0 && sugg[sIdx]) {
        input.value = sugg[sIdx].name;
        closeSuggest();
        return;
      }
    }
    const verdict = judge(state.puzzle, raw, usedSet(state.g));
    if (verdict.status === "empty") return;
    if (!verdict.counts) {
      const log = $("nameLog");
      if (log && verdict.line) {
        const li = document.createElement("li");
        li.className = "note";
        li.textContent = verdict.line;
        log.appendChild(li);
      }
      if (verdict.status === "unknown" && state.host.onToast) state.host.onToast("That's not a country.");
      return;
    }
    const mark = verdict.status === "correct" ? "good" : "bad";
    state.g.guesses.push({
      iso3: verdict.country.iso3,
      name: verdict.country.name,
      emoji: verdict.country.emoji || "",
      status: verdict.status,
      line: verdict.line,
      counts: true,
    });
    state.g.attempts.push({ marks: [mark] });
    state.g.marks.push(mark);
    state.g.tries = state.g.marks.length;
    input.value = "";
    closeSuggest();
    if (verdict.status === "correct") {
      state.g.solved = true;
      state.g.done = true;
      state.g.pick = verdict.country.name;
    } else if (state.g.tries >= (state.g.maxTries || MAX_TRIES)) {
      state.g.solved = false;
      state.g.done = true;
    }
    paint(state.g);
    if (state.g.done) {
      if (state.host.onFinish) state.host.onFinish(state.g, { restore: false });
    } else if (state.host.onDraft) state.host.onDraft(state.g);
    if (!state.g.done) input.focus({ preventScroll: true });
  }

  return {
    MAX_TRIES, esc, normQuery, fold, letterPass, formatValue, resolveCountry, suggestions, judge,
    answerRows, revealHtml, pickShare, isRare, paintRarity, seedSnapshot, practiceFromSeed, mount, catalog,
  };
});
