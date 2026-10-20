/* study.js — hand history study mode: everyone's cards, how the odds moved
 * street by street, and the expected value (EV) of each of your decisions. */
(function (root) {
  "use strict";
  const { Poker: P, UI } = root;
  const { esc, card, pct, scale, qm, fmt } = UI;
  const COLORS = ["#6ea8fe", "#f0b354", "#6ee7a8", "#f08c8c", "#c49bff", "#5fd4d4", "#ff9ec7", "#c8c8c8", "#e3d26f"];

  let el, sel = 0;

  function init(container) { el = container; el.addEventListener("click", onClick); }

  function show(i) { sel = i || 0; render(); }

  function render() {
    const H = UI.Store.data.history;
    if (!H.length) {
      el.innerHTML = `<div class="empty">No hands yet.<br>Play a few on the <b>Play</b> tab — every hand lands here with everyone's cards.</div>`;
      return;
    }
    if (sel >= H.length) sel = 0;
    // summary strip
    let lost = 0, decs = 0, luck = 0, luckN = 0, net = 0;
    for (const h of H) {
      net += h.net;
      for (const d of h.decisions || []) { if (d.ev) { lost += d.ev.lost; decs++; } }
      if (h.allIn) { luck += h.allIn.actual - h.allIn.expected; luckN++; }
    }
    const bb = H[0].bb || 20;
    const list = H.map((h, i) => {
      const me = h.seats[0];
      return `<div class="hrow ${i === sel ? "on" : ""}" data-h="${i}"><span class="muted num">#${h.hand}</span>
        <div class="cards">${me.hole.map((c) => card(c)).join("")}</div>
        <span class="muted" style="font-size:12.5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(summary(h))}</span>
        <span class="net ${h.net > 0 ? "good" : h.net < 0 ? "bad" : "muted"}">${h.net > 0 ? "+" : ""}${fmt(h.net)}</span></div>`;
    }).join("");
    el.innerHTML = `<div class="study-wrap">
      <div class="luck">
        <div><span>Last ${H.length} hands</span><b class="${net >= 0 ? "good" : "bad"}">${net >= 0 ? "+" : ""}${fmt(net)}</b></div>
        <div><span>Lost to choices${qm("lost")}</span><b style="color:${scale(-lost / Math.max(1, H.length) / bb, -0.6, 0)}">${fmt(lost)}</b></div>
        <div><span>Luck ${qm("luck")}</span><b class="${luck >= 0 ? "good" : "bad"}">${luckN ? (luck >= 0 ? "+" : "") + fmt(luck) : "—"}</b></div>
      </div>
      <div class="hand-list scroll" style="max-height:${root.innerWidth >= 900 ? "none" : "34%"}">${list}</div>
      <div class="hand-detail scroll" id="detail" style="flex:1"></div>
    </div>`;
    void decs;
    renderDetail(H[sel]);
  }

  function summary(h) {
    const me = h.seats[0];
    if (!me.dealt) return "sat out";
    const folded = h.log.find((e) => e.seat === 0 && e.type === "fold");
    if (folded) return "folded " + folded.street;
    if (h.result.byFold) return "won, all folded";
    return h.result.names[0] || "";
  }

  function renderDetail(h) {
    const box = el.querySelector("#detail");
    const r = h.result;
    const dealt = h.seats.map((p, i) => ({ p, i })).filter((x) => x.p.dealt);
    const rows = dealt.map(({ p, i }) => {
      const won = r.net[i] + (p.start - p.end + r.net[i] === 0 ? 0 : 0);
      const name = h.board.length === 5 ? P.describe(P.evaluate(p.hole, 2, h.board, 5)) : "";
      const delta = p.end - p.start;
      void won;
      return `<tr><td><span style="color:${COLORS[i % COLORS.length]}">●</span> ${esc(p.name)}${p.level ? ` <span class="muted" style="font-size:11px">${p.level}</span>` : ""}${i === h.button ? ` <span class="muted">(D)</span>` : ""}</td>
        <td><div class="cards">${p.hole.map((c) => card(c, p.folded ? "dim" : "")).join("")}</div></td>
        <td class="muted" style="font-size:12px">${p.folded ? "folded" : esc(name)}</td>
        <td class="num ${delta > 0 ? "good" : delta < 0 ? "bad" : "muted"}" style="text-align:right">${delta > 0 ? "+" : ""}${fmt(delta)}</td></tr>`;
    }).join("");
    const boardHTML = [0, 1, 2, 3, 4].map((k) => card(h.board[k] === undefined ? -1 : h.board[k])).join("");
    box.innerHTML = `<div class="hd-head"><div class="hd-board">${boardHTML}</div></div>
      <table class="players-tbl">${rows}</table>
      <div class="label" style="margin:4px 0">Who was ahead${qm("equity")}</div>
      <div id="eqg"><div class="muted" style="font-size:13px">Working it out…</div></div>
      <div class="label" style="margin:10px 0 6px">Your decisions${qm("ev")}</div>
      <div id="decs">${(h.decisions || []).length ? "<div class='muted' style='font-size:13px'>Working it out…</div>" : "<div class='muted' style='font-size:13px'>No decisions this hand (you were in the blinds and it folded to you, or you were out).</div>"}</div>
      ${h.allIn ? `<div class="label" style="margin:10px 0 4px">All in on the ${h.allIn.street}</div><div style="font-size:14px">Expected <b>${fmt(h.allIn.expected)}</b> · got <b>${fmt(h.allIn.actual)}</b> → luck <b class="${h.allIn.actual - h.allIn.expected >= 0 ? "good" : "bad"}">${h.allIn.actual - h.allIn.expected >= 0 ? "+" : ""}${fmt(h.allIn.actual - h.allIn.expected)}</b></div>` : ""}`;
    // heavy maths after paint
    const my = h.id;
    setTimeout(() => {
      if (UI.Store.data.history[sel] !== h || h.id !== my) return;
      const g = box.querySelector("#eqg");
      if (g) g.innerHTML = graph(h);
      const d = box.querySelector("#decs");
      if (d && (h.decisions || []).length) { d.innerHTML = h.decisions.map((x) => decisionHTML(h, x)).join(""); UI.Store.save(); render2(); }
    }, 30);
  }
  function render2() {
    // update the "chips lost" total after new EVs were computed
    const luckEl = el.querySelector(".luck div:nth-child(2) b");
    if (!luckEl) return;
    let lost = 0;
    for (const h of UI.Store.data.history) for (const d of h.decisions || []) if (d.ev) lost += d.ev.lost;
    luckEl.textContent = fmt(lost);
  }

  /** Equity of every dealt player at each street (hindsight, all cards known). */
  function streetEquities(h) {
    if (h.eqs) return h.eqs;
    const dealt = h.seats.map((p, i) => i).filter((i) => h.seats[i].dealt);
    const streets = [["Pre", 0], ["Flop", 3], ["Turn", 4], ["River", 5]].filter(([, n]) => n <= h.board.length || n === 0);
    const foldStreet = {};
    for (const e of h.log) if (e.type === "fold") foldStreet[e.seat] = ["preflop", "flop", "turn", "river"].indexOf(e.street);
    const out = streets.map(([label, n], k) => {
      const live = dealt.filter((i) => foldStreet[i] === undefined || foldStreet[i] >= k);
      const eqs = live.length > 1 ? P.allEquities(live.map((i) => h.seats[i].hole), h.board.slice(0, n), [], { trials: 6000, exactLimit: 250000, seed: 7 }) : live.map(() => 1);
      const m = {};
      live.forEach((i, j) => { m[i] = eqs[j]; });
      return { label, m };
    });
    h.eqs = out;
    return out;
  }

  function graph(h) {
    const st = streetEquities(h);
    const W = 320, Hh = 90, padL = 26, padR = 8, padT = 6, padB = 16;
    const x = (k) => padL + (st.length > 1 ? (k * (W - padL - padR)) / (st.length - 1) : 0);
    const y = (v) => padT + (1 - v) * (Hh - padT - padB);
    let paths = "";
    const seats = new Set();
    st.forEach((s) => Object.keys(s.m).forEach((i) => seats.add(+i)));
    for (const i of seats) {
      const pts = st.map((s, k) => (s.m[i] === undefined ? null : [x(k), y(s.m[i])])).filter(Boolean);
      if (!pts.length) continue;
      const col = COLORS[i % COLORS.length];
      paths += `<polyline fill="none" stroke="${col}" stroke-width="${i === 0 ? 3 : 1.6}" points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
      paths += pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === 0 ? 3.2 : 2.2}" fill="${col}"/>`).join("");
    }
    const labels = st.map((s, k) => `<text x="${x(k)}" y="${Hh - 3}" fill="#969db4" font-size="10" text-anchor="middle">${s.label}</text>`).join("");
    const grid = [0, 0.5, 1].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#2a3042"/><text x="${padL - 4}" y="${y(v) + 3}" fill="#969db4" font-size="9" text-anchor="end">${v * 100}%</text>`).join("");
    const mine = st.map((s) => (s.m[0] === undefined ? "—" : pct(s.m[0], 0))).join(" → ");
    return `<svg class="eqgraph" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">${grid}${paths}${labels}</svg><div class="muted" style="font-size:12.5px">You: ${mine}</div>`;
  }

  /** EV table for one decision. Computes once, caches on the record. */
  function decisionHTML(h, d) {
    if (!d.ev) {
      const known = P.equity({ hero: d.hole, board: d.board, opponents: Math.max(1, d.opp), trials: 6000, exactLimit: 200000, seed: 11 }).equity;
      const real = P.allEquities([d.hole].concat(d.live.map((i) => h.seats[i].hole)), d.board, [], { trials: 6000, exactLimit: 250000, seed: 13 })[0];
      const opts = [];
      const evOf = (eq, kind, to) => {
        if (kind === "fold") return 0;
        if (kind === "check") return eq * d.pot;
        if (kind === "call") return eq * (d.pot + d.callAmount) - d.callAmount;
        const add = to - d.bet, oppAdd = Math.max(0, to - d.currentBet);
        return eq * (d.pot + add + oppAdd) - add;
      };
      if (d.toCall > 0) opts.push(["fold", "Fold", 0]);
      opts.push(d.toCall > 0 ? ["call", "Call " + fmt(d.callAmount), 0] : ["check", "Check", 0]);
      if (d.type === "raise" || d.type === "bet") opts.push(["raise", (d.currentBet === 0 ? "Bet " : "Raise to ") + fmt(d.to) + " *", d.to]);
      const rows = opts.map(([k, label, to]) => ({ k, label, known: evOf(known, k, to), real: evOf(real, k, to) }));
      const chosenK = d.type === "check" ? "check" : d.type === "call" ? (d.toCall > 0 ? "call" : "check") : d.type === "fold" ? "fold" : "raise";
      const passive = rows.filter((r) => r.k !== "raise");
      const best = Math.max(...passive.map((r) => r.known));
      const chosen = rows.find((r) => r.k === chosenK) || rows[0];
      const lost = Math.max(0, best - chosen.known);
      d.ev = { known, real, rows, chosen: chosenK, lost: Math.round(lost) };
    }
    const e = d.ev;
    const need = d.toCall > 0 ? d.callAmount / (d.pot + d.callAmount) : 0;
    const street = d.street[0].toUpperCase() + d.street.slice(1);
    const lostTxt = e.lost > 0.5 ? `<span class="lost bad">−${fmt(e.lost)}</span>` : `<span class="lost good">best</span>`;
    return `<div class="dec"><div class="row1"><span>${street}: ${esc(label(d))}</span>${lostTxt}</div>
      <div class="muted" style="font-size:12.5px">Pot ${fmt(d.pot)}${d.toCall ? ` · to call ${fmt(d.callAmount)} · need ${pct(need, 0)}` : ""} · you had <b style="color:${scale(e.known - need, -0.15, 0.2)}">${pct(e.known, 0)}</b> (really ${pct(e.real, 0)}) · hint: ${esc(d.hint || "")}</div>
      <table><tr class="muted"><td></td><td style="text-align:right">You knew</td><td style="text-align:right">Their cards</td></tr>
      ${e.rows.map((r) => `<tr class="${r.k === e.chosen ? "chosen" : ""}"><td>${esc(r.label)}${r.k === e.chosen ? " ◂" : ""}</td><td style="text-align:right;color:${scale(r.known, -d.pot * 0.3, d.pot * 0.3)}">${sign(r.known)}</td><td style="text-align:right" class="muted">${sign(r.real)}</td></tr>`).join("")}</table>
      ${e.rows.some((r) => r.k === "raise") ? `<div class="muted" style="font-size:11.5px">* if one player calls</div>` : ""}</div>`;
  }
  const sign = (v) => (v >= 0 ? "+" : "−") + fmt(Math.abs(v));
  function label(d) {
    if (d.type === "fold") return "Folded";
    if (d.type === "check") return "Checked";
    if (d.type === "call") return d.toCall > 0 ? "Called " + fmt(d.callAmount) : "Checked";
    return (d.currentBet === 0 ? "Bet " : "Raised to ") + fmt(d.to);
  }

  function onClick(e) {
    const r = e.target.closest("[data-h]");
    if (r) { sel = +r.dataset.h; render(); }
  }

  root.StudyTab = { init, render, show };
})(this);
