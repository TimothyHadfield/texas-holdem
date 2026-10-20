/* home.js — companion for a real home game: blind timer, chip counts,
 * settle up (cash) and payouts / fair deal (tournament). Saved on every change. */
(function (root) {
  "use strict";
  const { UI, HomeCalc: HC, Engine: E } = root;
  const { esc, fmt, qm, Sheet } = UI;

  const DENOMS = [
    { name: "White", value: 1, color: "#e9e9ee" }, { name: "Red", value: 5, color: "#d64545" },
    { name: "Green", value: 25, color: "#2e9e5b" }, { name: "Black", value: 100, color: "#1b1d24" },
    { name: "Purple", value: 500, color: "#8e5cd9" },
  ];

  let el, H, tick = 0;

  function defaults() {
    return {
      sub: "timer", minutes: 15, level: 0, running: false, endAt: 0, remaining: 15 * 60000,
      startBB: 20, antes: false, mode: "cash", buyIn: 20, chipsPerBuyIn: 1000, payout: "3",
      players: [{ name: "Tim", chips: 1000, buyIns: 1 }, { name: "Player 2", chips: 1000, buyIns: 1 }, { name: "Player 3", chips: 1000, buyIns: 1 }, { name: "Player 4", chips: 1000, buyIns: 1 }],
    };
  }

  /** The saved home-game state (made once, shared with the background timer). */
  function ensureH() {
    if (!H && UI.Store.data) H = UI.Store.data.home = Object.assign(defaults(), UI.Store.data.home || {});
    return H;
  }

  function init(container) {
    el = container;
    ensureH();
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    render();
  }
  const save = () => UI.Store.save();

  function levels() {
    const k = H.startBB / E.LEVELS[0][1];
    return E.LEVELS.map(([sb, bb]) => [Math.round(sb * k), Math.round(bb * k), H.antes ? Math.round(bb * k) : 0]);
  }
  const blindsText = (L) => `${fmt(L[0])}/${fmt(L[1])}${L[2] ? `<small style="font-size:.4em;color:var(--muted)"> ante ${fmt(L[2])}</small>` : ""}`;

  function render() {
    const tab = (k, t) => `<button data-sub="${k}" class="${H.sub === k ? "on" : ""}">${t}</button>`;
    const wide = root.innerWidth >= 900;
    let body;
    if (wide && H.sub !== "settle") body = `<div class="home-body split"><div style="display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--line)">${timerHTML()}</div><div style="display:flex;flex-direction:column;min-height:0">${chipsHTML()}</div></div>`;
    else body = H.sub === "timer" ? timerHTML() : H.sub === "chips" ? chipsHTML() : settleHTML();
    el.innerHTML = `<div class="home-wrap"><div class="home-tabs"><div class="seg">${wide ? tab("timer", "Timer & chips") : tab("timer", "Timer") + tab("chips", "Chips")}${tab("settle", "Settle up")}</div></div>${body}</div>`;
    update();
  }

  // -------------------------------------------------------------- timer
  function timerHTML() {
    const L = levels(), lv = Math.min(H.level, L.length - 1);
    const live = H.players.filter((p) => +p.chips > 0);
    const avg = live.length ? H.players.reduce((a, p) => a + (+p.chips || 0), 0) / live.length : 0;
    return `<div class="timer">
      <div class="lvl">Level ${lv + 1}</div>
      <div class="blinds" id="tBlinds">${blindsText(L[lv])}</div>
      <div class="clock" id="tClock">--:--</div>
      <div class="tbar"><b id="tBar" style="width:0%"></b></div>
      <div class="next">Next: ${lv + 1 < L.length ? blindsText(L[lv + 1]).replace(/<small[^>]*>/, " · ").replace("</small>", "") : "—"}${avg ? ` · Avg stack ${fmt(avg)} (${(avg / L[lv][1]).toFixed(0)} BB)` : ""}</div>
      <div class="ctrls">
        <button class="btn" data-t="prev" aria-label="Previous level">◀◀</button>
        <button class="btn ${H.running ? "" : "warm"} play" data-t="toggle">${H.running ? "Pause" : "Start"}</button>
        <button class="btn" data-t="next" aria-label="Next level">▶▶</button>
      </div>
      <div class="ctrls" style="flex-wrap:wrap;justify-content:center">
        <span class="label">Minutes</span><div class="stepper"><button data-min="-1">−</button><b>${H.minutes}</b><button data-min="1">+</button></div>
        <span class="label">Start</span><select data-f="startBB">${[2, 10, 20, 50, 100].map((b) => `<option value="${b}" ${H.startBB === b ? "selected" : ""}>${b / 2}/${b}</option>`).join("")}</select>
        <label class="switch" title="Big blind ante"><input type="checkbox" data-f="antes" ${H.antes ? "checked" : ""}><span></span></label><span class="label">Ante</span>
      </div>
    </div>`;
  }

  function remaining() {
    return H.running ? Math.max(0, H.endAt - Date.now()) : H.remaining;
  }

  function update() {
    // The clock runs whatever tab is showing: levels roll over and beep here;
    // only the screen updates wait until the Home tab is open.
    if (!UI.Store.data || !(H || (UI.Store.data.home && UI.Store.data.home.running))) return;
    ensureH();
    const shown = !!el && UI.Store.data.tab === "home";
    // roll levels forward if time ran out (even while the phone was locked)
    if (H.running && Date.now() >= H.endAt) {
      const L = levels();
      while (H.running && Date.now() >= H.endAt) {
        if (H.level >= L.length - 1) { H.running = false; H.remaining = 0; break; }
        H.level++;
        H.endAt += H.minutes * 60000;
      }
      beep();
      save();
      if (shown) render();
      return;
    }
    if (!shown) return;
    const c = el.querySelector("#tClock");
    if (!c) return;
    const ms = remaining();
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    c.textContent = `${m}:${String(s).padStart(2, "0")}`;
    c.classList.toggle("low", ms < 60000);
    const bar = el.querySelector("#tBar");
    if (bar) bar.style.width = (100 * (1 - ms / (H.minutes * 60000))).toFixed(1) + "%";
  }

  let actx = null;
  function beep() {
    try {
      actx = actx || new (root.AudioContext || root.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = 880; g.gain.value = 0.15;
        o.connect(g); g.connect(actx.destination);
        o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.15);
      });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (e) { /* sound not allowed: the screen still changes */ }
  }

  // -------------------------------------------------------------- chips
  function chipsHTML() {
    const total = H.players.reduce((a, p) => a + (+p.chips || 0), 0);
    const expected = H.players.reduce((a, p) => a + (+p.buyIns || 0), 0) * H.chipsPerBuyIn;
    const rows = H.players.map((p, i) => `<div class="prow">
      <input class="nm" type="text" value="${esc(p.name)}" data-p="${i}" data-k="name" aria-label="Name">
      <button class="btn small ghost" data-count="${i}" aria-label="Count by colour">${chipsIcon()}</button>
      <input class="ch" type="number" inputmode="numeric" min="0" value="${esc(p.chips)}" data-p="${i}" data-k="chips" aria-label="Chips"></div>`).join("");
    const diff = total - expected;
    return `<div class="plist scroll" style="flex:1">${rows}</div>
      <div class="home-foot"><button class="btn small" data-addp>Add player</button><span class="spacer"></span>
      <span>Total <b class="num">${fmt(total)}</b>${diff ? ` <span class="${diff > 0 ? "warm" : "bad"}">(${diff > 0 ? "+" : ""}${fmt(diff)} vs buy-ins)</span>` : ""}</span></div>`;
  }
  const chipsIcon = () => `<span class="chip" style="--cc:#d64545"></span>`;

  function openCounter(i) {
    const p = H.players[i];
    const counts = p.counts || DENOMS.map(() => 0);
    Sheet.open(`<h3>Count ${esc(p.name)}'s chips</h3>
      ${DENOMS.map((d, k) => `<div class="prow" style="padding:6px 0;grid-template-columns:auto 1fr auto"><span class="chip" style="--cc:${d.color};width:22px;height:22px"></span><span>${d.name} · ${d.value}</span>
        <input type="number" inputmode="numeric" min="0" style="width:80px" value="${counts[k] || ""}" data-cnt="${k}"></div>`).join("")}
      <p>Total <b id="cntTotal">${fmt(HC.chipValue(counts, DENOMS))}</b></p>
      <div class="row"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="cntOk">Use this</button></div>`, (body) => {
      const read = () => Array.from(body.querySelectorAll("[data-cnt]")).map((x) => +x.value || 0);
      body.addEventListener("input", () => { body.querySelector("#cntTotal").textContent = fmt(HC.chipValue(read(), DENOMS)); });
      body.querySelector("#cntOk").addEventListener("click", () => {
        p.counts = read(); p.chips = HC.chipValue(p.counts, DENOMS); save(); Sheet.close(); render();
      });
    });
  }

  // -------------------------------------------------------------- settle
  function settleHTML() {
    const mode = `<div class="seg" style="max-width:260px"><button data-mode="cash" class="${H.mode === "cash" ? "on" : ""}">Cash game</button><button data-mode="tourney" class="${H.mode === "tourney" ? "on" : ""}">Tournament</button></div>`;
    const money = (c) => UI.money(c / 100);
    if (H.mode === "cash") {
      const r = HC.settle(H.players, +H.buyIn || 0, +H.chipsPerBuyIn || 1);
      const uncounted = r.status === "uncounted";
      const rows = H.players.map((p, i) => `<tr><td>${esc(p.name)}</td>
        <td><div class="stepper"><button data-bi="${i}" data-d="-1">−</button><b>${p.buyIns}</b><button data-bi="${i}" data-d="1">+</button></div></td>
        <td><input type="number" inputmode="numeric" value="${esc(p.chips)}" data-p="${i}" data-k="chips"></td>
        <td class="${uncounted ? "muted" : r.rows[i].net > 0 ? "good" : r.rows[i].net < 0 ? "bad" : ""}" style="text-align:right;font-weight:800">${uncounted ? "—" : (r.rows[i].net > 0 ? "+" : "") + money(r.rows[i].net)}</td></tr>`).join("");
      const tr = uncounted ? `<div class="transfer muted">${esc(HC.settleNote(r))}</div>`
        : r.transfers.map((t) => `<div class="transfer">${esc(H.players[t.from].name)} <span class="muted">pays</span> ${esc(H.players[t.to].name)} <span class="spacer"></span><b>${money(t.cents)}</b></div>`).join("") || `<div class="transfer muted">Everyone is even.</div>`;
      const off = r.status === "off" ? r.chipsCounted - r.chipsExpected : 0;
      return `<div class="scroll" style="flex:1"><div style="padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${mode}
        <span class="label">Buy-in $</span><input type="number" inputmode="decimal" style="width:70px" value="${esc(H.buyIn)}" data-f="buyIn">
        <span class="label">Chips</span><input type="number" inputmode="numeric" style="width:80px" value="${esc(H.chipsPerBuyIn)}" data-f="chipsPerBuyIn">${qm("settle")}</div>
        <table class="settle-tbl"><tr><th style="padding-left:14px">Player</th><th>Buy-ins</th><th>Chips</th><th style="text-align:right;padding-right:14px">Net</th></tr>${rows}</table>
        ${off ? `<div class="transfer ${off > 0 ? "warm" : "bad"}" style="font-size:13px">${esc(HC.settleNote(r))}</div>` : ""}
        <div class="label" style="padding:12px 14px 4px">Payments</div>${tr}</div>`;
    }
    const pool = H.players.reduce((a, p) => a + (+p.buyIns || 0), 0) * (+H.buyIn || 0);
    const pay = HC.PAYOUTS[H.payout] || HC.PAYOUTS["3"];
    const prizes = pay.map((x) => (pool * x) / 100);
    const left = H.players.map((p, i) => ({ p, i })).filter((x) => +x.p.chips > 0);
    let icmHTML = "";
    if (left.length >= 2 && left.length <= 10) {
      const v = HC.icm(left.map((x) => +x.p.chips), prizes.slice(0, left.length));
      icmHTML = `<div class="label" style="padding:12px 14px 4px">Fair deal now ${qm("icm")}</div>` + left.map((x, k) => `<div class="transfer">${esc(x.p.name)} <span class="muted">${fmt(x.p.chips)} chips</span><span class="spacer"></span><b>${UI.money(v[k])}</b></div>`).join("");
    }
    return `<div class="scroll" style="flex:1"><div style="padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${mode}
      <span class="label">Buy-in $</span><input type="number" inputmode="decimal" style="width:70px" value="${esc(H.buyIn)}" data-f="buyIn"></div>
      <div style="padding:0 14px 8px;display:flex;gap:10px;align-items:center"><span class="label">Paid places</span>
        <div class="seg" style="flex:1;max-width:300px">${Object.keys(HC.PAYOUTS).map((k) => `<button data-pay="${k}" class="${H.payout === k ? "on" : ""}">${k}</button>`).join("")}</div></div>
      <div class="transfer"><span class="muted">Prize pool</span><span class="spacer"></span><b>${UI.money(pool)}</b></div>
      ${prizes.map((x, k) => `<div class="transfer">${["1st", "2nd", "3rd", "4th"][k]} <span class="muted">${pay[k]}%</span><span class="spacer"></span><b>${UI.money(x)}</b></div>`).join("")}
      ${icmHTML}</div>`;
  }

  // -------------------------------------------------------------- events
  function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.sub) { H.sub = b.dataset.sub; save(); render(); return; }
    if (b.dataset.t) {
      const L = levels();
      if (b.dataset.t === "toggle") {
        if (H.running) { H.remaining = remaining(); H.running = false; }
        else { H.endAt = Date.now() + (H.remaining > 0 ? H.remaining : H.minutes * 60000); H.running = true; try { actx = actx || new (root.AudioContext || root.webkitAudioContext)(); } catch (x) { /* ok */ } }
      } else {
        H.level = Math.max(0, Math.min(L.length - 1, H.level + (b.dataset.t === "next" ? 1 : -1)));
        H.remaining = H.minutes * 60000;
        if (H.running) H.endAt = Date.now() + H.remaining;
      }
      save(); render(); return;
    }
    if (b.dataset.min) {
      // 1-minute steps up to 10, then 5-minute steps (… 9, 10, 15, 20 …), both ways
      const m = H.minutes;
      const next = +b.dataset.min > 0 ? (m < 10 ? m + 1 : Math.floor(m / 5) * 5 + 5) : (m <= 10 ? m - 1 : Math.ceil(m / 5) * 5 - 5);
      H.minutes = Math.max(1, Math.min(90, next));
      if (!H.running) H.remaining = H.minutes * 60000;
      save(); render(); return;
    }
    if (b.dataset.addp !== undefined) { H.players.push({ name: "Player " + (H.players.length + 1), chips: 0, buyIns: 1 }); save(); render(); return; }
    if (b.dataset.count !== undefined) { openCounter(+b.dataset.count); return; }
    if (b.dataset.mode) { H.mode = b.dataset.mode; save(); render(); return; }
    if (b.dataset.pay) { H.payout = b.dataset.pay; save(); render(); return; }
    if (b.dataset.bi !== undefined) { const p = H.players[+b.dataset.bi]; p.buyIns = Math.max(0, (+p.buyIns || 0) + +b.dataset.d); save(); render(); }
  }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.p !== undefined) {
      const p = H.players[+t.dataset.p];
      p[t.dataset.k] = t.dataset.k === "name" ? t.value.slice(0, 20) : Math.max(0, +t.value || 0);
      if (t.dataset.k === "chips") p.counts = null;
      save();
    } else if (t.dataset.f === "buyIn" || t.dataset.f === "chipsPerBuyIn") { H[t.dataset.f] = Math.max(0, +t.value || 0); save(); }
  }
  function onChange(e) {
    const t = e.target;
    // re-render on change (blur), not on every keypress, so the keyboard stays open
    if (t.dataset.f === "startBB") { H.startBB = +t.value; save(); render(); return; }
    if (t.dataset.f === "antes") { H.antes = t.checked; save(); render(); return; }
    if (t.dataset.p !== undefined && t.dataset.k === "name") {
      if (!t.value.trim()) { H.players.splice(+t.dataset.p, 1); save(); render(); UI.toast("Player removed"); }
      return;
    }
    if (t.dataset.p !== undefined || t.dataset.f) render();
  }

  // one clock for the whole page, started at load (not when the Home tab first opens)
  clearInterval(tick);
  tick = setInterval(update, 250);

  root.HomeTab = { init, render };
})(this);
