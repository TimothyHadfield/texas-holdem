/* play.js — a no-limit / pot-limit / limit table against 1–8 computers.
 * The engine (engine.js) is the referee; this file only shows the table,
 * runs the computer turns, and records each hand for the Study tab.
 *
 * Seats: index 0 is you. Every other seat is a computer (online seats will
 * plug in through the same apply/view functions). */
(function (root) {
  "use strict";
  const { Poker: P, Engine: E, Bots: B, UI } = root;
  const { esc, card, chip, pct, scale, qm, fmt, Sheet } = UI;

  const NAMES = ["Ada", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jun"];
  const LEVEL_COLOR = { easy: "#6ee7a8", medium: "#f0b354", hard: "#f08c8c", human: "#6ea8fe" };
  const DELAY = { slow: 1200, normal: 700, fast: 260 };

  let el, G = null;           // G = Store.data.game
  let gen = 0, timer = 0;     // generation token: old timers never touch a new hand
  let seen = new Set();       // card keys already on screen (only new ones animate)
  let hintText = "";
  let eqCache = { key: "", r: null };
  let sizerTo = 0, sizerKey = "";
  let solo = null;            // the solo game, parked while an online table is open
  let onlineScreen = null;    // null | "start" | lobby snapshot
  const TF = root.TableFX;    // sounds + animations (table-fx.js, fx.js)
  let fxPrev = null;          // the state the last sounds were planned from (TF.SETUP = setup screen)
  let actReadyAt = 0;         // a fresh decision ignores taps for a moment (a double tap must not act twice)
  let sentKey = "";           // online: the decision whose move is on its way to the server
  const TAP_GUARD_MS = 350;

  function init(container) {
    el = container;
    G = UI.Store.data.game;
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    render();
    schedule();
    if (root.OnlinePlay) root.OnlinePlay.resume();
  }

  const S = () => G.state;
  const save = () => { if (G && G.online) return; UI.Store.data.game = G; UI.Store.save(); };

  /** Online table hooks (online-play.js). s = state rotated so you are seat 0,
   *  or null to leave online mode; lobby = a lobby/joining snapshot to show. */
  function setOnline(s, lobby) {
    if (s) {
      if (!G || !G.online) { solo = G; G = { online: true, state: null, decisions: [], startStacks: [], recorded: true }; seen = new Set(); onlineScreen = null; }
      // chips each seat had when this hand was dealt (for "This hand: +120")
      if (s.street !== "done" && (!G.state || G.state.street === "done" || G.state.hand !== s.hand)) G.startStacks = s.seats.map((p) => p.stack + p.total);
      else if (!G.startStacks.length) G.startStacks = s.seats.map((p) => p.stack);
      G.state = s; hintText = "";
      render();
      return;
    }
    if (G && G.online) { G = solo; solo = null; seen = new Set(); }
    onlineScreen = lobby && lobby.status !== "none" ? lobby : null;
    render();
  }

  // ================================================================ setup
  function renderSetup() {
    const st = UI.Store.data.setup;
    const lv = (k, name, note) => `<button data-lvl="${k}" class="${st.level === k ? "on" : ""}">${name}<small>${note}</small></button>`;
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, t]) => `<button data-set="${key}" data-v="${v}" class="${String(st[key]) === String(v) ? "on" : ""}">${t}</button>`).join("")}</div>`;
    el.innerHTML = `<div class="setup scroll">
      <h2>New table</h2>
      <div class="field"><span class="label">Computers</span><div class="stepper"><button data-opps="-1" aria-label="Fewer">−</button><b>${st.opponents}</b><button data-opps="1" aria-label="More">+</button></div></div>
      <div><div class="label" style="margin-bottom:6px">Strength ${qm("strength")}</div>
        <div class="lvl-grid">${lv("easy", "Easy", "loose")}${lv("medium", "Medium", "solid")}${lv("hard", "Hard", "reads you")}${lv("mixed", "Mixed", "a bit of each")}</div></div>
      <div class="field"><span class="label">Betting</span>${seg("betting", [["nl", "No limit"], ["pl", "Pot limit"], ["fl", "Limit"]])}</div>
      <div class="field"><span class="label">Game</span>${seg("format", [["cash", "Cash"], ["tourney", "Tournament"]])}</div>
      <div class="field"><span class="label">Chips</span>${seg("stack", [[50, "50 BB"], [100, "100 BB"], [200, "200 BB"]])}</div>
      <div class="field"><span class="label">Antes</span>${seg("ante", [["none", "None"], ["each", "Everyone"], ["bb", "Big blind"]])}</div>
      <p class="muted" style="margin:0;font-size:13px">${st.format === "tourney" ? "Blinds go up every 10 hands. Last player with chips wins." : "Blinds stay 10/20. Out of chips? Buy back in."}</p>
      <button class="btn primary" data-start style="min-height:52px;font-size:17px">Deal me in</button>
      ${root.OnlinePlay ? `<button class="btn" data-online>Play with friends</button>` : ""}
    </div>`;
  }

  function startGame() {
    const st = UI.Store.data.setup;
    const n = st.opponents;
    const levels = ["easy", "medium", "hard"];
    const players = [{ name: "You", kind: "human" }];
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const rand = P.rng32(seed);
    for (let i = 0; i < n; i++) {
      const level = st.level === "mixed" ? levels[i % 3] : st.level;
      players.push({ name: NAMES[i], kind: "bot", level });
    }
    // mixed: shuffle which seat gets which level
    if (st.level === "mixed") {
      const ls = players.slice(1).map((p) => p.level);
      for (let i = ls.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ls[i], ls[j]] = [ls[j], ls[i]]; }
      players.slice(1).forEach((p, i) => { p.level = ls[i]; });
    }
    const cfg = {
      betting: st.betting, format: st.format, sb: 10, bb: 20, startStack: 20 * st.stack, seed,
      ante: st.ante === "none" ? 0 : st.ante === "bb" ? 20 : 2, anteType: st.ante === "bb" ? "bb" : "each",
      levelHands: 10, anteFromLevel: st.ante === "none" ? 99 : 1,
    };
    G = { state: E.newGame(cfg, players), decisions: [], startStacks: [], handLog: null, done: false };
    seen = new Set();
    dealNext();
  }

  // ================================================================ flow
  function setState(s) {
    G.state = s;
    hintText = "";
    save();
    render();
    schedule();
  }

  function dealNext() {
    if (G && G.online) { root.OnlinePlay.act({ type: "deal" }); return; }
    let s = S();
    // cash game: computers who are out of chips buy back in
    if (s.cfg.format === "cash") {
      for (const p of s.seats) if (p.kind === "bot" && p.stack === 0) s = E.apply(s, { type: "rebuy", seat: p.i });
    }
    if (s.seats[0].stack === 0 && s.cfg.format === "cash") { G.state = s; save(); render(); offerRebuy(); return; }
    if (s.over) { G.state = s; save(); render(); return; }
    G.startStacks = s.seats.map((p) => p.stack);
    G.decisions = [];
    G.recorded = false;
    s = E.apply(s, { type: "deal" });
    setState(s);
  }

  function schedule() {
    clearTimeout(timer);
    const my = ++gen;
    if (!G || !G.state || G.online) return;
    const s = S();
    if (s.street === "done") {
      if (!G.recorded) recordHand();
      // tournament: you're out
      if (s.cfg.format === "tourney" && s.seats[0].out && !G.toldOut) { G.toldOut = true; save(); setTimeout(() => my === gen && offerOut(), 900); }
      if (UI.Store.data.settings.autoNext && !s.over && s.seats[0].stack > 0) timer = setTimeout(() => { if (my === gen) dealNext(); }, 2600);
      return;
    }
    if (s.toAct < 0) return;
    const seat = s.seats[s.toAct];
    if (seat.kind === "bot") {
      const d = DELAY[UI.Store.data.settings.speed] || 700;
      timer = setTimeout(() => {
        if (my !== gen) return;
        const v = E.view(s, s.toAct);
        const r = B.decide(v, seat.level, P.rng32((s.cfg.seed + s.hand * 977 + s.log.length * 31) >>> 0));
        let next;
        try { next = E.apply(s, r.action); }
        catch (e) { next = E.apply(s, { type: E.legal(s).toCall ? "fold" : "check" }); }
        setState(next);
      }, d * (0.7 + 0.6 * Math.random()));
    }
  }

  function heroAct(a) {
    const s = S();
    if (s.toAct !== 0) return;
    if (G.online) {
      // one move per decision while it travels to the server (a second tap would be refused as "not your turn")
      const k = `${s.hand}-${s.log.length}`;
      if (sentKey === k) return;
      sentKey = k;
      const clear = () => { if (sentKey === k) sentKey = ""; };
      setTimeout(clear, 8000);
      Promise.resolve(root.OnlinePlay.act(a)).then((r) => { if (!r || !r.ok) clear(); }, clear);
      return;
    }
    const L = E.legal(s);
    const opp = s.seats.filter((p) => p.i !== 0 && !p.folded).length;
    let next;
    try { next = E.apply(s, a); } catch (e) { UI.toast(e.message); fxError(); return; }
    G.decisions.push({
      street: s.street, board: s.board.slice(), hole: s.seats[0].hole.slice(), pot: L.pot, toCall: L.toCall,
      callAmount: L.callAmount, currentBet: s.currentBet, bet: L.bet, stack: L.stack, opp,
      live: s.seats.filter((p) => p.i !== 0 && !p.folded).map((p) => p.i),
      oppMax: Math.max(0, ...s.seats.filter((p) => p.i !== 0 && !p.folded).map((p) => p.bet + p.stack)),
      type: a.type === "allin" ? (L.bet + L.stack <= s.currentBet ? "call" : "raise") : a.type,
      to: a.type === "allin" ? L.bet + L.stack : a.to || 0, canRaise: L.canRaise,
      hint: B.hint(E.view(s, 0), P.rng32(s.hand * 7 + s.log.length)).label,
    });
    setState(next);
  }

  // ================================================================ history
  function recordHand() {
    const s = S();
    G.recorded = true;
    const rec = {
      id: s.cfg.seed + "-" + s.hand, t: Date.now(), hand: s.hand, betting: s.cfg.betting, format: s.cfg.format,
      sb: s.sb, bb: s.bb, ante: s.ante, button: s.button,
      seats: s.seats.map((p) => ({ name: p.name, level: p.level, kind: p.kind, hole: p.hole, start: G.startStacks[p.i], end: p.stack, folded: p.folded, dealt: p.hole.length > 0 })),
      board: s.board.slice(), log: s.log, result: s.result, decisions: G.decisions,
      net: s.seats[0].stack - (G.startStacks[0] || 0),
    };
    // Luck meter: all in before the river and called -> expected vs actual
    try { rec.allIn = allInLuck(s); } catch (e) { rec.allIn = null; }
    const h = UI.Store.data.history;
    h.unshift(rec);
    // EV of each decision now, so "Lost to choices" counts every hand, not just the opened ones
    setTimeout(() => { try { root.StudyTab.computeEV(rec); UI.Store.save(); } catch (e) { /* shown later in Study */ } }, 60);
    if (h.length > 150) h.length = 150;
    const st = UI.Store.data.stats;
    st.hands++; st.net += rec.net;
    save();
  }

  function allInLuck(s) {
    if (!s.result || s.result.byFold || s.seats[0].folded) return null;
    if (!s.seats.some((p) => p.allIn && !p.folded)) return null; // nobody all in: no luck to measure
    // board as it was when the last chips went in
    let boardAt = null;
    for (const e of s.log) if (e.seat >= 0 && ["call", "raise", "bet"].includes(e.type)) boardAt = s.board.slice(0, e.street === "preflop" ? 0 : e.street === "flop" ? 3 : e.street === "turn" ? 4 : 5);
    if (!boardAt || boardAt.length === 5) return null;
    let expected = 0;
    for (const pot of s.result.pots) {
      if (!pot.eligible.includes(0)) continue;
      if (pot.eligible.length === 1) { expected += pot.amount; continue; }
      const hands = pot.eligible.map((i) => s.seats[i].hole);
      const eqs = P.allEquities(hands, boardAt, [], { trials: 15000, exactLimit: 400000 });
      expected += eqs[pot.eligible.indexOf(0)] * pot.amount;
    }
    const actual = s.result.net[0] + s.seats[0].total;
    return { expected: Math.round(expected), actual, street: boardAt.length === 0 ? "preflop" : boardAt.length === 3 ? "flop" : "turn" };
  }

  // ================================================================ render
  function seatXY(k, n, hero, W) {
    // k-th seat clockwise from you (k = 0 is you at the bottom centre)
    const a = Math.PI / 2 + (2 * Math.PI * k) / n;
    const wide = root.innerWidth >= 900;
    const rx = wide ? 41 : 42, ry = wide ? 39 : 37;
    let x = 50 + rx * Math.cos(a), y = 49 + ry * Math.sin(a);
    if (hero) y += wide ? 1 : 2;
    // phone: keep the outermost name plates on screen (plate is 82 px wide)
    const pad = W ? Math.max(12, ((W < 360 ? 38 : 43) / W) * 100) : 12;
    if (!wide) x = Math.max(pad, Math.min(100 - pad, x));
    return [x, y];
  }

  function render() {
    if (!G || !G.state) {
      if (onlineScreen === "start") root.OnlinePlay.renderStart(el);
      else if (onlineScreen) root.OnlinePlay.renderLobby(el, onlineScreen);
      else renderSetup();
      fxPrev = TF ? TF.SETUP : null;
      updateTop(); return;
    }
    const s = S();
    const n = s.seats.length;
    const wide = root.innerWidth >= 900;
    let html = "";
    // what changed since the last state drawn -> sounds, animations, card timing
    let plan = null;
    // first paint after a reload: the cards are already on the table, so nothing is dealt again
    const restored = fxPrev === null;
    if (TF && fxPrev !== s) {
      if (UI.Store.data.tab === "play" && !document.hidden) plan = TF.plan(fxPrev, s, 0);
      fxPrev = s;
    }
    const K = TF ? TF.delayK() : 1;
    const deal0 = plan ? plan.deal0 : 0, flip0 = plan ? plan.flip0 : 0;
    const push = plan && plan.anims.find((a) => a.kind === "push");
    const reveal = push && K ? ` style="animation:fxin .3s ${Math.round(push.at * K)}ms both"` : "";
    const counting = {};
    if (plan && K) plan.anims.forEach((a) => { if (a.kind === "won") counting[a.seat] = a.amount; });
    const oldBets = plan && K && plan.anims.some((a) => a.kind === "sweep") ? Array.from(el.querySelectorAll(".seatbet .bet")).map((b) => ({ html: b.outerHTML, rect: b.getBoundingClientRect() })) : null;
    const resShown = new Set(s.result ? s.result.shown : []);
    const winners = new Set(s.seats.filter((p) => wonBy(s, p.i) > 0).map((p) => p.i));
    // seats whose fold is animated right now keep their cards one more frame, so they can fly to the muck
    const foldingNow = new Set(plan && K ? plan.anims.filter((a) => a.kind === "fold").map((a) => a.seat) : []);
    // table box in px (for turning each player's cards to face them)
    const ta0 = el.querySelector(".table-area");
    const W = ta0 && ta0.clientWidth > 100 ? ta0.clientWidth : Math.max(280, el.clientWidth - (wide ? 340 : 0));
    const H = ta0 && ta0.clientHeight > 100 ? ta0.clientHeight : Math.max(240, el.clientHeight - 170);
    s.seats.forEach((p, k) => {
      const [x, y] = seatXY(k, n, k === 0, W);
      const hero = k === 0;
      const showCards = hero || resShown.has(p.i);
      // cards lie on the felt pointing at their owner: 0 deg for you, 180 across the table, 90 at the ends
      const theta = Math.round(Math.atan2(-(x - 50) * W, (y - 47) * H) * 180 / Math.PI);
      const keepCards = hero || !p.folded || foldingNow.has(p.i);
      const cards = p.hole.length && keepCards ? p.hole.map((c, j) => {
        const key = `${s.hand}-${p.i}-${j}${showCards ? "f" : ""}`;
        const isNew = !seen.has(key) && !restored;
        seen.add(key);
        const cls = (p.folded ? "dim " : "") + (isNew ? (showCards && !hero ? "flip" : hero ? "dealflip" : "deal") : "");
        const delay = !isNew ? 0 : showCards && !hero ? flip0 : (TF ? deal0 + (j * n + k) * 45 : (j * n + k) * 45);
        return card(showCards ? c : null, cls, `style="animation-delay:${Math.round(delay * K)}ms"`);
      }).join("") : "";
      const lvl = p.kind === "human" ? "human" : p.level;
      let tag = "";
      if (s.street === "done" && winners.has(p.i)) tag = `<span class="tag win sd"${reveal}>+${fmt(wonBy(s, p.i))}</span>`;
      else if (s.street === "done" && resShown.has(p.i) && s.result.names[p.i]) tag = `<span class="tag sd"${reveal}>${esc(short(s.result.names[p.i]))}</span>`;
      else if (p.allIn && !p.folded) tag = `<span class="tag">All in</span>`;
      else { const last = lastAction(s, p.i); if (last) tag = `<span class="tag">${last}</span>`; }
      const cls = ["seat", hero ? "hero" : "", !hero && x > 60 ? "rt" : "", s.toAct === p.i ? "turn" : "", p.folded && p.hole.length ? "folded" : "", p.out || (!p.hole.length && s.street !== "idle") ? "out" : ""].join(" ");
      // your chips: a real stack beside your cards (the number stays on the plate)
      const shownStack = p.out ? 0 : p.stack - (counting[p.i] || 0);
      // (a phone with 7+ players has no room for everyone's stack: the number on the plate stays)
      // (nor once their cards are turned up: the face-up cards get that room; at a full table your own stack also steps aside at showdown)
      const myStack = !p.out && shownStack > 0 && (wide || (hero && !(n >= 7 && s.street === "done")) || (!hero && n <= 6 && !showCards)) ?chipStacks(shownStack, s.bb, wide || hero ? 6 : 4, wide || hero ? 3 : 2) : "";
      const level = Math.abs(y - 47) < 14 && Math.abs(x - 50) > 30; // seats at the ends, level with the board
      html += `<div class="${cls}" data-seat="${p.i}" style="left:${x}%;top:${y}%">
        ${hero ? `<div class="hole">${cards}</div>${myStack ? `<div class="stk mine">${myStack}</div>` : ""}` : ""}
        <div class="plate">${tag}<span class="av" style="--lv:${LEVEL_COLOR[lvl] || "#999"}">${esc(Array.from(p.name || "?")[0] || "?")}</span>
          <span><div class="nm">${esc(p.name)}</div><div class="st">${p.out ? (p.place ? ordinal(p.place) : "out") : fmt(shownStack)}</div></span></div>
        ${s.toAct === p.i && p.kind === "bot" ? `<div class="think"><i></i><i></i><i></i></div>` : ""}
        ${hero && p.i === s.button ? `<div class="dealer"><span>${wide ? "DEALER" : "D"}</span></div>` : ""}
      </div>`;
      if (!hero && !p.out && (cards || myStack)) {
        // in front of the player on the felt: their chips, and their two cards turned to face them
        let sx = x + (50 - x) * (!wide && y < 40 && Math.abs(x - 50) > 30 ? 0.22 : 0.3), sy = y + (47 - y) * (wide ? 0.34 : y > 47 ? 0.2 : 0.27);
        // phone: at the ends there's no felt between the plate and the board, so the cards sit just below the plate
        if (!wide && level) { sx = x + (x < 50 ? 5 : -5); sy = y + 11; }
        // phone, far side: turned-up cards are taller, so slide them clear of the plate and its hand label
        else if (!wide && showCards && y < 47) sy += 4;
        const rot = showCards ? Math.max(-10, Math.min(10, Math.round(-(x - 50) / 4))) : theta;
        const side = Math.abs(x - 50) < 1 ? "c" : x < 50 ? "l" : "r";
        html += `<div class="spot ${side}${p.folded ? " folded" : ""}" data-seat="${p.i}" style="left:${sx}%;top:${sy}%">
          ${myStack ? `<div class="stk">${myStack}</div>` : ""}<div class="hole${showCards ? " up" : ""}" data-rot="${rot}" style="rotate:${rot}deg">${cards}</div></div>`;
      }
      if (p.bet > 0) {
        let bx = 50 + (x - 50) * 0.52, by = 47 + (y - 47) * (hero ? 0.4 : 0.5);
        // laptop, seats at the ends: the board is in the way, so the bet sits just below their cards
        if (wide && level) { bx = x + (50 - x) * 0.3; by = y + 10; }
        // phone, seats at the ends: the bet goes just above the plate, clear of the board and their cards
        if (!wide && level) { bx = x + (x < 50 ? 7 : -7); by = y - 10; }
        html += `<div class="seatbet" data-seat="${p.i}" style="left:${bx}%;top:${by}%"><span class="bet">${chipStacks(p.bet, s.bb, 4, wide ? 3 : 2)}<span class="amt">${fmt(p.bet)}</span></span></div>`;
      }
      if (p.i === s.button && !hero) {
        let dxp = 50 + (x - 50) * 0.62 + (Math.abs(x - 50) < 1 ? (wide ? 11 : 16) : x < 50 ? 5 : -5), dyp = 47 + (y - 47) * 0.62;
        // phone: the felt is too small to put it between player and board, so it sits on the felt just past the plate
        if (!wide && Math.abs(x - 50) >= 1) {
          if (level) { dxp = x + (x < 50 ? 15 : -15); dyp = y - 1; }
          else { dxp = x + (x < 50 ? -3 : 3); dyp = y + (y > 47 ? -8 : 8); }
        }
        html += `<div class="dealer" style="left:${dxp}%;top:${dyp}%"><span>${wide ? "DEALER" : "D"}</span></div>`;
      }
    });
    // the dealer's spot: the deck (thickness = cards left) and the muck (folded hands + burn cards)
    const dealt = s.seats.reduce((a, p) => a + p.hole.length, 0);
    const burns = s.board.length >= 3 ? s.board.length - 2 : 0;
    const deckLeft = s.street === "idle" ? 52 : Math.max(0, 52 - dealt - burns - s.board.length);
    const mucked = burns + s.seats.reduce((a, p) => a + (p.i !== 0 && p.folded && !foldingNow.has(p.i) ? p.hole.length : 0), 0);
    const muck = muckHTML(mucked, `${s.cfg.seed}-${s.hand}`);
    const board = [];
    for (let i = 0; i < 5; i++) {
      const c = s.board[i];
      if (c === undefined) { board.push(card(-1)); continue; }
      const key = `${s.hand}-b${i}`;
      const isNew = !seen.has(key) && !restored;
      seen.add(key);
      const win = s.street === "done" && s.result && !s.result.byFold;
      const bd = !isNew ? 0 : plan && plan.board[i] !== undefined ? plan.board[i] : (i < 3 ? i * 90 : 0);
      board.push(card(c, isNew ? "dealflip" : "", `style="animation-delay:${Math.round(bd * K)}ms"${win ? "" : ""}`));
    }
    const pot = E.potTotal(s) - s.seats.reduce((a, p) => a + p.bet, 0);
    let resLine = "";
    if (s.street === "done" && s.result) {
      const r = s.result;
      const w = r.pots[0].winners.map((i) => s.seats[i].name).join(" & ");
      resLine = r.byFold ? `${esc(w)} win${w === "You" ? "" : "s"} — everyone else folded` : `${esc(w)} win${w === "You" || w.includes("&") ? "" : "s"} with ${esc(r.names[r.pots[0].winners[0]] || "")}`;
      const side = realPots(s).length - 1;
      if (side > 0) resLine += ` · ${side} side pot${side > 1 ? "s" : ""}`;
    }
    if (s.over && s.winner >= 0) resLine = `<b>${esc(s.seats[s.winner].name)} won the tournament</b>` + (resLine ? `<br>${resLine}` : "");
    resNow = resLine;
    const potShown = s.street === "done" ? r0(s) : pot;
    const center = `<div class="center"><div class="dealer-spot"><div class="deck"></div>${muck}<div class="pot">${potShown > 0 ? `${chipStacks(potShown, s.bb, wide ? 7 : 5, 4)}<span class="amt">Pot ${fmt(potShown)}</span>` : ""}</div></div><div class="board">${board.join("")}</div><div class="result-line"${resLine ? reveal : ""}>${resLine}</div></div>`;

    const side = wide ? `<aside class="side"><h3>Odds</h3><div id="sideOdds" style="padding:0 14px 8px"></div><h3>This hand</h3><div class="log scroll" id="sideLog" style="flex:1">${logHTML(s)}</div></aside>` : "";
    el.innerHTML = `<div class="play-wrap">
      <div class="play-main">
        <div class="table-area"><div class="rail"></div><div class="felt tbl-surface tbl-felt-green"><i class="line"></i></div>${center}${html}</div>
        <div class="hud" id="hud"></div>
        <div class="actions-wrap"><div class="actions" id="actions"></div></div>
      </div>${side}</div>`;
    const deckEl = el.querySelector(".deck");
    if (root.TABLE) root.TABLE.deck(deckEl, deckLeft, { pattern: "lattice", badge: false });
    dealFromDeck(deckEl);
    keepOnScreen();
    requestAnimationFrame(keepOnScreen); // again once fonts and the result line are laid out (it only moves what still collides)
    renderHud();
    renderActions();
    updateTop();
    const logEl = el.querySelector("#sideLog");
    if (logEl) logEl.scrollTop = logEl.scrollHeight; // the latest action is always in view
    if (plan) TF.run(plan, { dom: { anim: (a) => fxAnim(a, oldBets) }, celebrateOpts: (kind) => ({ colors: FX_COLORS, at: kind === "big" ? el.querySelector(".pot") : null }) });
  }

  /** Long names, big numbers or a narrow screen can push an end seat's name plate (and its tag) past the edge:
   *  slide that seat back inside the table area. */
  function keepOnScreen() {
    const ta = el.querySelector(".table-area");
    if (!ta) return;
    const r = ta.getBoundingClientRect(), pad = 2;
    if (!r.width) return;
    // an action tag that would sit on the board moves to the plate's outer corner
    const bd = el.querySelector(".table-area .board");
    if (bd) {
      const b = bd.getBoundingClientRect();
      el.querySelectorAll(".table-area .seat:not(.hero) .tag:not(.sd)").forEach((t) => {
        const q = t.getBoundingClientRect();
        if (Math.min(q.right, b.right) - Math.max(q.left, b.left) > 0 && Math.min(q.bottom, b.bottom) - Math.max(q.top, b.top) > 0) t.classList.add("flip");
      });
    }
    el.querySelectorAll(".table-area .seat:not(.hero)").forEach((seat) => {
      let L = Infinity, R = -Infinity, T = Infinity;
      for (const e of seat.querySelectorAll(".plate, .tag")) {
        const q = e.getBoundingClientRect();
        if (!q.width) continue;
        L = Math.min(L, q.left); R = Math.max(R, q.right); T = Math.min(T, q.top);
      }
      if (L === Infinity) return;
      const dx = L < r.left + pad ? r.left + pad - L : R > r.right - pad ? r.right - pad - R : 0;
      const dy = T < r.top + pad ? r.top + pad - T : 0;
      if (dx) seat.style.left = `calc(${seat.style.left} + ${Math.round(dx)}px)`;
      if (dy) seat.style.top = `calc(${seat.style.top} + ${Math.round(dy)}px)`;
    });
    // a crowded small table: bets clear of the pot and of each other, turned-up cards clear of the result line
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    // a crowded table: each player's cards, then each bet, slide the shortest way to a clear spot on the table
    const rects = (sel) => Array.from(el.querySelectorAll(sel)).map((e) => e.getBoundingClientRect()).filter((q) => q.width);
    // names, numbers, hand labels and the board count triple: covering them is worse than covering felt or chips
    const text = (list) => list.map((q) => Object.assign({ left: q.left, right: q.right, top: q.top, bottom: q.bottom }, { w: 3 }));
    const fixed = [...text(rects(".table-area .plate")), ...text(rects(".table-area .seat .tag")), ...text(rects(".table-area .board")), ...rects(".table-area .seat.hero .hole"), ...rects(".table-area .pot"), ...rects(".table-area .deck"), ...rects(".table-area .muck"), ...rects(".table-area .seat.hero .dealer")];
    const res = el.querySelector(".table-area .result-line");
    if (res && res.textContent.trim() && res.offsetParent) { const rg = document.createRange(); rg.selectNodeContents(res); fixed.push(...text([rg.getBoundingClientRect()])); }
    const placed = [];
    // stay on the felt (its box, a little inside the rail)
    const f0 = el.querySelector(".table-area .felt").getBoundingClientRect();
    const fr = { left: f0.left + 2, right: f0.right - 2, top: f0.top + 2, bottom: f0.bottom - 2 };
    const union = (list) => list.reduce((u, q) => (u ? { left: Math.min(u.left, q.left), right: Math.max(u.right, q.right), top: Math.min(u.top, q.top), bottom: Math.max(u.bottom, q.bottom) } : q), null);
    const settle = (node, boxes) => {
      const shift = (q, dx, dy) => ({ left: q.left + dx, right: q.right + dx, top: q.top + dy, bottom: q.bottom + dy });
      const area = (q, o) => (hit(q, o) ? (Math.min(q.right, o.right) - Math.max(q.left, o.left)) * (Math.min(q.bottom, o.bottom) - Math.max(q.top, o.top)) : 0);
      // what each part covers, plus anything hanging off the felt (counted double)
      const off = (q) => (Math.max(0, fr.left - q.left) + Math.max(0, q.right - fr.right)) * (q.bottom - q.top) + (Math.max(0, fr.top - q.top) + Math.max(0, q.bottom - fr.bottom)) * (q.right - q.left);
      // the felt is oval: a corner past its edge sits on the rail
      const ecx = (fr.left + fr.right) / 2, ecy = (fr.top + fr.bottom) / 2, erx = (fr.right - fr.left) / 2, ery = (fr.bottom - fr.top) / 2;
      const rail = (q) => [[q.left, q.top], [q.right, q.top], [q.left, q.bottom], [q.right, q.bottom]].filter(([x, y]) => ((x - ecx) / erx) ** 2 + ((y - ecy) / ery) ** 2 > 1).length;
      const over = (dx, dy) => { let a = 0; for (const b of boxes) { const q = shift(b, dx, dy); for (const o of fixed) a += area(q, o) * (o.w || 1); for (const o of placed) a += 3 * area(q, o); a += 4 * off(q) + 400 * rail(q); } return a; };
      const here = over(0, 0);
      if (!here) return boxes;
      // each pixel moved costs a little, so a small overlap never sends things far across the table
      let best = { a: here, c: here, dx: 0, dy: 0 };
      for (let d = 3; d <= 54 && best.a > 0; d += 3) {
        for (const [ux, uy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 1], [-2, 1], [2, -1], [-2, -1]]) {
          const n = Math.hypot(ux, uy), dx = Math.round(ux / n * d), dy = Math.round(uy / n * d);
          const a = over(dx, dy), c = a + 3 * d;
          if (c < best.c) best = { a, c, dx, dy };
          if (a === 0) break;
        }
      }
      if (!best.dx && !best.dy) return boxes;
      node.style.transition = "none";
      if (node.style.left) {
        node.style.left = `calc(${node.style.left} + ${best.dx}px)`;
        node.style.top = `calc(${node.style.top} + ${best.dy}px)`;
      } else {
        // (placed by CSS: nudge it instead, adding to any earlier nudge)
        const [tx, ty] = (node.style.translate || "0px 0px").split(" ").map((v) => parseFloat(v) || 0);
        node.style.translate = `${tx + best.dx}px ${ty + best.dy}px`;
      }
      return boxes.map((b) => shift(b, best.dx, best.dy));
    };
    // your own chip stack first (it can sit on the winner line on a narrow phone)
    const mine = el.querySelector(".table-area .seat.hero .stk.mine");
    if (mine && mine.getBoundingClientRect().width) placed.push(...settle(mine, [mine.getBoundingClientRect()]));
    el.querySelectorAll(".table-area .spot").forEach((sp) => {
      const h = sp.querySelector(".hole");
      if (h && h.children.length) placed.push(...settle(sp, [union(Array.from(h.children).map((c) => c.getBoundingClientRect()))]));
    });
    Array.from(el.querySelectorAll(".table-area .seatbet")).forEach((b) => {
      const chips = b.querySelector(".bet");
      if (chips) placed.push(...settle(b, [chips.getBoundingClientRect()]));
    });
    // last, the dealer button finds a clear spot near its player
    // (only when it covers something: on a phone it rests on the rail by design)
    el.querySelectorAll(".table-area > .dealer").forEach((d) => {
      const q = d.getBoundingClientRect();
      if (fixed.concat(placed).some((o) => hit(q, o))) settle(d, [q]);
    });
  }

  /** Real chip stacks for an amount: one column per colour, the biggest `cols` colours, at most `cap` chips drawn high.
   *  Chip values follow the blinds, like a real cash table (5/25/100) or a late tournament (25/100/500/1000). */
  function chipStacks(amount, bb, cap, cols) {
    const T = root.TABLE;
    if (!T || amount <= 0) return "";
    const denoms = bb <= 50 ? [100, 25, 5, 1] : bb <= 400 ? [1000, 500, 100, 25] : [1000, 500, 100];
    let parts = T.chipBreakdown(amount, denoms);
    if (!parts.length) parts = [{ v: denoms[denoms.length - 1], n: 1 }];
    parts = parts.slice(0, cols);
    return `<span class="tbl-stacks" title="${fmt(amount)}">${parts.map(({ v, n }) => {
      const k = Math.min(n, cap);
      let c = "";
      for (let i = 0; i < k; i++) c += `<span class="tbl-chip v${v}" style="--i:${i}"></span>`;
      return `<span class="tbl-stack" style="--n:${k}">${c}</span>`;
    }).join("")}</span>`;
  }
  /** The muck: a messy face-down pile (only the top few cards drawn; same tilt every render). */
  function muckHTML(count, seed) {
    const T = root.TABLE;
    if (!T || !count) return `<div class="muck tbl-pile"></div>`;
    let out = "";
    for (let i = Math.max(0, count - 6); i < count; i++) {
      const j = T.jitter(seed, i, { rot: 40, off: 5 });
      out += `<div class="cd tbl-card back tbl-back tbl-lattice" style="--x:${j.x}px;--y:${j.y}px;--r:${j.r}deg"></div>`;
    }
    return `<div class="muck tbl-pile">${out}</div>`;
  }
  /** Cards that are being dealt start on top of the deck: measure where the deck is from each card. */
  function dealFromDeck(deckEl) {
    const fresh = el.querySelectorAll(".cd.deal, .cd.dealflip");
    if (!deckEl || !fresh.length) return;
    const src = deckEl.firstElementChild || deckEl, d = src.getBoundingClientRect();
    fresh.forEach((c) => { c.style.animationName = "none"; });
    fresh.forEach((c) => {
      const r = c.getBoundingClientRect();
      let dx = d.left + d.width / 2 - (r.left + r.width / 2), dy = d.top + d.height / 2 - (r.top + r.height / 2);
      // inside a turned hand the move is in the hand's own (turned) frame
      const h = c.parentElement && c.parentElement.dataset.rot;
      if (h) { const t = -(+h) * Math.PI / 180; [dx, dy] = [dx * Math.cos(t) - dy * Math.sin(t), dx * Math.sin(t) + dy * Math.cos(t)]; }
      c.style.setProperty("--dx", Math.round(dx) + "px");
      c.style.setProperty("--dy", Math.round(dy) + "px");
    });
    fresh.forEach((c) => { c.style.animationName = ""; });
  }

  // ================================================================ effects (fx.js; transform/opacity only)
  const FX_COLORS = ["#6ea8fe", "#f0b354", "#6ee7a8", "#e8eaf0"];
  /** A copy of `html` pinned over `rect` that flies to `to`, then disappears. */
  function ghost(html, rect, to, o) {
    const F = root.FX;
    const g = document.createElement("div");
    g.innerHTML = html;
    g.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;pointer-events:none;z-index:40;display:flex;align-items:center;justify-content:center`;
    document.body.appendChild(g);
    return F.flyTo(g, to, Object.assign({ clone: false }, o)).then(() => g.remove());
  }
  function fxAnim(a, oldBets) {
    const F = root.FX;
    if (!F || !el.isConnected) return;
    const seat = (i) => el.querySelector(`.seat[data-seat="${i}"]`);
    const plate = (i) => { const x = seat(i); return x && x.querySelector(".plate"); };
    if (a.kind === "bet") {
      const b = el.querySelector(`.seatbet[data-seat="${a.seat}"]`), p = plate(a.seat), chipEl = b && b.querySelector(".bet");
      if (!b || !p || !chipEl) return;
      const pr = p.getBoundingClientRect(), cr = chipEl.getBoundingClientRect();
      b.style.opacity = "0";
      ghost(chipEl.outerHTML, { left: pr.left + pr.width / 2 - cr.width / 2, top: pr.top + pr.height / 2 - cr.height / 2, width: cr.width, height: cr.height }, chipEl, { duration: 300, scale: 1 })
        .then(() => { b.style.opacity = ""; });
    } else if (a.kind === "sweep") {
      const pot = el.querySelector(".pot");
      if (pot) (oldBets || []).forEach((o) => ghost(o.html, o.rect, pot, { duration: 360, fade: true, scale: 1 }));
    } else if (a.kind === "fold") {
      // the folded cards slide face down into the muck and leave the player's spot
      const h = el.querySelector(`.spot[data-seat="${a.seat}"] .hole`) || el.querySelector(`.seat[data-seat="${a.seat}"] .hole`), muck = el.querySelector(".muck");
      if (h && muck && h.children.length) {
        const mine = a.seat === 0;
        const fly = h.cloneNode(true);
        fly.querySelectorAll(".cd").forEach((c) => { c.className = "cd tbl-card back tbl-back tbl-lattice"; c.innerHTML = ""; c.style.animation = "none"; });
        const r = h.getBoundingClientRect(), cw = h.firstElementChild.getBoundingClientRect().width;
        fly.style.setProperty("--w", Math.round(Math.min(cw, 60)) + "px");
        fly.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;margin:0;pointer-events:none;z-index:40`;
        if (!mine) h.style.visibility = "hidden";
        document.body.appendChild(fly);
        F.flyTo(fly, muck, { duration: 380, clone: false, scale: 0.7 }).then(() => fly.remove());
      }
    } else if (a.kind === "knock" || a.kind === "allin") {
      const p = plate(a.seat);
      if (p) { F.pop(p); if (a.kind === "allin") F.flash(p, "var(--accent-warm)"); }
    } else if (a.kind === "push") {
      const pot = el.querySelector(".pot");
      if (pot && pot.children.length) a.seats.forEach((i) => { const p = plate(i); if (p) F.flyTo(pot, p, { duration: 450, fade: true }); });
    } else if (a.kind === "won") {
      const p = plate(a.seat), st = p && p.querySelector(".st");
      if (p) F.floatText(p, "+" + fmt(a.amount), "var(--good)");
      if (st) F.countUp(st, a.stack - a.amount, a.stack, { duration: 600, format: fmt });
    } else if (a.kind === "turn") {
      const p = plate(a.seat);
      if (p) F.pulse(p);
    }
  }
  function fxError() {
    const F = root.FX;
    if (!F) return;
    F.play("error");
    const box = el && el.querySelector("#actions");
    if (box) F.shake(box);
  }
  // Pots someone actually won from others (an uncalled bet coming back is not a pot).
  const realPots = (s) => (s.result ? s.result.pots.filter((p) => s.result.byFold || !p.uncontested) : []);
  const r0 = (s) => realPots(s).reduce((a, p) => a + p.amount, 0);
  /** Chips seat i collected from real pots this hand (odd chip to the first winner). */
  function wonBy(s, i) {
    let w = 0;
    for (const p of realPots(s)) {
      const k = p.winners.indexOf(i);
      if (k < 0) continue;
      const share = Math.floor(p.amount / p.winners.length);
      w += share + (k < p.amount - share * p.winners.length ? 1 : 0);
    }
    return w;
  }
  const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0]);
  function short(name) { return name.replace("Two pair, ", "2 pair ").replace("Three ", "3 ").replace("Four ", "4 ").replace("Full house, ", "").replace(" full of ", "/").replace(", ", " ").replace(" high", ""); }

  function lastAction(s, i) {
    for (let k = s.log.length - 1; k >= 0; k--) {
      const e = s.log[k];
      if (e.seat === -1) return "";
      if (e.seat !== i) continue;
      return { fold: "Fold", check: "Check", call: "Call", bet: "Bet", raise: "Raise", sb: "", bb: "", ante: "" }[e.type] || "";
    }
    return "";
  }

  function logHTML(s) {
    let out = "";
    for (const e of s.log) {
      if (e.seat === -1) { out += `<div class="st">${e.type[0].toUpperCase() + e.type.slice(1)} ${e.cards.slice(e.type === "flop" ? 0 : -1).map(UI.cardText).join(" ")}</div>`; continue; }
      const who = esc(s.seats[e.seat].name);
      const you = e.seat === 0 && s.seats[0].name === "You"; // online your seat carries your own name: "Tim calls"

      const v = (w) => (you ? w : w === "raise" ? "raises" : w + "s"); // "You call" / "Ada calls"
      const what = e.type === "sb" ? `${v("post")} small blind ${e.amount}` : e.type === "bb" ? `${v("post")} big blind ${e.amount}` : e.type === "ante" ? `${v("ante")} ${e.amount}` :
        e.type === "raise" ? `${v("raise")} to ${fmt(e.to)}` : e.type === "bet" ? `${v("bet")} ${fmt(e.to)}` : e.type === "call" ? `${v("call")} ${fmt(e.amount)}` : v(e.type);
      out += `<div>${who} ${what}${e.allIn ? " (all in)" : ""}</div>`;
    }
    if (s.street === "done" && s.result) {
      for (const pot of s.result.pots) out += `<div class="st">${pot.winners.map((i) => esc(s.seats[i].name)).join(" & ")} win${pot.winners.length > 1 || pot.winners[0] === 0 ? "" : "s"} ${fmt(pot.amount)}${!s.result.byFold && !pot.uncontested ? " — " + esc(s.result.names[pot.winners[0]]) : pot.uncontested && !s.result.byFold ? " (returned)" : ""}</div>`;
    }
    return out;
  }

  function heroEquity(s) {
    const me = s.seats[0];
    if (!me.hole.length || me.folded || s.street === "done") return null;
    const live = s.seats.filter((p) => p.i !== 0 && !p.folded).length;
    const key = `${s.cfg.seed}-${s.hand}-${s.board.length}-${live}`;
    if (eqCache.key === key) return eqCache.r;
    const r = P.equity({ hero: me.hole, board: s.board, opponents: live, trials: 5000, exactLimit: 250000, seed: s.hand + 1 });
    eqCache = { key, r };
    return r;
  }

  let resNow = "";
  function renderHud() {
    const hud = el.querySelector("#hud");
    const s = S();
    const set = UI.Store.data.settings;
    const me = s.seats[0];
    const L = s.toAct === 0 ? E.legal(s) : null;
    const need = L && L.toCall > 0 ? L.callAmount / (L.pot + L.callAmount) : null;
    const name = me.hole.length && s.board.length >= 3 ? P.describe(P.evaluate(me.hole, 2, s.board, s.board.length)) : me.hole.length ? P.handClass(me.hole[0], me.hole[1]) : "";
    let html = "";
    if (hintText) html = `<div class="hint-pop" style="flex:1">${hintText}</div>`;
    else if (set.overlay && me.hole.length && !me.folded && s.street !== "done") {
      const r = heroEquity(s);
      const live = s.seats.filter((p) => p.i !== 0 && !p.folded).length;
      // facing a bet: colour against the price; otherwise against an average hand's share
      const col = !r ? "var(--muted)" : need !== null ? scale(r.equity - need, -0.15, 0.15) : scale(r.equity, 1 / (live + 1) - 0.12, 1 / (live + 1) + 0.25);
      html = `<span class="big" style="color:${col}">${r ? (r.equity * 100).toFixed(0) + "%" : "…"}</span>${qm("equity")}
        <div class="eqbar"><b style="width:${r ? r.equity * 100 : 0}%;background:${col}"></b>${need !== null ? `<span class="need" style="left:${need * 100}%"></span>` : ""}</div>
        ${need !== null ? `<span>Need <b>${pct(need, 0)}</b></span>` : `<span class="hname">${esc(name)}</span>`}`;
    } else if (s.street === "done") {
      const net = s.seats[0].stack - (G.startStacks[0] || 0);
      // phone on its side: the table has no room under the board, so who won goes here (CSS shows it only there)
      html = (resNow ? `<div class="hud-res">${resNow}</div>` : "") + `<span class="hname">This hand: <b class="${net > 0 ? "good" : net < 0 ? "bad" : ""}">${net > 0 ? "+" : ""}${fmt(net)}</b></span><span class="spacer"></span><span class="muted">Session ${fmtSigned(s.seats[0].stack - s.cfg.startStack * s.seats[0].buyIns - (s.seats[0].topup || 0))}</span>`;
    } else html = `<span class="hname">${me.folded ? "You folded" : esc(name)}</span>`;
    if (set.hints && s.toAct === 0 && !hintText) html += `<button class="btn small" data-hint>Hint</button>`;
    hud.innerHTML = html;
    const side = el.querySelector("#sideOdds");
    if (side) {
      const r = me.hole.length && !me.folded && s.street !== "done" ? heroEquity(s) : null;
      const o = me.hole.length && (s.board.length === 3 || s.board.length === 4) && !me.folded && s.street !== "done" ? P.outs(me.hole, s.board) : null;
      side.innerHTML = r ? `<div class="bignum" style="font-size:44px;color:${scale(r.equity, 0.1, 0.7)}">${(r.equity * 100).toFixed(1)}<small>% win</small></div>
        <div class="subnums"><span>Tie <b>${pct(r.tie)}</b></span>${need !== null ? `<span>Need <b>${pct(need, 0)}</b></span>` : ""}<span><b>${esc(name)}</b></span></div>
        ${o && o.cards.length ? `<div class="outs-line" style="margin-top:6px">Outs <b>${o.cards.length}</b> · ${Object.entries(o.byKind).map(([k, v]) => esc(k) + " " + v.length).join(" · ")}</div>` : ""}
        ${hintText ? `<div class="hint-pop" style="margin-top:8px">${hintText}</div>` : ""}` : `<div class="muted">${me.folded ? "You folded" : s.street === "done" ? "Hand over" : "—"}</div>`;
    }
  }
  const fmtSigned = (n) => `<b class="${n > 0 ? "good" : n < 0 ? "bad" : ""}">${n > 0 ? "+" : ""}${fmt(n)}</b>`;

  function renderActions() {
    const box = el.querySelector("#actions");
    const s = S();
    if (s.street === "done" || s.street === "idle") {
      const busted = s.seats[0].stack === 0;
      const over = s.over || (s.cfg.format === "tourney" && s.seats[0].out);
      box.innerHTML = `<div class="sizer"></div><div class="act-row" style="grid-template-columns:1fr 1.5fr">
        ${G.online ? `<button class="btn" data-oleaveask>Leave table</button>` : `<button class="btn" data-study>Study hand</button>`}
        ${over ? `<button class="btn primary" data-newgame>New game</button>` : busted ? `<button class="btn warm" data-rebuy>Buy back in</button>` : `<button class="btn primary" data-next>Next hand</button>`}</div>`;
      return;
    }
    const mine = s.toAct === 0;
    const L = mine ? E.legal(s) : null;
    const dis = mine ? "" : "disabled";
    let sizer = `<span class="muted" style="font-size:13px">${mine ? "" : s.seats[0].folded ? "Waiting for the hand to finish…" : "Waiting…"}</span>`;
    // a fresh decision gets a fresh default size (never carry the last one over)
    const decKey = `${s.cfg.seed}-${s.hand}-${s.log.length}`;
    if (mine && decKey !== sizerKey) { sizerKey = decKey; sizerTo = 0; actReadyAt = Date.now() + TAP_GUARD_MS; }
    if (mine && L.canRaise && L.maxTo > L.minTo) {
      if (sizerTo < L.minTo || sizerTo > L.maxTo) sizerTo = defaultSize(s, L);
      const pre = (f, t) => `<button class="btn small" data-size="${f}">${t}</button>`;
      sizer = `${pre("0.5", "½")}${pre("0.75", "¾")}${pre("1", "Pot")}${pre("max", "Max")}
        <input type="range" min="${L.minTo}" max="${L.maxTo}" step="${s.bb / 2}" value="${sizerTo}" data-range aria-label="Raise size">
        <span class="amt" id="amt">${fmt(sizerTo)}</span>`;
    } else if (mine && L.canRaise) sizerTo = L.minTo;
    else if (s.cfg.betting === "fl" && mine) sizer = `<span class="muted" style="font-size:13px">Limit: bets are fixed${L.canRaise ? "" : " · raising is capped"}</span>`;
    const callLbl = !L ? "Call" : L.canCheck ? "Check" : `Call <small>${fmt(L.callAmount)}</small>`;
    const allInCall = L && L.callAmount >= L.stack && !L.canCheck;
    const raiseLbl = !L || !L.canRaise ? (L && L.isBet ? "Bet" : "Raise") : (sizerTo >= L.bet + L.stack ? "All in" : (L.isBet ? "Bet " : "Raise to ") + `<small>${fmt(sizerTo)}</small>`);
    box.innerHTML = `<div class="sizer">${sizer}</div><div class="act-row">
      <button class="btn danger" data-act="fold" ${mine && !L.canCheck ? "" : "disabled"}>Fold</button>
      <button class="btn" data-act="call" ${dis}>${allInCall ? "All in <small>" + fmt(L.callAmount) + "</small>" : callLbl}</button>
      <button class="btn primary" data-act="raise" ${mine && L.canRaise ? "" : "disabled"} id="raiseBtn">${raiseLbl}</button></div>`;
  }

  function defaultSize(s, L) {
    if (s.cfg.betting === "fl") return L.minTo;
    const t = s.currentBet === 0 ? Math.round(L.pot * 0.66) : s.street === "preflop" && s.currentBet === s.bb ? s.bb * 3 : s.currentBet * 3;
    return clampTo(L, Math.round(t / (s.bb / 2)) * (s.bb / 2));
  }
  const clampTo = (L, t) => Math.max(L.minTo, Math.min(L.maxTo, t));

  function updateTop() {
    const t = document.getElementById("topInfo");
    if (UI.Store.data.tab !== "play") return;
    if (!G || !G.state) { t.innerHTML = ""; return; }
    const s = S();
    const fmtName = { nl: "No limit", pl: "Pot limit", fl: "Limit" }[s.cfg.betting];
    t.innerHTML = `<span class="ti">${G.online && root.OnlinePlay.snap ? `<b class="ocode-top">${esc(root.OnlinePlay.snap.code || "")}</b> · ` : ""}${fmtName} · ${s.sb}/${s.bb}${s.ante ? " +" + s.ante : ""}${s.cfg.format === "tourney" ? " · Lv " + (s.level + 1) : ""}</span> <button class="btn small ghost" data-menu style="margin-left:6px;min-height:30px">Menu</button>`;
  }

  // ================================================================ events
  function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.online !== undefined) { onlineScreen = "start"; render(); return; }
    if (root.OnlinePlay && root.OnlinePlay.onClick(b)) return;
    const st = UI.Store.data.setup;
    if (b.dataset.opps) { st.opponents = Math.max(1, Math.min(8, st.opponents + +b.dataset.opps)); UI.Store.save(); renderSetup(); return; }
    if (b.dataset.lvl) { st.level = b.dataset.lvl; UI.Store.save(); renderSetup(); return; }
    if (b.dataset.set) { const v = b.dataset.v; st[b.dataset.set] = isNaN(+v) ? v : +v; UI.Store.save(); renderSetup(); return; }
    if (b.dataset.start !== undefined) { startGame(); return; }
    if (b.dataset.next !== undefined) { dealNext(); return; }
    if (b.dataset.newgame !== undefined) { newGame(); return; }
    if (b.dataset.rebuy !== undefined) { rebuyHero(); return; }
    if (b.dataset.study !== undefined) { root.App.go("study"); root.StudyTab.show(0); return; }
    if (b.dataset.hint !== undefined) {
      const h = B.hint(E.view(S(), 0));
      hintText = `Hard computer: <b>${esc(h.label)}</b> — ${esc(h.why)}`;
      renderHud();
      return;
    }
    if (b.dataset.size) {
      const s = S(), L = E.legal(s);
      if (!L) return;
      if (b.dataset.size === "max") sizerTo = L.maxTo;
      else {
        const f = +b.dataset.size;
        const potAfter = L.pot + L.toCall;
        sizerTo = clampTo(L, s.currentBet + Math.round(f * potAfter));
        if (s.currentBet === 0) sizerTo = clampTo(L, Math.round(f * L.pot));
      }
      syncSizer();
      return;
    }
    if (b.dataset.act) {
      const s = S(), L = E.legal(s);
      if (!L) return;
      if (Date.now() < actReadyAt) return; // the tap that ended the last decision, landing on this one
      if (b.dataset.act === "fold") heroAct({ type: "fold" });
      else if (b.dataset.act === "call") heroAct({ type: L.canCheck ? "check" : "call" });
      else heroAct(sizerTo >= L.bet + L.stack ? { type: "allin" } : { type: "raise", to: sizerTo || L.minTo });
      sizerTo = 0;
    }
  }

  function onInput(e) {
    if (root.OnlinePlay && root.OnlinePlay.onInput(e.target)) return;
    if (e.target.dataset.range === undefined) return;
    sizerTo = +e.target.value;
    const L = E.legal(S());
    if (L && sizerTo > L.maxTo - S().bb / 2) sizerTo = L.maxTo;
    syncSizer(true);
  }

  function syncSizer(fromRange) {
    const L = E.legal(S());
    const amt = el.querySelector("#amt"), rng = el.querySelector("[data-range]"), btn = el.querySelector("#raiseBtn");
    if (amt) amt.textContent = fmt(sizerTo);
    if (rng && !fromRange) rng.value = sizerTo;
    if (btn && L) btn.innerHTML = sizerTo >= L.bet + L.stack ? "All in" : (L.isBet ? "Bet " : "Raise to ") + `<small>${fmt(sizerTo)}</small>`;
  }

  // ================================================================ sheets
  function openMenu() {
    const s = G && G.state;
    if (G && G.online) {
      const o = root.OnlinePlay.snap || {};
      Sheet.open(`<h3>Table ${esc(o.code || "")}</h3><p class="muted">Friends join with this code from Play with friends.</p>
        <div style="display:grid;gap:8px"><button class="btn danger" data-close data-oleaveask>Leave table</button></div>
        <div class="row"><button class="btn ghost" data-close>Close</button></div>`);
      return;
    }
    Sheet.open(`<h3>Table</h3>
      <div style="display:grid;gap:8px">
        <button class="btn" data-m="new">New table…</button>
        ${s && s.cfg.format === "cash" && s.seats[0].stack < s.cfg.startStack && (s.street === "done") ? `<button class="btn" data-m="topup">Top up to ${fmt(s.cfg.startStack)}</button>` : ""}
        <button class="btn" data-help="strength">How strong are the computers?</button>
      </div><div class="row"><button class="btn ghost" data-close>Close</button></div>`, (body) => {
      body.addEventListener("click", (e) => {
        const m = e.target.closest("[data-m]");
        if (!m) return;
        if (m.dataset.m === "new") { Sheet.close(); newGame(); }
        if (m.dataset.m === "topup") {
          // Top up adds only the missing chips, and counts only those as money put in.
          const st = S(), me = st.seats[0], add = st.cfg.startStack - me.stack;
          me.topup = (me.topup || 0) + add; me.stack += add;
          G.startStacks[0] = (G.startStacks[0] || 0) + add;
          Sheet.close(); save(); render();
        }
      });
    });
  }

  function newGame() {
    if (G && G.online) { root.OnlinePlay.leave(); return; }
    clearTimeout(timer); gen++;
    G = null; UI.Store.data.game = null; UI.Store.save();
    render();
  }

  function rebuyHero() {
    if (G && G.online) { dealNext(); return; }
    const s = E.apply(S(), { type: "rebuy", seat: 0 });
    G.state = s; save();
    dealNext();
  }

  function offerRebuy() {
    Sheet.open(`<h3>Out of chips</h3><p>Buy back in for ${fmt(S().cfg.startStack)}?</p><div class="row"><button class="btn ghost" data-close>Not now</button><button class="btn primary" data-close data-rebuy2>Buy in</button></div>`, (body) => {
      body.querySelector("[data-rebuy2]").addEventListener("click", rebuyHero);
    });
  }

  function offerOut() {
    const s = S();
    const place = s.seats[0].place;
    Sheet.open(`<h3>You finished ${ordinal(place)} of ${s.seats.length}</h3><p>Play out the rest instantly to see who wins?</p>
      <div class="row"><button class="btn ghost" data-close>Close</button><button class="btn primary" data-finish>Finish it</button></div>`, (body) => {
      body.querySelector("[data-finish]").addEventListener("click", finishTourney);
    });
  }

  function finishTourney() {
    // (no data-close on the button: the page's close-on-tap would shut the results sheet opened below)
    Sheet.close();
    let s = S();
    let guard = 0;
    while (!s.over && guard++ < 5000) {
      if (s.street === "done") { s = E.apply(s, { type: "deal" }); continue; }
      const v = E.view(s, s.toAct);
      const r = B.decide(v, s.seats[s.toAct].level || "medium", P.rng32(s.hand * 131 + s.log.length));
      try { s = E.apply(s, r.action); } catch (e) { s = E.apply(s, { type: E.legal(s).toCall ? "fold" : "check" }); }
    }
    G.recorded = true;
    setState(s);
    if (!s.over || s.winner < 0) return;
    const order = s.seats.slice().sort((a, b) => a.place - b.place);
    Sheet.open(`<h3>${esc(s.seats[s.winner].name)} won</h3>${order.map((p) => `<p>${ordinal(p.place)} · ${esc(p.name)}${p.level ? ` <span class="muted">(${p.level})</span>` : ""}</p>`).join("")}<div class="row"><button class="btn primary" data-close>OK</button></div>`);
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-menu]")) openMenu();
    if (e.target.closest("[data-oleaveask]")) root.OnlinePlay.confirmLeave();
  });

  /** Another tab of this site changed the saved game: show that one (never two games fighting over one save). */
  function sync() {
    if (!el || (G && G.online)) return;
    clearTimeout(timer); gen++;
    G = UI.Store.data.game;
    hintText = "";
    render();
    schedule();
  }

  root.PlayTab = { init, render: () => { render(); }, newGame, setOnline, sync };
})(this);
