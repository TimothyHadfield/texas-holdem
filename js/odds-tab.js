/* odds-tab.js — the odds calculator for the real table, plus the
 * starting-hand chart. My cards + board (+ an opponent's cards or other
 * seen cards) vs N opponents -> win / tie %, outs, pot odds. */
(function (root) {
  "use strict";
  const { Poker: P, UI, PREFLOP } = root;
  const { esc, card, pct, scale, qm } = UI;

  let S = null;     // persisted odds state
  let el = null;
  let calcT = 0, lastKey = "", lastRes = null, chartSel = null;

  function init(container) {
    el = container;
    const d = UI.Store.data;
    S = d.odds = Object.assign({ hero: [-1, -1], board: [-1, -1, -1, -1, -1], them: [-1, -1], seen: [], opp: 1, sel: ["hero", 0], pot: "", bet: "", mode: "calc" }, d.odds || {});
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    render();
  }

  const groups = () => [["hero", S.hero], ["board", S.board], ["them", S.them]];
  function used() {
    return [].concat(S.hero, S.board, S.them, S.seen).filter((c) => c >= 0);
  }

  function render() {
    if (S.mode === "chart") return renderChart();
    const usedSet = new Set(used());
    const slot = (g, i, c) => {
      const isSel = S.sel[0] === g && S.sel[1] === i;
      return card(c, (isSel ? "sel " : ""), `data-slot="${g}" data-i="${i}"`);
    };
    const row = (label, g, arr, tail) => `<div class="slot-row"><span class="label">${label}</span><div class="cards">${arr.map((c, i) => slot(g, i, c)).join("")}</div><div class="tail">${tail || ""}</div></div>`;
    const seenCards = S.seen.map((c, i) => card(c, "", `data-seen="${i}" style="--w:24px"`)).join("");
    let picker = "";
    for (let s = 3; s >= 0; s--) for (let r = 12; r >= 0; r--) {
      const c = (r << 2) | s;
      picker += `<button class="pk s${s} ${usedSet.has(c) ? "used" : ""}" data-pick="${c}" aria-label="${UI.cardText(c)}">${UI.RANK_SHOW[r]}<i>${P.SUIT_SYMBOL[s]}</i></button>`;
    }
    el.innerHTML = `
      <div class="odds-wrap">
        <div class="odds-top">
          <div id="oddsBig"></div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <div class="seg" style="width:170px"><button data-mode="calc" class="on">Odds</button><button data-mode="chart">Chart</button></div>
            <div style="display:flex;align-items:center;gap:6px"><span class="label">Players</span>
            <div class="stepper"><button data-opp="-1" aria-label="Fewer opponents">−</button><b>${S.opp}</b><button data-opp="1" aria-label="More opponents">+</button></div></div>
          </div>
        </div>
        <div class="slots">
          ${row("You", "hero", S.hero, `<button class="btn small ghost" data-clear>Clear</button>`)}
          ${row("Board", "board", S.board)}
          ${row("Them", "them", S.them, `<span class="label">Seen</span><div class="cards" style="gap:2px">${seenCards}</div><button class="btn small ${S.sel[0] === "seen" ? "primary" : ""}" data-seenadd aria-label="Add a seen card">+</button>`)}
        </div>
        <div class="odds-low">
          <div class="picker">${picker}</div>
          <div class="odds-extra" id="oddsExtra"></div>
        </div>
      </div>`;
    renderResult();
  }

  /** Big number + extras. Computes after a short pause so taps stay smooth. */
  function renderResult() {
    const big = el.querySelector("#oddsBig"), extra = el.querySelector("#oddsExtra");
    if (!big) return;
    const hero = S.hero.filter((c) => c >= 0);
    const board = S.board.filter((c) => c >= 0);
    const them = S.them.filter((c) => c >= 0);
    const potOddsHTML = (eq) => {
      const pot = parseFloat(S.pot), bet = parseFloat(S.bet);
      let v = "";
      if (pot > 0 && bet > 0) {
        const need = bet / (pot + bet);
        const ev = eq === null ? null : eq * (pot + bet) - bet;
        v = `<span class="verdict" style="color:${eq === null ? "var(--muted)" : scale(eq - need, -0.15, 0.15)}">Need ${pct(need, 0)}${ev === null ? "" : ev >= 0 ? ` · Call +${ev.toFixed(1)}` : ` · Fold (call ${ev.toFixed(1)})`}</span>`;
      }
      return `<div class="potodds"><span class="label">Pot</span><input type="number" inputmode="decimal" min="0" data-f="pot" value="${esc(S.pot)}" placeholder="0"><span class="label">To call</span><input type="number" inputmode="decimal" min="0" data-f="bet" value="${esc(S.bet)}" placeholder="0">${qm("potodds")}${v}</div>`;
    };
    if (hero.length < 2) {
      big.innerHTML = `<div class="bignum muted" style="font-size:22px">Pick your two cards</div><div class="subnums">Tap a card below</div>`;
      extra.innerHTML = potOddsHTML(null);
      return;
    }
    const key = JSON.stringify([hero, board, them, S.seen, S.opp]);
    const show = (r) => {
      const nowName = board.length >= 3 ? P.describe(P.evaluate(hero, 2, board, board.length)) : "";
      big.innerHTML = `<div class="bignum" style="color:${scale(r.equity, 1 / (S.opp + 1) - 0.15, 1 / (S.opp + 1) + 0.25)}">${(r.equity * 100).toFixed(1)}<small>% win${qm("equity")}</small></div>
        <div class="subnums"><span>Win <b>${pct(r.win)}</b></span><span>Tie <b>${pct(r.tie)}</b></span><span>${r.exact ? "exact" : "≈ " + UI.fmt(r.n) + " deals"}</span>${nowName ? `<span><b>${esc(nowName)}</b></span>` : ""}</div>`;
      let outsHTML = "";
      if (board.length === 3 || board.length === 4) {
        const o = P.outs(hero, board, them.concat(S.seen));
        if (o && o.cards.length) {
          const kinds = Object.entries(o.byKind).map(([k, v]) => `${esc(k)} ${v.length}`).join(" · ");
          outsHTML = `<div class="outs-line">Outs <b>${o.cards.length}</b> (${kinds}) · next card <b>${pct(o.nextPct, 0)}</b>${board.length === 3 ? ` · by the river <b>${pct(o.riverPct, 0)}</b>` : ""}${qm("outs")}</div>`;
        } else if (o) outsHTML = `<div class="outs-line">No outs to a better kind of hand${qm("outs")}</div>`;
      }
      extra.innerHTML = outsHTML + potOddsHTML(r.equity);
    };
    if (key === lastKey && lastRes) { show(lastRes); return; }
    big.innerHTML = `<div class="bignum muted">…</div><div class="subnums">Working it out</div>`;
    extra.innerHTML = potOddsHTML(null);
    clearTimeout(calcT);
    calcT = setTimeout(() => {
      const r = P.equity({
        hero, board, dead: S.seen, opponents: S.opp, known: them.length === 2 ? [them] : [],
        trials: 40000, exactLimit: 900000, seed: 4242,
      });
      lastKey = key; lastRes = r;
      show(r);
    }, 20);
  }

  function nextEmpty() {
    for (const [g, arr] of groups()) {
      if (g === "them") continue;
      const i = arr.indexOf(-1);
      if (i >= 0) return [g, i];
    }
    const i = S.them.indexOf(-1);
    return i >= 0 ? ["them", i] : ["seen", 0];
  }

  function onClick(e) {
    const t = e.target.closest("button, [data-slot], [data-seen], [data-cell]");
    if (!t) return;
    if (t.dataset.mode) { S.mode = t.dataset.mode; save(); render(); return; }
    if (t.dataset.opp) {
      const max = 9 - (S.them.filter((c) => c >= 0).length === 2 ? 0 : 0);
      S.opp = Math.max(1, Math.min(8, S.opp + +t.dataset.opp)); void max;
      save(); render(); return;
    }
    if (t.dataset.clear !== undefined) {
      S.hero = [-1, -1]; S.board = [-1, -1, -1, -1, -1]; S.them = [-1, -1]; S.seen = []; S.sel = ["hero", 0];
      save(); render(); return;
    }
    if (t.dataset.seenadd !== undefined) { S.sel = ["seen", 0]; save(); render(); return; }
    if (t.dataset.seen !== undefined) { S.seen.splice(+t.dataset.seen, 1); save(); render(); return; }
    if (t.dataset.slot) {
      const g = t.dataset.slot, i = +t.dataset.i;
      const arr = S[g];
      if (S.sel[0] === g && S.sel[1] === i && arr[i] >= 0) arr[i] = -1; // tap a selected card again to clear it
      S.sel = [g, i];
      save(); render(); return;
    }
    if (t.dataset.pick !== undefined) {
      const c = +t.dataset.pick;
      if (used().includes(c)) {
        // tapping a used card removes it from wherever it is
        for (const [, arr] of groups()) { const k = arr.indexOf(c); if (k >= 0) arr[k] = -1; }
        const k = S.seen.indexOf(c); if (k >= 0) S.seen.splice(k, 1);
        save(); render(); return;
      }
      const [g, i] = S.sel;
      if (g === "seen") { if (S.seen.length < 8) S.seen.push(c); }
      else {
        S[g][i] = c;
        S.sel = nextEmpty();
      }
      save(); render(); return;
    }
    if (t.dataset.cell !== undefined) { chartSel = +t.dataset.cell; renderChart(); }
  }

  function onInput(e) {
    const f = e.target.dataset.f;
    if (!f) return;
    S[f] = e.target.value;
    save();
    // update only the verdict, keep focus in the box (re-rendering would close the keyboard)
    const r = lastRes && JSON.stringify([S.hero.filter((c) => c >= 0), S.board.filter((c) => c >= 0), S.them.filter((c) => c >= 0), S.seen, S.opp]) === lastKey ? lastRes : null;
    const pot = parseFloat(S.pot), bet = parseFloat(S.bet);
    const box = e.target.closest(".potodds");
    let v = box.querySelector(".verdict");
    if (!(pot > 0 && bet > 0)) { if (v) v.remove(); return; }
    if (!v) { v = document.createElement("span"); v.className = "verdict"; box.appendChild(v); }
    const need = bet / (pot + bet);
    if (!r || S.hero.includes(-1)) { v.textContent = `Need ${pct(need, 0)}`; v.style.color = "var(--muted)"; return; }
    const ev = r.equity * (pot + bet) - bet;
    v.textContent = `Need ${pct(need, 0)}` + (ev >= 0 ? ` · Call +${ev.toFixed(1)}` : ` · Fold (call ${ev.toFixed(1)})`);
    v.style.color = scale(r.equity - need, -0.15, 0.15);
  }

  // -------------------------------------------------------------- chart
  function renderChart() {
    const n = S.opp;
    const R = P.RANKS;
    let cells = "";
    const fair = 1 / (n + 1);
    for (let i = 12; i >= 0; i--) for (let j = 12; j >= 0; j--) {
      const cls = i === j ? R[i] + R[j] : i > j ? R[i] + R[j] + "s" : R[j] + R[i] + "o";
      const idx = P.CLASS_INDEX[cls];
      const eq = PREFLOP[idx][n - 1];
      cells += `<div data-cell="${idx}" class="${chartSel === idx ? "on" : ""}" style="background:${scale(eq, fair - 0.08, fair + 0.3)}" title="${cls} ${pct(eq)}">${cls.slice(0, 2)}</div>`;
    }
    let info = `<div class="muted" style="text-align:center;font-size:13px">Tap a hand${qm("chart")}</div>`;
    if (chartSel !== null) {
      const cls = P.CLASSES[chartSel];
      const top = root.Bots.PCT[chartSel];
      info = `<div style="text-align:center"><b style="font-size:18px">${cls}</b> · wins <b>${pct(PREFLOP[chartSel][n - 1])}</b> vs ${n} · top <b>${pct(top, 0)}</b> of hands${qm("chart")}
        <div class="subnums" style="justify-content:center;margin-top:4px">${PREFLOP[chartSel].map((e, k) => `<span>${k + 1}: <b>${(e * 100).toFixed(0)}%</b></span>`).join("")}</div></div>`;
    }
    el.innerHTML = `
      <div class="odds-wrap" style="grid-template-rows:auto 1fr">
        <div class="odds-top">
          <div><div class="bignum" style="font-size:26px">Starting hands</div><div class="subnums">vs ${n} random hand${n > 1 ? "s" : ""} · average share ${pct(fair, 0)}</div></div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <div class="seg" style="width:170px"><button data-mode="calc">Odds</button><button data-mode="chart" class="on">Chart</button></div>
            <div style="display:flex;align-items:center;gap:6px"><span class="label">Players</span>
            <div class="stepper"><button data-opp="-1" aria-label="Fewer opponents">−</button><b>${n}</b><button data-opp="1" aria-label="More opponents">+</button></div></div>
          </div>
        </div>
        <div class="chart-wrap scroll"><div class="hgrid">${cells}</div>${info}</div>
      </div>`;
  }

  function save() { UI.Store.save(); }

  root.OddsTab = { init, render };
})(this);
