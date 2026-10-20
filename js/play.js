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

  function init(container) {
    el = container;
    G = UI.Store.data.game;
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    render();
    schedule();
  }

  const S = () => G.state;
  const save = () => { UI.Store.data.game = G; UI.Store.save(); };

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
    if (!G || !G.state) return;
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
    const L = E.legal(s);
    const opp = s.seats.filter((p) => p.i !== 0 && !p.folded).length;
    let next;
    try { next = E.apply(s, a); } catch (e) { UI.toast(e.message); return; }
    G.decisions.push({
      street: s.street, board: s.board.slice(), hole: s.seats[0].hole.slice(), pot: L.pot, toCall: L.toCall,
      callAmount: L.callAmount, currentBet: s.currentBet, bet: L.bet, stack: L.stack, opp,
      live: s.seats.filter((p) => p.i !== 0 && !p.folded).map((p) => p.i),
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
    if (h.length > 150) h.length = 150;
    const st = UI.Store.data.stats;
    st.hands++; st.net += rec.net;
    save();
  }

  function allInLuck(s) {
    if (!s.result || s.result.byFold || s.seats[0].folded) return null;
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
  function seatXY(k, n, hero) {
    // k-th seat clockwise from you (k = 0 is you at the bottom centre)
    const a = Math.PI / 2 + (2 * Math.PI * k) / n;
    const wide = root.innerWidth >= 900;
    const rx = wide ? 41 : 42, ry = wide ? 39 : 37;
    let x = 50 + rx * Math.cos(a), y = 49 + ry * Math.sin(a);
    if (hero) y += wide ? 1 : 2;
    return [x, y];
  }

  function render() {
    if (!G || !G.state) { renderSetup(); updateTop(); return; }
    const s = S();
    const n = s.seats.length;
    const wide = root.innerWidth >= 900;
    let html = "";
    const resShown = new Set(s.result ? s.result.shown : []);
    const winners = new Set(s.result ? [].concat(...s.result.pots.map((p) => p.winners)) : []);
    s.seats.forEach((p, k) => {
      const [x, y] = seatXY(k, n, k === 0);
      const hero = k === 0;
      const showCards = hero || resShown.has(p.i);
      const cards = p.hole.length ? p.hole.map((c, j) => {
        const key = `${s.hand}-${p.i}-${j}${showCards ? "f" : ""}`;
        const isNew = !seen.has(key);
        seen.add(key);
        const cls = (p.folded && !hero ? "dim " : "") + (isNew ? (showCards && !hero ? "flip" : "deal") : "");
        const dx = (50 - x) * 3, dy = (47 - y) * 3;
        return card(showCards ? c : null, cls, `style="--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;animation-delay:${isNew && !showCards ? (j * n + k) * 45 : 0}ms"`);
      }).join("") : "";
      const lvl = p.kind === "human" ? "human" : p.level;
      let tag = "";
      if (s.street === "done" && winners.has(p.i)) tag = `<span class="tag win">+${fmt(s.result.net[p.i] + p.total)}</span>`;
      else if (s.street === "done" && resShown.has(p.i) && s.result.names[p.i]) tag = `<span class="tag">${esc(short(s.result.names[p.i]))}</span>`;
      else if (p.allIn && !p.folded) tag = `<span class="tag">All in</span>`;
      else { const last = lastAction(s, p.i); if (last) tag = `<span class="tag">${last}</span>`; }
      const cls = ["seat", hero ? "hero" : "", s.toAct === p.i ? "turn" : "", p.folded && p.hole.length ? "folded" : "", p.out || (!p.hole.length && s.street !== "idle") ? "out" : ""].join(" ");
      html += `<div class="${cls}" style="left:${x}%;top:${y}%">
        <div class="hole">${cards}</div>
        <div class="plate">${tag}<span class="av" style="background:${LEVEL_COLOR[lvl] || "#999"}">${esc(p.name[0])}</span>
          <span><div class="nm">${esc(p.name)}</div><div class="st">${p.out ? (p.place ? ordinal(p.place) : "out") : fmt(p.stack)}</div></span></div>
        ${s.toAct === p.i && p.kind === "bot" ? `<div class="think"><i></i><i></i><i></i></div>` : ""}
      </div>`;
      if (p.bet > 0) {
        const bx = 50 + (x - 50) * 0.56, by = 47 + (y - 47) * (hero ? 0.42 : 0.56);
        html += `<div class="seatbet" style="left:${bx}%;top:${by}%"><span class="bet">${chip(p.bet)}${fmt(p.bet)}</span></div>`;
      }
      if (p.i === s.button) {
        const dxp = hero ? x + 13 : 50 + (x - 50) * 0.8 + (x < 50 ? 4 : x > 50 ? -4 : 9), dyp = hero ? y - 2 : 47 + (y - 47) * 0.72;
        html += `<div class="dealer" style="left:${dxp}%;top:${dyp}%">D</div>`;
      }
    });
    const board = [];
    for (let i = 0; i < 5; i++) {
      const c = s.board[i];
      if (c === undefined) { board.push(card(-1)); continue; }
      const key = `${s.hand}-b${i}`;
      const isNew = !seen.has(key);
      seen.add(key);
      const win = s.street === "done" && s.result && !s.result.byFold;
      board.push(card(c, isNew ? "deal" : "", `style="animation-delay:${isNew ? (i < 3 ? i * 90 : 0) : 0}ms;--dy:-30px"${win ? "" : ""}`));
    }
    const pot = E.potTotal(s) - s.seats.reduce((a, p) => a + p.bet, 0);
    let resLine = "";
    if (s.street === "done" && s.result) {
      const r = s.result;
      const w = r.pots[0].winners.map((i) => s.seats[i].name).join(" & ");
      resLine = r.byFold ? `${esc(w)} win${w === "You" ? "" : "s"} — everyone else folded` : `${esc(w)} win${w === "You" || w.includes("&") ? "" : "s"} with ${esc(r.names[r.pots[0].winners[0]] || "")}`;
      if (r.pots.length > 1) resLine += ` · ${r.pots.length - 1} side pot${r.pots.length > 2 ? "s" : ""}`;
    } else if (s.over) resLine = `${esc(s.seats[s.winner].name)} won the tournament`;
    const potShown = s.street === "done" ? r0(s) : pot;
    const center = `<div class="center"><div class="pot">${potShown > 0 ? `${chip(potShown)} Pot ${fmt(potShown)}` : ""}</div><div class="board">${board.join("")}</div><div class="result-line">${resLine}</div></div>`;

    const side = wide ? `<aside class="side"><h3>Odds</h3><div id="sideOdds" style="padding:0 14px 8px"></div><h3>This hand</h3><div class="log scroll" id="sideLog" style="flex:1">${logHTML(s)}</div></aside>` : "";
    el.innerHTML = `<div class="play-wrap">
      <div class="play-main" style="flex:1;display:flex;flex-direction:column;min-height:0">
        <div class="table-area"><div class="felt"></div>${center}${html}</div>
        <div class="hud" id="hud"></div>
        <div class="actions-wrap"><div class="actions" id="actions"></div></div>
      </div>${side}</div>`;
    renderHud();
    renderActions();
    updateTop();
  }
  const r0 = (s) => (s.result ? s.result.pots.reduce((a, p) => a + p.amount, 0) : 0);
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
      const you = e.seat === 0 && s.seats[0].kind === "human";
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
      html = `<span class="hname">This hand: <b class="${net > 0 ? "good" : net < 0 ? "bad" : ""}">${net > 0 ? "+" : ""}${fmt(net)}</b></span><span class="spacer"></span><span class="muted">Session ${fmtSigned(s.seats[0].stack + (s.seats[0].buyIns - 1) * 0 - s.cfg.startStack * s.seats[0].buyIns)}</span>`;
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
        <button class="btn" data-study>Study hand</button>
        ${over ? `<button class="btn primary" data-newgame>New game</button>` : busted ? `<button class="btn warm" data-rebuy>Buy back in</button>` : `<button class="btn primary" data-next>Next hand</button>`}</div>`;
      return;
    }
    const mine = s.toAct === 0;
    const L = mine ? E.legal(s) : null;
    const dis = mine ? "" : "disabled";
    let sizer = `<span class="muted" style="font-size:13px">${mine ? "" : s.seats[0].folded ? "Waiting for the hand to finish…" : "Waiting…"}</span>`;
    // a fresh decision gets a fresh default size (never carry the last one over)
    const decKey = `${s.cfg.seed}-${s.hand}-${s.log.length}`;
    if (mine && decKey !== sizerKey) { sizerKey = decKey; sizerTo = 0; }
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
    t.innerHTML = `${fmtName} · ${s.sb}/${s.bb}${s.ante ? " +" + s.ante : ""}${s.cfg.format === "tourney" ? " · Lv " + (s.level + 1) : ""} <button class="btn small ghost" data-menu style="margin-left:6px;min-height:30px">Menu</button>`;
  }

  // ================================================================ events
  function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
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
      if (b.dataset.act === "fold") heroAct({ type: "fold" });
      else if (b.dataset.act === "call") heroAct({ type: L.canCheck ? "check" : "call" });
      else heroAct(sizerTo >= L.bet + L.stack ? { type: "allin" } : { type: "raise", to: sizerTo || L.minTo });
      sizerTo = 0;
    }
  }

  function onInput(e) {
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
        if (m.dataset.m === "topup") { const st = S(); st.seats[0].buyIns++; st.seats[0].stack = st.cfg.startStack; Sheet.close(); save(); render(); }
      });
    });
  }

  function newGame() {
    clearTimeout(timer); gen++;
    G = null; UI.Store.data.game = null; UI.Store.save();
    render();
  }

  function rebuyHero() {
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
      <div class="row"><button class="btn ghost" data-close>Close</button><button class="btn primary" data-close data-finish>Finish it</button></div>`, (body) => {
      body.querySelector("[data-finish]").addEventListener("click", finishTourney);
    });
  }

  function finishTourney() {
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
    const order = s.seats.slice().sort((a, b) => a.place - b.place);
    Sheet.open(`<h3>${esc(s.seats[s.winner].name)} won</h3>${order.map((p) => `<p>${ordinal(p.place)} · ${esc(p.name)}${p.level ? ` <span class="muted">(${p.level})</span>` : ""}</p>`).join("")}<div class="row"><button class="btn primary" data-close>OK</button></div>`);
  }

  document.addEventListener("click", (e) => { if (e.target.closest("[data-menu]")) openMenu(); });

  root.PlayTab = { init, render: () => { render(); }, newGame };
})(this);
