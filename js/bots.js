/* ============================================================================
 * bots.js — the computer players and the hint.
 *
 *   Bots.decide(view, level, rng) -> { action, eq, potOdds, why }
 *
 * Bots only see what their seat may see (Engine.view), so they never peek.
 * Levels:
 *   easy   — plays lots of hands, calls too much, bets only big hands.
 *   medium — sound odds player: equity vs random hands against the price.
 *   hard   — reads opponents: narrows their likely hands from how they bet
 *            (raisers hold strong hands, bettors usually have a pair or a
 *            draw), plays by position, continuation-bets and semi-bluffs.
 * Their real strength is MEASURED by tools/measure.js (see progress.md).
 * ==========================================================================*/
(function (root) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? require("./poker.js") : root.Poker;
  const E = isNode ? require("./engine.js") : root.Engine;
  const PREFLOP = isNode ? require("./preflop.js") : root.PREFLOP;

  // Percentile of each starting-hand class (0 = AA, 1 = worst), weighting by
  // how many card combinations each class has (pair 6, suited 4, offsuit 12).
  const PCT = new Float64Array(169);
  (function () {
    const order = P.CLASSES.map((c, i) => i).sort((a, b) => PREFLOP[b][0] - PREFLOP[a][0]);
    const combos = (c) => (c.length === 2 ? 6 : c[2] === "s" ? 4 : 12);
    let acc = 0;
    for (const i of order) { acc += combos(P.CLASSES[i]); PCT[i] = acc / 1326; }
  })();
  const pctOf = (c1, c2) => PCT[P.CLASS_INDEX[P.handClass(c1, c2)]];

  const LEVELS = {
    easy:   { name: "Easy",   trials: 120 },
    medium: { name: "Medium", trials: 250 },
    hard:   { name: "Hard",   trials: 300 },
  };

  // ------------------------------------------------------------ reading
  /** What each live opponent's betting says about their hand (hard bots). */
  function readRanges(v, me) {
    const out = [];
    for (const p of v.seats) {
      if (p.i === me || p.folded) continue;
      let top = 1;                       // share of starting hands they could hold
      const aggro = [];                  // boards at which they bet or raised
      let board = [];
      for (const e of v.log) {
        if (e.seat === -1) { board = e.cards; continue; }
        if (e.seat !== p.i) continue;
        if (e.street === "preflop") {
          if (e.type === "raise") top = Math.min(top, e.betBefore > 0 && e.toCall > v.bb ? 0.07 : 0.18);
          else if (e.type === "call") top = Math.min(top, e.toCall > v.bb ? 0.3 : 0.55);
        } else if (e.type === "bet" || e.type === "raise") aggro.push(board.slice());
      }
      out.push({ seat: p.i, top, aggro });
    }
    return out;
  }

  /** Does this hand fit a bet on that board? Made pair+ or a real draw = yes, else sometimes (bluffs). */
  function fitsBet(hole, board, rand) {
    const cat = P.category(P.evaluate(hole, 2, board, board.length));
    if (cat >= 1) {
      // A pair that is only on the board doesn't count as "something".
      const bc = boardPairs(board);
      if (cat > bc) return true;
    }
    if (board.length < 5 && hasDraw(hole, board)) return rand() < 0.8;
    return rand() < 0.3;
  }
  function boardPairs(board) {
    const cnt = {};
    let best = 0;
    for (const c of board) { const r = c >> 2; cnt[r] = (cnt[r] || 0) + 1; }
    const vals = Object.values(cnt).sort((a, b) => b - a);
    if (vals[0] >= 3) best = 3; else if (vals[0] === 2 && vals[1] === 2) best = 2; else if (vals[0] === 2) best = 1;
    return best;
  }
  function hasDraw(hole, board) {
    const all = hole.concat(board);
    const suits = [0, 0, 0, 0];
    for (const c of all) suits[c & 3]++;
    for (let s = 0; s < 4; s++) {
      if (suits[s] >= 4 && ((hole[0] & 3) === s || (hole[1] & 3) === s)) return true; // flush draw using my card
    }
    let mask = 0;
    for (const c of all) mask |= 1 << (c >> 2);
    // bit 0 = ace-low, bits 1..13 = deuce..ace
    const m = (mask << 1) | ((mask >> 12) & 1);
    let holeBits = 0;
    for (const c of hole) holeBits |= 1 << ((c >> 2) + 1);
    if (hole.some((c) => (c >> 2) === 12)) holeBits |= 1;
    for (let lo = 0; lo <= 10; lo++) { // four ranks in a row that use one of my cards
      const run = 0xf << lo;
      if ((m & run) === run && (holeBits & run)) return true;
    }
    return false;
  }

  /**
   * Equity against opponents whose hands are sampled to fit what they did.
   * ranges: [{ top, aggro: [board,...] }] or numbers of random opponents.
   */
  function rangeEquity(hero, board, ranges, trials, rand) {
    const deck = P.remainingDeck(hero.concat(board));
    const need = 5 - board.length;
    const full = new Array(5);
    for (let i = 0; i < board.length; i++) full[i] = board[i];
    const opps = ranges.map(() => [0, 0]);
    let share = 0;
    const d = deck.slice();
    for (let t = 0; t < trials; t++) {
      // shuffle a prefix big enough for the board plus resamples
      let pos = 0;
      const take = () => {
        const j = pos + Math.floor(rand() * (d.length - pos));
        const tmp = d[pos]; d[pos] = d[j]; d[j] = tmp;
        return d[pos++];
      };
      for (let o = 0; o < ranges.length; o++) {
        const R = ranges[o];
        let a, b, tries = 0;
        while (true) {
          const save = pos;
          a = take(); b = take();
          if (tries++ > 25) break;
          if (R.top < 1 && pctOf(a, b) > R.top) { pos = save; continue; }
          let fits = true;
          for (const bd of R.aggro || []) if (!fitsBet([a, b], bd, rand)) { fits = false; break; }
          if (fits) break;
          pos = save;
        }
        opps[o][0] = a; opps[o][1] = b;
      }
      for (let i = board.length; i < 5; i++) full[i] = take();
      const h = P.evaluate(hero, 2, full, 5);
      let best = h, ties = 1, lost = false;
      for (const o of opps) {
        const sc = P.evaluate(o, 2, full, 5);
        if (sc > h) { lost = true; break; }
        if (sc === h) ties++;
      }
      void best;
      if (!lost) share += 1 / ties;
    }
    return share / trials;
  }

  // ------------------------------------------------------------ helpers
  function seatPos(v, me) {
    // 0 = first to act preflop .. 1 = last (big blind). The button sits just before the blinds.
    const n = v.seats.length;
    const order = [];
    for (let k = 1; k <= n; k++) {
      const i = (v.bbSeat + k) % n;
      if (v.seats[i].hole.length) order.push(i);
    }
    const k = order.indexOf(me);
    if (order.length <= 2) return 1;
    // blinds act last preflop but are out of position after: treat them like the cut-off
    if (me === v.sbSeat || me === v.bbSeat) return 0.75;
    return k / Math.max(1, order.length - 3);
  }

  function sizeTo(L, v, frac, me) {
    // bet/raise to (current bet + frac * pot after calling)
    const pot = L.pot + L.toCall;
    let to = v.currentBet + Math.round(frac * pot);
    if (v.currentBet === 0) to = Math.round(frac * L.pot);
    to = Math.max(L.minTo, Math.min(L.maxTo, to));
    // Round to the big blind so bets look like a person's (unless all-in).
    const allIn = L.bet + L.stack;
    if (to !== allIn && to !== L.maxTo) to = Math.max(L.minTo, Math.round(to / v.bb) * v.bb);
    // Committing most of the stack anyway? Just go all in (if allowed).
    if (to > 0.7 * allIn && L.maxTo >= allIn) to = allIn;
    void me;
    return to;
  }

  function act(type, to) { return to === undefined ? { type } : { type, to }; }

  // ------------------------------------------------------------ decide
  function decide(v, level, rand) {
    level = LEVELS[level] ? level : "medium";
    rand = rand || Math.random;
    const me = v.toAct;
    const L = E.legal(v);
    const p = v.seats[me];
    const hole = p.hole;
    const opps = v.seats.filter((q) => q.i !== me && !q.folded);
    const n = opps.length;
    const potOdds = L.toCall > 0 ? L.callAmount / (L.pot + L.callAmount) : 0;
    const pre = v.street === "preflop";
    const pct = pctOf(hole[0], hole[1]);
    const bb = v.bb;

    let eq;
    if (level === "hard" && (!pre || L.toCall > bb)) {
      eq = rangeEquity(hole, v.board, readRanges(v, me), LEVELS.hard.trials, rand);
    } else if (pre) {
      eq = PREFLOP[P.CLASS_INDEX[P.handClass(hole[0], hole[1])]][Math.min(8, Math.max(1, n)) - 1];
    } else {
      eq = rangeEquity(hole, v.board, opps.map(() => ({ top: 1 })), LEVELS[level].trials, rand);
    }
    const fair = 1 / (n + 1);               // an average hand's share
    const callOr = () => (L.toCall === 0 ? act("check") : act("call"));
    const foldOr = () => (L.toCall === 0 ? act("check") : act("fold"));
    const raise = (frac) => (L.canRaise ? act("raise", sizeTo(L, v, frac, me)) : callOr());
    const out = (a, why) => ({ action: a, eq, potOdds, why });
    const spr = p.stack / Math.max(1, L.pot);

    // ------------------------------------------------------------ EASY
    if (level === "easy") {
      if (pre) {
        if (pct <= 0.04 && rand() < 0.6) return out(raise(0.8), "Big pair — raise");
        if (L.toCall <= 4 * bb && pct <= 0.65) return out(callOr(), "Wants to see a flop");
        if (pct <= 0.12 || L.toCall === 0) return out(callOr(), "Good hand — call");
        return out(foldOr(), "Weak hand");
      }
      if (eq > 0.8 && rand() < 0.7) return out(raise(0.4), "Very strong — bet");
      if (L.toCall === 0) return out(eq > 0.6 && rand() < 0.4 ? raise(0.33) : act("check"), "Check");
      if (eq >= potOdds * 0.6 || rand() < 0.2) return out(act("call"), "Calls to see");
      return out(act("fold"), "Gives up");
    }

    // ------------------------------------------------------------ MEDIUM
    if (level === "medium") {
      if (pre) {
        const facingRaise = L.toCall > bb || (L.toCall > 0 && v.currentBet > bb);
        if (pct <= 0.03) return out(raise(1), "Premium hand — raise");
        if (!facingRaise && pct <= 0.2) return out(raise(1), "Strong hand — raise");
        if (facingRaise && pct <= 0.1 && L.toCall <= p.stack * 0.25) return out(act("call"), "Good enough to call");
        if (!facingRaise && pct <= 0.35) return out(callOr(), "Playable — call");
        if (L.toCall === 0) return out(act("check"), "Free look");
        if (eq > potOdds + 0.05 && L.toCall <= 2 * bb && pct <= 0.5) return out(act("call"), "Cheap enough");
        return out(act("fold"), "Not worth the price");
      }
      if (eq >= Math.max(0.7, fair + 0.35)) return out(raise(0.6), "Strong — bet for value");
      if (L.toCall === 0) return out(eq >= Math.max(0.55, fair + 0.2) ? raise(0.5) : act("check"), "Bet or check by strength");
      if (eq >= potOdds + 0.04) return out(act("call"), "Odds say call");
      return out(act("fold"), "Odds say fold");
    }

    // ------------------------------------------------------------ HARD
    const pos = seatPos(v, me);                  // 0 early .. 1 button
    if (pre) {
      const raisers = v.log.filter((e) => e.street === "preflop" && e.type === "raise").length;
      if (raisers === 0) {
        const limpers = opps.filter((q) => q.bet >= bb && q.i !== v.bbSeat).length;
        const openPct = 0.17 + 0.3 * pos + 0.04 * limpers; // ~17% early .. ~47% on the button; wider to punish limpers
        if (pct <= openPct) return out(raise(0.75 + 0.15 * opps.filter((q) => q.bet >= bb).length), "Raise first in from this seat");
        if (L.toCall === 0) return out(act("check"), "Free look");
        if (me === v.sbSeat && pct <= 0.5 && L.toCall <= bb) return out(act("call"), "Cheap from the small blind");
        return out(act("fold"), "Too weak for this seat");
      }
      // facing a raise: eq here is against the raiser's likely hands
      const needed = potOdds + (spr > 8 ? -0.04 : 0.02); // deep stacks: pairs/suited hands can call a bit lighter
      if (pct <= 0.025 || (eq >= 0.6 && pct <= 0.06)) return out(raise(1), "Re-raise: ahead of their range");
      if (raisers === 1 && pct > 0.3 && pct <= 0.4 && pos > 0.7 && rand() < 0.08) return out(raise(1), "Occasional re-raise bluff");
      if (eq >= needed && pct <= 0.32) return out(callOr(), "Price is right vs their range");
      return out(foldOr(), "Behind their range");
    }
    const streetLeft = v.street === "flop" ? 2 : v.street === "turn" ? 1 : 0;
    const draw = streetLeft > 0 && hasDraw(hole, v.board);
    const iRaisedPre = v.log.some((e) => e.street === "preflop" && e.seat === me && e.type === "raise");
    const lastPreRaiser = (() => { const r = v.log.filter((e) => e.street === "preflop" && e.type === "raise"); return r.length ? r[r.length - 1].seat : -1; })();
    if (L.toCall === 0) {
      if (eq >= Math.max(0.56, fair + 0.26)) return out(raise(eq > 0.8 ? 0.85 : 0.7), "Value bet");
      if (draw && rand() < 0.55) return out(raise(0.5), "Semi-bluff with a draw");
      if (iRaisedPre && lastPreRaiser === me && v.street === "flop" && n <= 2 && rand() < 0.6) return out(raise(0.4), "Continuation bet");
      if (n === 1 && v.street === "river" && eq < 0.25 && pos > 0.6 && rand() < 0.18) return out(raise(0.6), "River bluff");
      return out(act("check"), "Check");
    }
    // facing a bet
    const implied = draw && streetLeft === 2 && spr > 3 ? 0.06 : draw ? 0.03 : 0;
    if (eq >= 0.72 || (eq >= 0.62 && n === 1 && spr < 3)) return out(raise(0.9), "Raise for value");
    if (draw && eq >= potOdds - implied && rand() < 0.15 && L.canRaise) return out(raise(0.8), "Semi-bluff raise");
    if (eq + implied >= potOdds + 0.02) return out(act("call"), "Odds justify a call");
    return out(act("fold"), "Behind what they bet with");
  }

  // ------------------------------------------------------------ hint (for the human)
  /** The hard bot's choice for the human's seat, in plain words. */
  function hint(v, rand) {
    const r = decide(v, "hard", rand || P.rng32(v.hand * 7 + v.log.length));
    const L = E.legal(v);
    const a = r.action;
    let label = a.type === "raise" ? (v.currentBet === 0 ? "Bet " + a.to : "Raise to " + a.to)
      : a.type === "call" ? "Call " + L.callAmount : a.type === "check" ? "Check" : "Fold";
    if (a.type === "raise" && a.to === L.bet + L.stack) label = "All in";
    return { label, action: a, eq: r.eq, potOdds: r.potOdds, why: r.why };
  }

  const api = { decide, hint, rangeEquity, readRanges, pctOf, LEVELS, PCT };
  if (isNode) module.exports = api;
  else root.Bots = api;
})(typeof self !== "undefined" ? self : this);
