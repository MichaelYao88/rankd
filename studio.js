/* v12 Rankd Studio (studio.html, unlinked + noindexed). Scope (Oct 22 scope cut): just two lists.
   1. PREVIEW: every scheduled day (date, #, headline, subtitle, mode, item count) with a Play button that opens
      index.html?preview=YYYY-MM-DD. Preview play is sandboxed (rankd.preview.* keys), so real stats/streaks are untouched.
   2. DATASETS: every dataset in practice-data.js (name, source, year, count, times used in the daily schedule); tap one to
      expand its full table. Data and date helpers come from app.js (window.RankdShared). */
(() => {
"use strict";
const S = window.RankdShared, $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad3 = n => String(n).padStart(3, "0");
const fmtDate = k => new Date(k + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const num = v => typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : esc(v);
const P = S.puzzles, today = S.todayKey(), tn = S.dayNumber(today);

const modeOf = p => p.type === "match" ? ["Match it", `${p.people.length} pairs`] : p.type === "top5" ? ["Guess the top 5", `${p.countries.length} countries`]
  : ["Rank it", `${p.items.length} ${p.items.every(x => /^(\p{RI}\p{RI}|\u{1F3F4}[\u{E0020}-\u{E007F}]+)$/u.test(x.emoji || "")) ? "countries" : "groups"}`];
const days = P.map((p, n) => ({ p, n, key: S.keyFromDay(n) }));
$("#pvNote").textContent = `${P.length} days, ${fmtDate(days[0].key)} (#001) to ${fmtDate(days[days.length - 1].key)} (#${pad3(P.length)}). Play opens a sandboxed preview: it never touches real stats or streaks.`;
$("#days").innerHTML = days.map(({ p, n, key }) => { const [m, c] = modeOf(p), when = n < tn ? "past" : n === tn ? "today" : "future";
  return `<li class="day ${when}" data-id="${esc(p.id)}" data-key="${key}">
    <div class="d-when"><b>#${pad3(n + 1)}</b>${fmtDate(key).replace(/, \d{4}$/, "")}${n === tn ? "<br><b>Today</b>" : ""}</div>
    <div class="d-main"><h2>${esc(p.emoji || "")} ${esc(p.headline || p.question)}</h2><p>${esc(p.headline ? p.question : p.stat)}</p>
      <div class="tags"><span class="tag mode-${p.type}">${m}</span><span class="tag cnt">${c}</span>${p.sensitive ? `<span class="tag sens">sensitive</span>` : ""}</div></div>
    <a class="play" href="index.html?preview=${key}">Play</a></li>`; }).join("");

const D = (S.practice && S.practice.datasets) || [], C = (S.practice && S.practice.countries) || {};
// times used in the daily schedule: rankers carry p.dataset; Top 5 dailies use the list "top-x" as puzzle "top5-x"; group datasets share the puzzle id
const used = id => P.filter(p => p.dataset === id || p.id === id || p.id === id.replace(/^top-/, "top5-")).length;
$("#dsNote").textContent = `${D.length} datasets (the full lists behind random Practice and the dailies). Tap one for its table.`;
$("#sets").innerHTML = D.map((d, i) => `<li class="set" data-id="${esc(d.id)}"><button aria-expanded="false" data-i="${i}">
    <span class="s-emoji">${esc(d.emoji || "📊")}</span>
    <span class="s-main"><b>${esc(d.title)}</b><small>${esc(d.src)}</small></span>
    <span class="s-nums"><b>${d.rows.length}</b> ${d.kind === "groups" ? "groups" : "countries"}<br>${esc(d.year || "")} · used <b class="used">${used(d.id)}</b>×</span>
  </button></li>`).join("");
const table = d => {
  const rows = d.kind === "groups" ? d.rows.map(r => [r[1] + " " + r[0], r[2], ""]) : d.rows.map(r => [(C[r[0]] ? C[r[0]][1] + " " + C[r[0]][0] : r[0]), r[1], r.length > 2 ? r[2] : ""]);
  const sorted = rows.slice().sort((a, b) => d.hi === "bottom" ? a[1] - b[1] : b[1] - a[1]), yr = sorted.some(r => r[2] !== "");
  return `<p>${esc(d.stat)}${d.unit ? ` (${esc(d.unit)})` : ""}</p><p><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a></p>
    ${d.caveat ? `<p class="cav">${/^caveat/i.test(d.caveat) ? "" : "Caveat: "}${esc(d.caveat)}</p>` : ""}
    <table><thead><tr><th class="n">#</th><th>${d.kind === "groups" ? "Group" : "Country"}</th><th class="n">Value</th>${yr ? `<th class="n">Year</th>` : ""}</tr></thead><tbody>
    ${sorted.map((r, k) => `<tr><td class="n">${k + 1}</td><td>${esc(r[0])}</td><td class="n">${num(r[1])}</td>${yr ? `<td class="n">${esc(r[2])}</td>` : ""}</tr>`).join("")}</tbody></table>`;
};
$("#sets").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (!b) return; const li = b.parentElement, open = b.getAttribute("aria-expanded") === "true";
  b.setAttribute("aria-expanded", String(!open)); const body = li.querySelector(".s-body");
  if (open) { body && body.remove(); return; }
  li.insertAdjacentHTML("beforeend", `<div class="s-body">${table(D[+b.dataset.i])}</div>`); });

const tab = v => { $("#tabPreview").setAttribute("aria-selected", String(v === "preview")); $("#tabData").setAttribute("aria-selected", String(v === "data"));
  $("#previewView").classList.toggle("hidden", v !== "preview"); $("#dataView").classList.toggle("hidden", v !== "data"); if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v); };
$("#tabPreview").onclick = () => tab("preview"); $("#tabData").onclick = () => tab("data");
tab(location.hash === "#data" ? "data" : "preview");
const t = document.querySelector(".day.today"); if (t && location.hash !== "#data") t.scrollIntoView({ block: "center" });
})();
