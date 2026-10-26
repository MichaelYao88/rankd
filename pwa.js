/* Ranki install affordance + service worker registration.
   Loaded on the public pages (game, about, privacy, how to play).
   Studio and ?preview= return before register(). The worker itself also
   refuses those requests. No reload on controllerchange: an in-progress
   game keeps its board when an update claims the page. */
(function () {
  "use strict";
  var DISMISS_KEY = "ranki.pwa.dismissedAt";
  var DISMISS_MS = 365 * 24 * 60 * 60 * 1000;
  var booted = false;
  var deferred = null;

  function params() {
    try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); }
  }
  function path() { return (location.pathname || "").toLowerCase(); }
  function studioPage() {
    if (window.RANKD_STUDIO) return true;
    var p = path();
    return /(?:^|\/)studio\.html$/.test(p) || /(?:^|\/)loadingzone\.html$/.test(p) || /(?:^|\/)loadingzone\/?$/.test(p) || /(?:^|\/)loadingzone\//.test(p);
  }
  function blocked() {
    if (studioPage() || params().has("preview")) return true;
    if (location.protocol === "https:") return false;
    if (location.protocol === "http:") {
      var host = location.hostname;
      return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
    }
    return true;
  }
  function standalone() {
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e) {}
    return window.navigator.standalone === true;
  }
  function dismissed() {
    try {
      var t = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return t > 0 && (Date.now() - t) < DISMISS_MS;
    } catch (e) { return false; }
  }
  function isIos() {
    var ua = navigator.userAgent || "";
    if (/android/i.test(ua)) return false;
    if (/iphone|ipad|ipod/i.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }
  function rememberDismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }
  function hideInstallUi() {
    ["pwaInstallWrap", "pwaIosHint", "mInstall", "pwaResultInstall"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }
  function dismiss() {
    rememberDismiss();
    hideInstallUi();
    deferred = null;
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    var opts = { scope: "/", updateViaCache: "none" };
    navigator.serviceWorker.register("/sw.js", opts).catch(function () {
      return navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }).catch(function () {});
    // controllerchange fires when clients.claim() takes the page. Do not
    // reload: puzzle state is in memory and would be thrown away mid-game.
  }

  function promptInstall() {
    var promptEvent = deferred;
    if (!promptEvent || typeof promptEvent.prompt !== "function") return;
    deferred = null;
    Promise.resolve(promptEvent.prompt()).then(function () { return promptEvent.userChoice; }).then(function (choice) {
      if (choice && choice.outcome === "accepted") dismiss();
      else hideInstallUi();
    }).catch(function () { hideInstallUi(); });
  }

  function installIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    [["M12 4v10"], ["M8 10l4 4 4-4"], ["M5 19h14"]].forEach(function (d) {
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d[0]);
      svg.appendChild(path);
    });
    return svg;
  }

  function placeWrap(wrap) {
    var gear = document.getElementById("menuBtn");
    if (gear && gear.parentNode) {
      var tools = document.getElementById("topbarTools");
      if (!tools) {
        tools = document.createElement("div");
        tools.id = "topbarTools";
        tools.className = "topbar-tools";
        gear.parentNode.insertBefore(tools, gear);
        tools.appendChild(gear);
      }
      tools.insertBefore(wrap, gear);
      return;
    }
    var top = document.querySelector(".page-top");
    if (!top) return;
    var play = top.querySelector(".play-link");
    if (play) top.insertBefore(wrap, play);
    else top.appendChild(wrap);
  }

  function showChip() {
    if (!deferred || standalone() || dismissed() || isIos() || document.getElementById("pwaInstall")) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showChip, { once: true });
      return;
    }
    var wrap = document.createElement("span");
    wrap.id = "pwaInstallWrap";
    wrap.className = "pwa-install-wrap";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "pwaInstall";
    btn.className = "round-btn pwa-install";
    btn.setAttribute("aria-label", "Install Ranki");
    btn.title = "Install Ranki";
    btn.appendChild(installIcon());
    btn.addEventListener("click", promptInstall);
    var x = document.createElement("button");
    x.type = "button";
    x.className = "pwa-install-x";
    x.setAttribute("aria-label", "Hide install button");
    x.title = "Not now";
    x.textContent = "×";
    x.addEventListener("click", function (e) { e.stopPropagation(); dismiss(); });
    wrap.appendChild(btn);
    wrap.appendChild(x);
    placeWrap(wrap);
  }

  function showIosHint() {
    if (!isIos() || standalone() || dismissed() || document.getElementById("pwaIosHint")) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showIosHint, { once: true });
      return;
    }
    var header = document.querySelector(".topbar") || document.querySelector(".page-top");
    if (!header) return;
    var bar = document.createElement("p");
    bar.id = "pwaIosHint";
    bar.className = "pwa-ios-hint";
    var text = document.createElement("span");
    text.appendChild(document.createTextNode("Add Ranki: Share, then "));
    var b = document.createElement("b");
    b.textContent = "Add to Home Screen";
    text.appendChild(b);
    text.appendChild(document.createTextNode("."));
    var x = document.createElement("button");
    x.type = "button";
    x.className = "pwa-install-x";
    x.setAttribute("aria-label", "Dismiss");
    x.textContent = "×";
    x.addEventListener("click", dismiss);
    bar.appendChild(text);
    bar.appendChild(x);
    header.insertAdjacentElement("afterend", bar);
    rememberDismiss();
  }

  function injectMenu() {
    if (standalone() || dismissed() || !deferred || isIos()) return;
    var list = document.querySelector("#modalBody .menu-list");
    if (!list || document.getElementById("mInstall")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.id = "mInstall";
    button.appendChild(document.createTextNode("Install Ranki"));
    var small = document.createElement("small");
    small.textContent = "Add it to your home screen";
    button.appendChild(small);
    button.addEventListener("click", function () { promptInstall(); });
    list.insertBefore(button, list.firstChild);
  }

  function showResultLink() {
    if (!deferred || standalone() || dismissed() || isIos()) return;
    var result = document.getElementById("result");
    if (!result || result.classList.contains("hidden") || document.getElementById("pwaResultInstall")) return;
    var row = result.querySelector(".share-row");
    if (!row) return;
    var button = document.createElement("button");
    button.type = "button";
    button.id = "pwaResultInstall";
    button.className = "link-btn pwa-result-install";
    button.textContent = "Install app";
    button.addEventListener("click", promptInstall);
    row.insertAdjacentElement("afterend", button);
  }

  function watchResult() {
    var result = document.getElementById("result");
    if (!result || typeof MutationObserver !== "function") return;
    new MutationObserver(showResultLink).observe(result, { attributes: true, attributeFilter: ["class"] });
  }

  function onClick(e) {
    var t = e.target;
    if (t && t.closest && t.closest("#menuBtn")) setTimeout(injectMenu, 0);
  }

  function mount() {
    if (standalone() || blocked()) return;
    document.addEventListener("click", onClick);
    watchResult();
    if (isIos()) showIosHint();
    else showChip();
  }

  function onPrompt(e) {
    if (blocked()) return;
    e.preventDefault();
    if (standalone() || dismissed() || isIos()) return;
    deferred = e;
    showChip();
    showResultLink();
  }

  function start() {
    if (booted) return;
    booted = true;
    if (blocked()) return;
    registerSW();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", dismiss);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }

  window.RankiPwa = { start: start };
  start();
})();
