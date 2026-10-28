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

  // ------------------------------------------------------------ other game types
  /* Every level plays every game type with the same logic; only the hand-strength inputs change:
     pct (0 = best starting hand .. 1 = worst) and the hand scorer. */
  const gameOf = (v) => (v.cfg && v.cfg.game) || "holdem";
  const memo = {};
  /** Short deck: heads-up all-in equity of each 2-card class against a random hand, measured once. */
  function shortPct() {
    if (memo.short) return memo.short;
    const rand = P.rng32(2024), deck = P.deckFor("short");
    const classes = {};
    for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) {
      const k = P.handClass(deck[i], deck[j]);
      (classes[k] = classes[k] || []).push([deck[i], deck[j]]);
    }
    const eqs = Object.keys(classes).map((k) => [k, P.equityFor("short", { hero: classes[k][0], opponents: 1, trials: 700, rng: rand }).equity, classes[k].length]);
    eqs.sort((a, b) => b[1] - a[1]);
    const total = eqs.reduce((a, e) => a + e[2], 0);
    const out = {};
    let acc = 0;
    for (const [k, , n] of eqs) { acc += n; out[k] = acc / total; }
    return (memo.short = out);
  }
  /** A quick strength number for 3- and 4-card hands (lower = better): Pineapple keeps its best two-card
   *  Hold'em hand; Omaha's six two-card pairs all work together, so the best three of them count. */
  function rawMulti(hole) {
    const ps = [];
    for (let i = 0; i < hole.length; i++) for (let j = i + 1; j < hole.length; j++) ps.push(pctOf(hole[i], hole[j]));
    ps.sort((a, b) => a - b);
    if (hole.length === 3) return ps[0] - 0.04 * (1 - ps[1]);
    // Omaha: the best three pairs; three or four of a rank wastes cards
    const r = hole.map((c) => c >> 2), same = Math.max(...r.map((x) => r.filter((y) => y === x).length));
    return (ps[0] + ps[1] + ps[2]) / 3 + (same >= 3 ? 0.25 : 0);
  }
  /** Percentile of rawMulti among random hands of that size (sampled once). */
  function multiTable(k) {
    if (memo[k]) return memo[k];
    const rand = P.rng32(99 + k), d = P.deckFor("holdem"), out = new Float64Array(6000);
    for (let t = 0; t < out.length; t++) {
      for (let i = 0; i < k; i++) { const j = i + Math.floor(rand() * (52 - i)); const x = d[i]; d[i] = d[j]; d[j] = x; }
      out[t] = rawMulti(d.slice(0, k));
    }
    out.sort();
    return (memo[k] = out);
  }
  /** Starting-hand percentile (0 = best) for any game type and any number of hole cards. */
  function pctHand(hole, game) {
    if (hole.length === 2) return game === "short" ? shortPct()[P.handClass(hole[0], hole[1])] : pctOf(hole[0], hole[1]);
    const t = multiTable(hole.length), x = rawMulti(hole);
    let lo = 0, hi = t.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < x) lo = m + 1; else hi = m; }
    return lo / t.length;
  }
  /** Which card to throw away (Pineapple / Crazy Pineapple). */
  function chooseDiscard(v, level, rand) {
    const me = v.toAct, hole = v.seats[me].hole, game = gameOf(v);
    const keep = (k) => hole.filter((c, j) => j !== k);
    let best = 0, bestV = -Infinity;
    for (let k = 0; k < hole.length; k++) {
      const h = keep(k);
      let val;
      if (level === "easy") val = v.board.length >= 3 ? P.score(game, h, v.board) : (h[0] >> 2) + (h[1] >> 2); // keeps big cards / the made hand
      else if (v.board.length < 3) val = -pctOf(h[0], h[1]);
      else {
        const n = Math.max(1, v.seats.filter((q) => q.i !== me && !q.folded).length);
        val = P.equity({ hero: h, board: v.board, dead: [hole[k]], opponents: n, trials: level === "hard" ? 500 : 250, rng: rand, forceMC: true }).equity;
      }
      if (val > bestV) { bestV = val; best = k; }
    }
    return { action: { type: "discard", card: hole[best] }, eq: 0, potOdds: 0, why: "Keeps the best two" };
  }

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
  function fitsBet(hole, board, rand, game) {
    const cat = board.length >= 3 ? P.stdCategory(P.score(game, hole, board), game) : 0;
    if (cat >= 1) {
      // A pair that is only on the board doesn't count as "something".
      const bc = boardPairs(board);
      if (cat > bc) return true;
    }
    if (board.length < 5 && hasDraw(hole, board, game)) return rand() < 0.8;
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
  function hasDraw(hole, board, game) {
    if (game === "omaha") return omahaDraw(hole, board);
    const all = hole.concat(board);
    const suits = [0, 0, 0, 0];
    for (const c of all) suits[c & 3]++;
    for (let s = 0; s < 4; s++) {
      if (suits[s] >= 4 && hole.some((c) => (c & 3) === s)) return true; // flush draw using my card
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

  /** Omaha draws must use exactly two hole cards: two of the suit in hand plus two on the board,
   *  or a four-rank run made of two hole ranks and two board ranks. */
  function omahaDraw(hole, board) {
    for (let s = 0; s < 4; s++) {
      if (hole.filter((c) => (c & 3) === s).length >= 2 && board.filter((c) => (c & 3) === s).length === 2) return true;
    }
    const bits = (cs) => { let m = 0; for (const c of cs) { m |= 1 << ((c >> 2) + 1); if ((c >> 2) === 12) m |= 1; } return m; };
    const hb = bits(hole), bb = bits(board);
    const count = (x) => { let k = 0; while (x) { k += x & 1; x >>= 1; } return k; };
    for (let lo = 0; lo <= 10; lo++) {
      const run = 0xf << lo;
      const fromBoard = count(bb & run);
      if (fromBoard === 2 && count(hb & run & ~bb) >= 2) return true;
    }
    return false;
  }

  /**
   * Equity against opponents whose hands are sampled to fit what they did.
   * ranges: [{ top, aggro: [board,...] }] or numbers of random opponents.
   */
  function rangeEquity(hero, board, ranges, trials, rand, game) {
    game = game || "holdem";
    const K = hero.length;
    const taken = new Set(hero.concat(board));
    const deck = game === "holdem" ? P.remainingDeck(hero.concat(board)) : P.deckFor(game).filter((c) => !taken.has(c));
    const need = 5 - board.length;
    const full = new Array(5);
    for (let i = 0; i < board.length; i++) full[i] = board[i];
    const opps = ranges.map(() => new Array(K));
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
        const h = opps[o];
        let tries = 0;
        while (true) {
          const save = pos;
          for (let m = 0; m < K; m++) h[m] = take();
          if (tries++ > 25) break;
          if (R.top < 1 && (K === 2 && game !== "short" ? pctOf(h[0], h[1]) : pctHand(h, game)) > R.top) { pos = save; continue; }
          let fits = true;
          for (const bd of R.aggro || []) if (!fitsBet(h, bd, rand, game)) { fits = false; break; }
          if (fits) break;
          pos = save;
        }
      }
      for (let i = board.length; i < 5; i++) full[i] = take();
      const h = P.score(game, hero, full);
      let best = h, ties = 1, lost = false;
      for (const o of opps) {
        const sc = P.score(game, o, full);
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
    if (L.discard) return chooseDiscard(v, level, rand);
    const game = gameOf(v);
    const p = v.seats[me];
    const hole = p.hole;
    const opps = v.seats.filter((q) => q.i !== me && !q.folded);
    const n = opps.length;
    const potOdds = L.toCall > 0 ? L.callAmount / (L.pot + L.callAmount) : 0;
    const pre = v.street === "preflop";
    const pct = game === "holdem" && hole.length === 2 ? pctOf(hole[0], hole[1]) : pctHand(hole, game);
    const bb = v.bb;

    let eq;
    if (level === "hard" && (!pre || L.toCall > bb)) {
      eq = rangeEquity(hole, v.board, readRanges(v, me), LEVELS.hard.trials, rand, game);
    } else if (pre && game === "holdem") {
      eq = PREFLOP[P.CLASS_INDEX[P.handClass(hole[0], hole[1])]][Math.min(8, Math.max(1, n)) - 1];
    } else {
      eq = rangeEquity(hole, v.board, opps.map(() => ({ top: 1 })), LEVELS[level].trials, rand, game);
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
    const omaha = game === "omaha";
    if (v.cfg && v.cfg.betting === "fl") return out(...hardLimit(v, L, p, me, opps, eq, potOdds, pct, rand, pos));
    if (pre) {
      const raisers = v.log.filter((e) => e.street === "preflop" && e.type === "raise").length;
      if (raisers === 0) {
        const limpers = opps.filter((q) => q.bet >= bb && q.i !== v.bbSeat).length;
        const openPct = 0.17 + 0.3 * pos + 0.04 * limpers; // ~17% early .. ~47% on the button; wider to punish limpers
        if (pct <= openPct) return out(raise(0.75 + 0.15 * opps.filter((q) => q.bet >= bb).length), "Raise first in from this seat");
        if (L.toCall === 0) return out(act("check"), "Free look");
        if (me === v.sbSeat && pct <= (omaha ? 0.85 : 0.5) && L.toCall <= bb) return out(act("call"), "Cheap from the small blind");
        return out(act("fold"), "Too weak for this seat");
      }
      // facing a raise: eq here is against the raiser's likely hands
      const needed = potOdds + (spr > 8 ? -0.04 : 0.02); // deep stacks: pairs/suited hands can call a bit lighter
      if (pct <= 0.025 || (eq >= 0.6 && pct <= 0.06)) return out(raise(1), "Re-raise: ahead of their range");
      if (raisers === 1 && pct > 0.3 && pct <= 0.4 && pos > 0.7 && rand() < 0.08) return out(raise(1), "Occasional re-raise bluff");
      if ((omaha && pct <= 0.8 && L.toCall <= 0.3 * p.stack) || eq >= needed && pct <= (omaha ? 0.6 : 0.32)) return out(callOr(), "Price is right vs their range"); // Omaha hands run close: defend wider
      return out(foldOr(), "Behind their range");
    }
    const streetLeft = v.street === "flop" ? 2 : v.street === "turn" ? 1 : 0;
    const draw = streetLeft > 0 && hasDraw(hole, v.board, game);
    const iRaisedPre = v.log.some((e) => e.street === "preflop" && e.seat === me && e.type === "raise");
    const lastPreRaiser = (() => { const r = v.log.filter((e) => e.street === "preflop" && e.type === "raise"); return r.length ? r[r.length - 1].seat : -1; })();
    if (L.toCall === 0) {
      if (eq >= Math.max(omaha ? 0.52 : 0.56, fair + 0.26)) return out(raise(eq > 0.8 ? 0.85 : 0.7), "Value bet");
      if (draw && rand() < (omaha ? 0.25 : 0.55)) return out(raise(0.5), "Semi-bluff with a draw");
      if (!omaha && iRaisedPre && lastPreRaiser === me && v.street === "flop" && n <= 2 && rand() < 0.6) return out(raise(0.4), "Continuation bet");
 if (!omaha && n === 1 && v.street === "river" && eq < 0.25 && pos > 0.6 && rand() < 0.18) return out(raise(0.6), "River bluff");
      return out(act("check"), "Check");
    }
    // facing a bet
    const implied = draw && streetLeft === 2 && spr > 3 ? 0.06 : draw ? 0.03 : 0;
    if (eq >= 0.72 || (eq >= 0.62 && n === 1 && spr < 3)) return out(raise(0.9), "Raise for value");
    if (draw && eq >= potOdds - implied && rand() < 0.15 && L.canRaise) return out(raise(0.8), "Semi-bluff raise");
    if (eq + implied >= potOdds + 0.02) return out(act("call"), "Odds justify a call");
    return out(act("fold"), "Behind what they bet with");
  }

  // ------------------------------------------------------------ HARD, fixed limit
  /** Limit poker rewards a different style: every bet is small next to the pot, so folding a hand
   *  that might be best costs more than calling, thin value bets pay, and heads-up you raise most hands.
   *  Returns [action, why]. */
  function hardLimit(v, L, p, me, opps, eq, potOdds, pct, rand, pos) {
    const n = opps.length;
    const bb = v.bb;
    const hu = v.seats.filter((q) => q.hole.length).length === 2;
    const fair = 1 / (n + 1);
    const callOr = () => (L.toCall === 0 ? act("check") : act("call"));
    const foldOr = () => (L.toCall === 0 ? act("check") : act("fold"));
    const raise = () => (L.canRaise ? act("raise", L.minTo) : callOr());
    if (v.street === "preflop") {
      const raisers = v.log.filter((e) => e.street === "preflop" && e.type === "raise").length;
      if (raisers === 0) {
        const limpers = opps.filter((q) => q.bet >= bb && q.i !== v.bbSeat).length;
        const openPct = hu ? (me === v.bbSeat ? 0.38 : 0.82) : 0.16 + 0.3 * pos + 0.05 * limpers;
        if (pct <= openPct) return [raise(), "Raise first in from this seat"];
        if (L.toCall === 0) return [act("check"), "Free look"];
        if (me === v.sbSeat && pct <= (hu ? 0.9 : 0.55)) return [act("call"), "Cheap from the small blind"];
        return [act("fold"), "Too weak for this seat"];
      }
      const reraise = hu ? (raisers === 1 ? 0.2 : 0.1) : raisers === 1 ? 0.07 : 0.035;
      if (pct <= reraise) return [raise(), "Re-raise: ahead of their range"];
      const defend = hu ? (raisers === 1 ? 0.72 : 0.4) : me === v.bbSeat && raisers === 1 ? 0.45 : raisers === 1 ? 0.24 : 0.12;
      if (pct <= defend || eq >= potOdds + 0.03) return [callOr(), "Price is right vs their range"];
      return [foldOr(), "Behind their range"];
    }
    const streetLeft = v.street === "flop" ? 2 : v.street === "turn" ? 1 : 0;
    const draw = streetLeft > 0 && hasDraw(p.hole, v.board, gameOf(v));
    const preRaiser = (() => { const r = v.log.filter((e) => e.street === "preflop" && e.type === "raise"); return r.length ? r[r.length - 1].seat : -1; })();
    if (L.toCall === 0) {
      if (eq >= (n === 1 ? 0.52 : Math.max(0.5, fair + 0.22))) return [raise(), "Value bet"];
      if (draw && rand() < 0.6) return [raise(), "Semi-bluff with a draw"];
      if (preRaiser === me && v.street === "flop" && n <= 2 && rand() < (n === 1 ? 0.7 : 0.45)) return [raise(), "Continuation bet"];
      return [act("check"), "Check"];
    }
    // facing a bet: limit pots lay a big price, so call down lighter (implied odds for draws on the flop)
    const implied = draw ? (streetLeft === 2 ? 0.05 : 0.02) : 0;
    if (eq >= (n === 1 ? 0.64 : 0.72)) return [raise(), "Raise for value"];
    if (draw && streetLeft === 2 && n === 1 && rand() < 0.3 && L.canRaise) return [raise(), "Semi-bluff raise"];
    if (eq + implied >= potOdds - (n === 1 ? 0.04 : 0.01)) return [act("call"), "Odds justify a call"];
    return [act("fold"), "Behind what they bet with"];
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

  const api = { decide, hint, rangeEquity, readRanges, pctOf, pctHand, LEVELS, PCT };
  if (isNode) module.exports = api;
  else root.Bots = api;
})(typeof self !== "undefined" ? self : this);
