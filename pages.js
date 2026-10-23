// Shared by the static pages: saved/system theme (same key as the game) + the contact address from site-config.js.
(function () {
  try { var t = JSON.parse(localStorage.getItem("rankd.settings.v1") || "{}").theme || "system";
    if (t === "system") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; document.documentElement.dataset.theme = t; } catch (e) {}
  document.addEventListener("DOMContentLoaded", function () {
    var S = window.RANKD_SITE || {}, mail = S.CONTACT_EMAIL || "CONTACT_EMAIL", real = mail.indexOf("@") > 0;
    document.querySelectorAll("[data-contact]").forEach(function (el) {
      el.textContent = mail;
      if (real) { var a = document.createElement("a"); a.href = "mailto:" + mail; a.textContent = mail; el.textContent = ""; el.appendChild(a); }
      else el.classList.add("placeholder");
    });
    document.querySelectorAll("[data-contact-link]").forEach(function (el) { if (real) el.href = "mailto:" + mail; else el.remove(); });
    document.querySelectorAll("[data-updated]").forEach(function (el) { if (S.POLICY_UPDATED) el.textContent = S.POLICY_UPDATED; });
  });
})();
