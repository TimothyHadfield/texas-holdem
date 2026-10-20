/* online-play.js — play with friends through the shared online layer
 * (js/online.js, a straight copy of ../_online/online.js; Firebase loads only
 * when this screen is first used). The room creator's browser is the dealer.
 *
 * Screens: start (name + create / join by code) → lobby (code, seats, Start)
 * → the normal table (play.js draws it; this file feeds it a state rotated
 * so that you are always at the bottom). */
(function (root) {
  "use strict";
  const { UI, HoldemOnline: HO } = root;
  const { esc, Sheet } = UI;
  const MODULE_URL = new URL("online.js?v=3", document.currentScript ? document.currentScript.src : location.href).href;
  const RESUME_KEY = "online.holdem";

  let room = null;      // createOnline() result
  let snap = null;      // last snapshot
  let el = null;        // the play view container while the start/lobby screen shows
  let busy = false;
  let joinCode = "";

  const has = (k) => { try { return !!localStorage.getItem(k); } catch (e) { return false; } };

  async function ensure() {
    if (room) return room;
    const mod = await import(MODULE_URL);
    room = mod.createOnline({ game: HO.game, gameId: "holdem", botDelayMs: 900 });
    room.on("change", onChange);
    room.on("error", (msg) => UI.toast(String(msg && msg.message || msg)));
    return room;
  }

  function active() { return !!(snap && ["lobby", "playing", "finished", "joining"].includes(snap.status)); }

  function onChange(s) {
    snap = s;
    if (s.status === "playing" || s.status === "finished") {
      if (s.pub) root.PlayTab.setOnline(HO.rotate(s.pub, s.mine, s.mySeat, s.seats), s);
      return;
    }
    if (s.status === "closed" || s.status === "left" || s.status === "none") {
      root.PlayTab.setOnline(null);
      if (s.status === "closed") UI.toast("The table was closed");
      return;
    }
    // lobby / joining
    root.PlayTab.setOnline(null, s);
  }

  /** Called by play.js on start-up: put us back in our room after a reload. */
  async function resume() {
    if (!has(RESUME_KEY)) return false;
    try { await ensure(); return await room.resume(); } catch (e) { return false; }
  }

  // ------------------------------------------------------------ screens
  function settings() { return UI.Store.data.setup; }
  function name() { return (UI.Store.data.onlineName || "").trim(); }

  function renderStart(container) {
    el = container;
    const st = settings();
    const fmtName = { nl: "No limit", pl: "Pot limit", fl: "Limit" }[st.betting];
    el.innerHTML = `<div class="setup scroll online">
      <h2>Play with friends ${UI.qm("online")}</h2>
      <label class="field"><span class="label">Your name</span><input type="text" maxlength="20" data-oname value="${esc(name())}" placeholder="Name" autocomplete="nickname"></label>
      <div class="ocard">
        <div class="label">New table</div>
        <p class="muted">${st.opponents + 1} seats · ${fmtName} · ${st.format === "tourney" ? "Tournament" : "Cash"} · ${st.stack} BB. Empty seats become computers (${esc(st.level === "mixed" ? "hard" : st.level)}).</p>
        <button class="btn primary" data-ocreate ${busy ? "disabled" : ""}>Create table</button>
      </div>
      <div class="ocard">
        <div class="label">Join a table</div>
        <div class="row" style="margin:0"><input type="text" maxlength="5" data-ocode value="${esc(joinCode)}" placeholder="Code" autocapitalize="characters" autocomplete="off" style="flex:1;text-transform:uppercase;letter-spacing:3px">
        <button class="btn" data-ojoin ${busy ? "disabled" : ""}>Join</button></div>
      </div>
      <button class="btn ghost" data-oback>Back</button>
    </div>`;
  }

  function renderLobby(container, s) {
    el = container;
    if (s.status === "joining") {
      el.innerHTML = `<div class="setup online"><h2>Joining…</h2><p class="muted">Waiting for the table's host to seat you.</p><button class="btn ghost" data-oleave>Cancel</button></div>`;
      return;
    }
    const seatRow = (p, i) => {
      const kind = p.kind === "human" ? (i === s.mySeat ? "You" : "Player") : p.kind === "computer" ? "Computer" : "Open";
      const tap = s.isHost && i !== s.mySeat && p.kind !== "human";
      return `<${tap ? `button data-oseat="${i}"` : "div"} class="oseat ${p.kind}">
        <span class="nm">${esc(p.kind === "human" ? p.name : p.kind === "computer" ? "Computer" : "Open seat")}</span>
        <span class="muted">${kind}${tap ? " · tap to change" : ""}</span></${tap ? "button" : "div"}>`;
    };
    el.innerHTML = `<div class="setup scroll online">
      <div class="ocode-wrap"><span class="label">Table code</span><div class="ocode">${esc(s.code || "")}</div><span class="muted">Friends open this site, tap Play with friends, and type it.</span></div>
      <div class="oseats">${s.seats.map(seatRow).join("")}</div>
      ${s.isHost ? `<button class="btn primary" data-ostart>Start</button>` : `<p class="muted" style="text-align:center;margin:0">Waiting for the host to start…</p>`}
      <button class="btn ghost" data-oleave>Leave</button>
    </div>`;
  }

  // ------------------------------------------------------------ actions
  async function create() {
    const nm = name();
    if (!nm) { UI.toast("Type your name first"); return; }
    busy = true; renderStart(el);
    try {
      await ensure();
      const st = settings();
      const seats = ["human"].concat(Array.from({ length: st.opponents }, () => "empty"));
      const r = await room.createRoom({ name: nm, seats, options: { betting: st.betting, format: st.format, stack: st.stack, ante: st.ante, level: st.level === "mixed" ? "hard" : st.level } });
      if (!r.ok) UI.toast(r.message || "Couldn't create the table");
    } catch (e) { UI.toast("Couldn't reach the server — check your connection"); }
    busy = false;
    if (!active() && el) renderStart(el);
  }

  async function join() {
    const nm = name();
    const code = joinCode.trim().toUpperCase();
    if (!nm) { UI.toast("Type your name first"); return; }
    if (code.length !== 5) { UI.toast("The code has 5 letters"); return; }
    busy = true; renderStart(el);
    try {
      await ensure();
      const r = await room.joinRoom(code, nm);
      if (!r.ok) UI.toast(r.message || "Couldn't join");
    } catch (e) { UI.toast("Couldn't reach the server — check your connection"); }
    busy = false;
    if (!active() && el) renderStart(el);
  }

  async function act(a) {
    if (!room) return;
    const r = await room.act(a);
    if (r && !r.ok && a.type !== "deal") UI.toast(r.message || "That move didn't go through");
  }

  async function leave() {
    if (!room) { root.PlayTab.setOnline(null); return; }
    const host = snap && snap.isHost;
    await (host && snap.status === "lobby" ? room.close() : room.leave());
    snap = null;
    root.PlayTab.setOnline(null);
  }

  function confirmLeave() {
    Sheet.open(`<h3>Leave the table?</h3><p>${snap && snap.isHost ? "Another player takes over dealing; a computer takes your seat." : "A computer takes your seat."}</p>
      <div class="row"><button class="btn ghost" data-close>Stay</button><button class="btn danger" data-close data-oleave2>Leave</button></div>`, (body) => {
      body.querySelector("[data-oleave2]").addEventListener("click", leave);
    });
  }

  // clicks/inputs on the start and lobby screens (play.js forwards them)
  function onClick(b) {
    if (b.dataset.ocreate !== undefined) { create(); return true; }
    if (b.dataset.ojoin !== undefined) { join(); return true; }
    if (b.dataset.oback !== undefined) { el = null; root.PlayTab.setOnline(null); return true; }
    if (b.dataset.oleave !== undefined) { leave(); return true; }
    if (b.dataset.ostart !== undefined) { room.start().then((r) => { if (!r.ok) UI.toast(r.message); }); return true; }
    if (b.dataset.oseat !== undefined) {
      const i = +b.dataset.oseat;
      room.setSeat(i, snap.seats[i].kind === "computer" ? "empty" : "computer");
      return true;
    }
    return false;
  }
  function onInput(t) {
    if (t.dataset.oname !== undefined) { UI.Store.data.onlineName = t.value.slice(0, 20); UI.Store.save(); return true; }
    if (t.dataset.ocode !== undefined) { joinCode = t.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); if (t.value !== joinCode) t.value = joinCode; return true; }
    return false;
  }

  UI.HELP.online = ["Play with friends", "One person creates a table and reads out the 5-letter code; everyone else joins with it on their own phone. Seats nobody takes are played by computers. The creator's phone deals, so keep it open; if it drops out, another player takes over within about a minute. Free, no sign-up."];

  root.OnlinePlay = { renderStart, renderLobby, onClick, onInput, act, leave, confirmLeave, resume, active, get snap() { return snap; } };
})(this);
