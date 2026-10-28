/* app.js — tabs, settings, boot. */
(function (root) {
  "use strict";
  const { UI } = root;
  const VERSION = "1.6.0 (2026-10-28)";
  const TITLES = { odds: "Odds", study: "Study", play: "Hold'em", home: "Home game", settings: "Settings" };

  // Measured strengths (tools/measure.js) — shown behind the "How strong?" ?
  const STRENGTH = root.STRENGTH || null;
  // tools/measure.js, 2026-10-19. Ring = 6 seats, 2 of each level; numbers are big blinds won per 100 hands.
  const ROWS = [
    ["No limit", -374, 163, 211, "+52"],
    ["Pot limit", -407, 152, 255, "+54"],
    ["Fixed limit", -55, 29, 26, "−5"],
  ];
  const col = (n) => `<b style="color:${UI.scale(n, -250, 250)}">${n > 0 ? "+" : ""}${n}</b>`;
  root.STRENGTH_TEXT = `<table class="strength"><tr><th></th><th>Easy</th><th>Medium</th><th>Hard</th><th>Hard vs Medium</th></tr>${ROWS.map((r) => `<tr><td>${r[0]}</td><td>${col(r[1])}</td><td>${col(r[2])}</td><td>${col(r[3])}</td><td>${r[4]}</td></tr>`).join("")}</table>
    <p>Big blinds won per 100 hands at a six-seat table (two of each level), 8,000–20,000 hands each. Hard vs Medium is a separate heads-up match. In fixed limit, Hard and Medium are about even: bets are too small for Hard's bluffs and big value bets to matter.</p>`;
  root.helpExtra = {
    strength: () => {
      const s = root.STRENGTH_TEXT || "";
      return `<p>Measured, not guessed: the computers played long simulated sessions against each other (100 big blinds each, seats reshuffled, same cards replayed with seats swapped heads-up to cancel luck).</p>${s}`;
    },
    format: () => `<p><b>Cash:</b> blinds stay 10/20. Out of chips? Buy back in.</p><p><b>Tournament:</b> blinds go up every ${UI.Store.data.settings.blindHands || 10} hands (Settings → Tournament blinds). Last player with chips wins.</p>`,
  };
  void STRENGTH;

  const inited = {};
  function go(tab, fromBack) {
    const d = UI.Store.data;
    // the phone's Back goes to the tab you were just on
    if (!fromBack && d.tab !== tab && inited.any) { try { history.pushState({ tab }, ""); } catch (e) { /* ignore */ } }
    inited.any = 1;
    d.tab = tab;
    UI.Store.save();
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === tab));
    document.getElementById("title").textContent = TITLES[tab];
    document.getElementById("topInfo").innerHTML = "";
    const v = document.getElementById("view-" + tab);
    if (tab === "odds") { if (!inited.odds) { root.OddsTab.init(v); inited.odds = 1; } else root.OddsTab.render(); }
    if (tab === "play") { if (!inited.play) { root.PlayTab.init(v); inited.play = 1; } else root.PlayTab.render(); }
    if (tab === "study") { if (!inited.study) { root.StudyTab.init(v); inited.study = 1; } root.StudyTab.render(); }
    if (tab === "home") { if (!inited.home) { root.HomeTab.init(v); inited.home = 1; } else root.HomeTab.render(); }
    if (tab === "settings") renderSettings(v);
  }

  function renderSettings(v) {
    const s = UI.Store.data.settings;
    const sw = (k, t, sub) => `<div class="srow"><div class="t">${t}${sub ? `<small>${sub}</small>` : ""}</div><label class="switch"><input type="checkbox" data-s="${k}" ${s[k] ? "checked" : ""}><span></span></label></div>`;
    v.innerHTML = `<div class="settings scroll" style="flex:1">
      <div class="sgroup label">Play</div>
      ${sw("overlay", "Odds while playing", "Your win chance and the price to call")}
      ${sw("hints", "Hint button", "What the Hard computer would do")}
      ${sw("undo", "Undo button", "Take back your last move against the computers")}
      ${sw("autoNext", "Deal the next hand automatically")}
      <div class="srow"><div class="t">Computer speed</div><div class="seg" style="width:210px">${["slow", "normal", "fast"].map((k) => `<button data-speed="${k}" class="${s.speed === k ? "on" : ""}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div></div>
      <div class="srow"><div class="t">Tournament blinds<small>Hands between blind raises (new tables)</small></div><div class="seg" style="width:210px">${[[5, "5"], [10, "10"], [20, "20"]].map(([k, t]) => `<button data-blinds="${k}" class="${(s.blindHands || 10) === k ? "on" : ""}">${t}</button>`).join("")}</div></div>
      <div class="sgroup label">Cards</div>
      ${sw("fourColor", "Four-colour deck", "Clubs green, diamonds blue")}
      ${root.FX ? `<div class="sgroup label">Sound & effects</div><div data-fxbox></div>` : ""}
      ${root.COACH && root.HoldemCoach ? `<div class="sgroup label">Learn</div>
      <div class="srow"><div class="t">Rules</div><button class="btn small" data-rules>Open</button></div>
      <div class="srow"><div class="t">Guided first game<small>One hand against an Easy computer, step by step</small></div><button class="btn small" data-tutorial>Start</button></div>` : ""}
      <div class="sgroup label">About</div>
      <div class="srow"><div class="t">How strong are the computers?</div><button class="qm" data-help="strength">?</button></div>
      <div class="srow"><div class="t">Clear hand history<small>${UI.Store.data.history.length} hands saved on this device</small></div><button class="btn small danger" data-clearhist>Clear</button></div>
      <div class="ver">Version ${VERSION}</div>
    </div>`;
    const box = v.querySelector("[data-fxbox]");
    if (box) root.FX.renderSettings(box);
  }

  document.addEventListener("change", (e) => {
    const k = e.target.dataset && e.target.dataset.s;
    if (!k) return;
    UI.Store.data.settings[k] = e.target.checked;
    UI.Store.save();
    applySettings();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab], [data-speed], [data-blinds], [data-clearhist], [data-confirmclear], [data-rules], [data-tutorial]");
    if (!b) return;
    if (b.dataset.rules !== undefined) openRules();
    else if (b.dataset.tutorial !== undefined) startTutorial();
    else if (b.dataset.tab) go(b.dataset.tab);
    else if (b.dataset.blinds) { UI.Store.data.settings.blindHands = +b.dataset.blinds; UI.Store.save(); renderSettings(document.getElementById("view-settings")); }
    else if (b.dataset.speed) { UI.Store.data.settings.speed = b.dataset.speed; UI.Store.save(); renderSettings(document.getElementById("view-settings")); }
    else if (b.dataset.clearhist !== undefined) {
      UI.Sheet.open(`<h3>Clear hand history?</h3><p>Removes all ${UI.Store.data.history.length} saved hands from this device.</p><div class="row"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" data-close data-confirmclear>Clear</button></div>`);
    } else if (b.dataset.confirmclear !== undefined) {
      UI.Store.data.history = []; UI.Store.data.stats = { hands: 0, net: 0 }; UI.Store.save();
      renderSettings(document.getElementById("view-settings")); UI.toast("History cleared");
    }
  });

  function applySettings() {
    document.body.classList.toggle("four-color", !!UI.Store.data.settings.fourColor);
  }

  // Re-render the current tab when crossing the phone/laptop width.
  let wasWide = root.innerWidth >= 900;
  root.addEventListener("resize", () => {
    const w = root.innerWidth >= 900;
    if (w !== wasWide) { wasWide = w; go(UI.Store.data.tab); }
  });

  UI.Store.load();
  applySettings();
  if (root.FX) {
    const fx = () => {
      document.body.classList.toggle("fx-noanim", !root.FX.settings.animations);
      document.body.classList.toggle("fx-fast", root.FX.settings.animSpeed === "fast");
    };
    root.FX.init({ game: "holdem", accent: "#6ea8fe", onChange: fx });
    fx();
  }
  // ---- rules sheet + guided first game (shared _coach kit; js/coach-holdem.js has the words)
  let tour = null;
  function openRules(open) {
    if (!root.COACH || !root.HoldemCoach) return;
    UI.Sheet.close();
    root.COACH.rules(Object.assign(root.HoldemCoach.rules(), { open }));
  }
  function startTutorial() {
    if (!tour) return;
    if (root.COACH) root.COACH.closeOffer();
    tour.reset();
    root.PlayTab.startTutorial();
    if (root.PlayTab.isTutorial()) tour.start();
  }
  if (root.COACH && root.HoldemCoach) {
    tour = root.COACH.tour({
      id: root.HoldemCoach.ID,
      steps: root.HoldemCoach.steps({ state: () => (root.PlayTab ? root.PlayTab.state() : null), overlay: () => !!UI.Store.data.settings.overlay }),
      pauseIf: () => UI.Store.data.tab !== "play" || !document.getElementById("sheet").hidden || !root.PlayTab || !root.PlayTab.isTutorial() || !root.PlayTab.state() || (root.Profile && root.Profile.isOpen()),
    });
    // the sheet opening or closing re-checks pauseIf at once
    new MutationObserver(() => root.COACH.update()).observe(document.getElementById("sheet"), { attributes: true, attributeFilter: ["hidden"] });
  }
  /** First visit, on the setup screen: offer the guided game once. */
  function offerTutorial() {
    if (!tour || !root.COACH || UI.Store.data.tab !== "play" || UI.Store.data.game || tour.seen() || tour.saved() || root.COACH.offered(root.HoldemCoach.ID)) return;
    if (UI.Store.data.history.length) return; // played here before: not new
    root.COACH.offer({ id: root.HoldemCoach.ID, title: "New to Hold'em?", text: "Play one guided hand against an Easy computer.", yes: "Teach me", no: "No thanks", onYes: startTutorial });
  }

  root.App = { go, VERSION, openRules, startTutorial };
  try { history.replaceState({ tab: UI.Store.data.tab || "play" }, ""); } catch (e) { /* ignore */ }
  root.addEventListener("popstate", (e) => {
    if (root.COACH && root.COACH.rulesOpen()) { root.COACH.closeRules(); try { history.pushState({ tab: UI.Store.data.tab }, ""); } catch (er) { /* ignore */ } return; }
    if (root.Profile && root.Profile.isOpen()) { root.Profile.closePanel(); try { history.pushState({ tab: UI.Store.data.tab }, ""); } catch (er) { /* ignore */ } return; }
    UI.Sheet.close();
    const tab = e.state && e.state.tab;
    if (tab && TITLES[tab]) go(tab, true);
  });
  // another tab of this site saved: follow it (keep this tab's own screen)
  root.addEventListener("storage", (e) => {
    if (e.key !== "holdem:v1" || !e.newValue) return;
    const tab = UI.Store.data.tab;
    UI.Store.load();
    UI.Store.data.tab = tab;
    applySettings();
    if (inited.play) root.PlayTab.sync();
  });
  // ---- My stats (shared _profile kit: everything stays on this device)
  if (root.Profile && root.HoldemProfile) {
    root.Profile.init({
      game: "holdem", levels: root.HoldemProfile.LEVELS, achievements: root.HoldemProfile.achievements,
      modes: { help: { name: "Computers, with help" }, online: { hide: true } },
      daily: { title: "Daily game", onPlay: () => root.PlayTab.startDaily() },
      onChange: (what) => { if ((what === "me" || what === "import") && UI.Store.data.tab === "play" && !UI.Store.data.game) root.PlayTab.render(); },
    });
  }
  go(UI.Store.data.tab || "play");
  if (tour && root.PlayTab.isTutorial()) tour.resume(); // carry on after a reload
  offerTutorial();
  // ---- home-screen app (shared _pwa kit): a new deploy reloads by itself only when nothing would be lost
  if (root.PWA) root.PWA.safeToReload = () => {
    const ae = document.activeElement;
    if (!document.getElementById("sheet").hidden || (root.COACH && root.COACH.rulesOpen()) || (root.Profile && root.Profile.isOpen())) return false;
    if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return false;
    if (root.PlayTab.online()) return false;
    if (UI.Store.data.home && UI.Store.data.home.running) return false; // a home game's blind clock is ticking
    // mid-hand on the table: wait (the game is saved, but a reload would blink the table)
    return UI.Store.data.tab !== "play" || !root.PlayTab.busy();
  };
})(this);
