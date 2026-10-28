/* ============================================================================
 * engine.js — the Texas Hold'em table as a pure state machine.
 *
 *   newGame(config, players)  -> state
 *   apply(state, action)      -> new state (never mutates the input; throws on
 *                                an illegal action with err.code = "illegal")
 *   view(state, seat)         -> copy with the deck and other players' hidden
 *                                cards removed (what that seat may see)
 *   legal(state)              -> what the player to act may do
 *
 * The same functions run for local play, computer seats and (later) online
 * seats, so every seat type is interchangeable.
 *
 * Variants (config):
 *   betting: "nl" no-limit | "pl" pot-limit | "fl" fixed-limit
 *   format:  "cash" (blinds fixed, rebuys) | "tourney" (blinds rise, last one standing)
 *   ante:    0 or an amount; anteType "each" (everyone) | "bb" (big blind pays one ante for the table)
 *   game:    "holdem" (default) | "short" (6+: 36 cards, flush beats full house) | "pineapple" (3 cards,
 *            discard one before the flop) | "crazy" (3 cards, discard one before the turn) | "omaha"
 *            (4 cards, exactly two used). While s.discard is true each live player with 3 cards
 *            throws one away ({ type: "discard", card }), starting left of the button.
 * Rules followed are listed with sources in docs/rules-check.md.
 * ==========================================================================*/
(function (root) {
  "use strict";
  const P = (typeof module !== "undefined" && module.exports) ? require("./poker.js") : root.Poker;

  /** Default blind levels (small / big / ante), used by tournaments and the home timer. */
  const LEVELS = [
    [10, 20, 0], [15, 30, 0], [25, 50, 0], [50, 100, 0], [75, 150, 0],
    [100, 200, 0], [150, 300, 0], [200, 400, 0], [300, 600, 0], [400, 800, 0],
    [500, 1000, 0], [700, 1400, 0], [1000, 2000, 0], [1500, 3000, 0], [2000, 4000, 0],
    [3000, 6000, 0], [5000, 10000, 0],
  ];

  const STREETS = ["preflop", "flop", "turn", "river"];

  function defaults(cfg) {
    return Object.assign({
      game: "holdem", betting: "nl", format: "cash", sb: 10, bb: 20, ante: 0, anteType: "each",
      startStack: 2000, levelHands: 10, anteFromLevel: 4, seed: 1,
    }, cfg || {});
  }

  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  function illegal(msg) { const e = new Error(msg); e.code = "illegal"; throw e; }

  /**
   * players: [{ name, kind: "human" | "bot" | "online", level?, uid? }]
   */
  function newGame(config, players) {
    const cfg = defaults(config);
    return {
      v: 1, cfg,
      seats: players.map((p, i) => ({
        i, name: p.name, kind: p.kind || "bot", level: p.level || null, uid: p.uid || null,
        stack: cfg.startStack, buyIns: 1, out: false, place: 0,
        hole: [], folded: true, allIn: false, bet: 0, total: 0, acted: false, actedAt: -1,
      })),
      hand: 0, button: -1, street: "idle", board: [], deck: [],
      toAct: -1, currentBet: 0, minRaise: cfg.bb, bets: 0, lastAggressor: -1,
      sb: cfg.sb, bb: cfg.bb, ante: cfg.ante, level: 0,
      log: [], result: null, over: false, winner: -1, nextPlace: players.length,
    };
  }

  // ---------------------------------------------------------- helpers
  const live = (s, i) => !s.seats[i].folded;
  const canAct = (s, i) => !s.seats[i].folded && !s.seats[i].allIn;
  const inHand = (s) => s.seats.filter((p) => !p.folded);
  const potTotal = (s) => s.seats.reduce((a, p) => a + p.total, 0);

  function nextSeat(s, from, pred) {
    const n = s.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (pred(i)) return i;
    }
    return -1;
  }

  function blindsFor(s) {
    const c = s.cfg;
    if (c.format !== "tourney") return { sb: c.sb, bb: c.bb, ante: c.ante, level: 0 };
    const lv = Math.min(Math.floor(s.hand / Math.max(1, c.levelHands)), (c.levels || LEVELS).length - 1);
    const L = (c.levels || LEVELS)[lv];
    // Scale the default structure to the table's starting blinds.
    const k = c.bb / LEVELS[0][1];
    let ante = 0;
    if (c.ante > 0 && lv + 1 >= c.anteFromLevel) {
      ante = c.anteType === "bb" ? Math.round(L[1] * k) : Math.max(1, Math.round(L[1] * k / 10));
    }
    return { sb: Math.round(L[0] * k), bb: Math.round(L[1] * k), ante, level: lv };
  }

  /** Put chips in for seat i (capped at the stack). Returns the amount moved. */
  function putIn(s, i, amount, intoBet) {
    const p = s.seats[i];
    const a = Math.max(0, Math.min(amount, p.stack));
    p.stack -= a; p.total += a;
    if (intoBet) p.bet += a;
    if (p.stack === 0) p.allIn = true;
    return a;
  }

  function logAct(s, seat, type, extra) {
    s.log.push(Object.assign({ seat, street: s.street, type }, extra || {}));
  }

  // ---------------------------------------------------------- the deal
  function startHand(s) {
    const n = s.seats.length;
    const alive = s.seats.filter((p) => !p.out && p.stack > 0);
    if (alive.length < 2) illegal("Need at least two players with chips");
    for (const p of s.seats) {
      p.hole = []; p.discards = []; p.bet = 0; p.total = 0; p.allIn = false; p.acted = false; p.actedAt = -1;
      p.folded = p.out || p.stack <= 0;
    }
    const inGame = (i) => !s.seats[i].folded;
    s.button = s.button < 0 ? nextSeat(s, (s.cfg.seed >>> 0) % n - 1 + n, inGame) : nextSeat(s, s.button, inGame);
    const B = blindsFor(s);
    s.sb = B.sb; s.bb = B.bb; s.ante = B.ante; s.level = B.level;
    s.street = "preflop"; s.board = []; s.log = []; s.result = null; s.discard = false;
    s.currentBet = 0; s.minRaise = s.bb; s.bets = 0; s.capped = false; s.lastAggressor = -1;

    // Shuffle a fresh deck from (seed, hand): replayable, same for every viewer.
    const rand = P.rng32((s.cfg.seed * 2654435761 + s.hand * 40503 + 17) >>> 0);
    const deck = P.deckFor(s.cfg.game);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    s.deck = deck;

    const players = s.seats.filter((p) => !p.folded).length;
    const headsUp = players === 2;
    // Going heads-up: nobody posts the big blind twice in a row (TDA 36-C), so
    // the player who was just the big blind takes the button / small blind.
    if (headsUp && s.bbSeat !== undefined && s.bbSeat >= 0 && inGame(s.bbSeat) && nextSeat(s, s.button, inGame) === s.bbSeat) {
      s.button = s.bbSeat;
    }
    const sbSeat = headsUp ? s.button : nextSeat(s, s.button, inGame);
    const bbSeat = nextSeat(s, sbSeat, inGame);
    s.sbSeat = sbSeat; s.bbSeat = bbSeat;

    // Blinds first (they have priority over antes when a player is short).
    const sbAmt = putIn(s, sbSeat, s.sb, true);
    logAct(s, sbSeat, "sb", { amount: sbAmt });
    const bbAmt = putIn(s, bbSeat, s.bb, true);
    logAct(s, bbSeat, "bb", { amount: bbAmt });
    if (s.ante > 0) {
      if (s.cfg.anteType === "bb") {
        const a = putIn(s, bbSeat, s.ante, false);
        if (a) logAct(s, bbSeat, "ante", { amount: a });
      } else {
        for (let i = 0; i < n; i++) if (inGame(i) && s.seats[i].stack > 0) {
          const a = putIn(s, i, s.ante, false);
          logAct(s, i, "ante", { amount: a });
        }
      }
    }
    // Others must match the full big blind even if the big blind is short.
    s.currentBet = s.bb;
    s.minRaise = s.bb;
    s.bets = 1;

    // Two cards each (three in Pineapple, four in Omaha), one at a time, starting left of the button.
    let k = 0;
    for (let r = 0; r < P.holeCount(s.cfg.game); r++) {
      let i = s.button;
      for (let c = 0; c < players; c++) {
        i = nextSeat(s, i, inGame);
        s.seats[i].hole.push(s.deck[k++]);
      }
    }
    s.deck = s.deck.slice(k);

    // First to act preflop: left of the big blind (heads-up: the button/small blind).
    s.toAct = -1;
    const first = nextSeat(s, bbSeat, (i) => canAct(s, i));
    s.toAct = first;
    if (!needsAction(s)) advance(s);
    return s;
  }

  // ---------------------------------------------------------- legality
  function betUnit(s) {
    // Fixed limit: small bet (= big blind) preflop and flop, big bet (2x) turn and river.
    return s.street === "turn" || s.street === "river" ? s.bb * 2 : s.bb;
  }

  /** What the player to act may do. */
  function legal(s) {
    if (s.toAct < 0 || s.street === "idle" || s.street === "done") return null;
    const p = s.seats[s.toAct];
    if (s.discard) return { seat: s.toAct, discard: true, cards: p.hole.slice(), toCall: 0, callAmount: 0, canCheck: false, canRaise: false, minTo: 0, maxTo: 0, isBet: false, pot: potTotal(s), stack: p.stack, bet: p.bet };
    const toCall = Math.max(0, s.currentBet - p.bet);
    const callAmt = Math.min(toCall, p.stack);
    const out = {
      seat: s.toAct, toCall, callAmount: callAmt, canCheck: toCall === 0,
      canRaise: false, minTo: 0, maxTo: 0, isBet: s.currentBet === 0,
      pot: potTotal(s), stack: p.stack, bet: p.bet,
    };
    // May this player raise at all? Not if a short all-in didn't reopen the betting for them.
    const reopened = !p.acted || (s.currentBet - p.actedAt) >= reopenSize(s);
    const othersCanCall = s.seats.some((q, i) => i !== s.toAct && canAct(s, i));
    if (p.stack > toCall && reopened && othersCanCall) {
      const bt = s.cfg.betting;
      if (bt === "fl") {
        if (s.bets < 4 || capLifted(s)) {
          const to = s.currentBet + betUnit(s);
          out.canRaise = true;
          out.minTo = Math.min(to, p.bet + p.stack);
          out.maxTo = out.minTo;
        }
      } else {
        const minTo = s.currentBet === 0 ? s.bb : s.currentBet + s.minRaise;
        let maxTo = p.bet + p.stack;
        if (bt === "pl") {
          const potAfterCall = potTotal(s) + toCall;
          maxTo = Math.min(maxTo, s.currentBet + potAfterCall);
        }
        out.canRaise = true;
        out.minTo = Math.min(minTo, p.bet + p.stack); // short stack: all-in only
        out.maxTo = Math.max(out.minTo, maxTo);
      }
    }
    return out;
  }

  /**
   * Fixed limit: a bet and three raises, except
   *  cash: no cap once fewer than three players who aren't all in remain, unless
   *        the round was already capped (Robert's Rules, Betting #3-4);
   *  tournament: the cap holds even heads-up until only two players are left in
   *        the whole event (TDA rule 50, Robert's Rules Tournaments #22).
   */
  function capLifted(s) {
    if (s.cfg.format === "tourney") return s.seats.filter((p) => !p.out).length === 2;
    if (s.capped) return false;
    return s.seats.filter((p, i) => canAct(s, i)).length < 3;
  }

  function reopenSize(s) {
    // Limit: an all-in of at least half a bet reopens (Robert's Rules). Big-bet: a full raise.
    return s.cfg.betting === "fl" ? Math.ceil(betUnit(s) / 2) : s.minRaise;
  }

  function needsAction(s) {
    const able = s.seats.filter((p, i) => canAct(s, i));
    if (inHand(s).length < 2) return false;
    if (able.length === 0) return false;
    if (able.length === 1) {
      // Lone player who can still act only needs to if facing a bet.
      return able[0].bet < s.currentBet;
    }
    return able.some((p) => !p.acted || p.bet < s.currentBet);
  }

  // ---------------------------------------------------------- actions
  function act(s, a) {
    const L = legal(s);
    if (!L) illegal("No hand in progress");
    if (a.seat !== undefined && a.seat !== s.toAct) illegal("Not your turn");
    const i = s.toAct, p = s.seats[i];
    let type = a.type;
    if (s.discard || type === "discard") {
      if (!s.discard) illegal("Nothing to discard now");
      if (type !== "discard") illegal("Discard a card first");
      const k = p.hole.indexOf(a.card);
      if (k < 0) illegal("You don't hold that card");
      p.hole.splice(k, 1);
      p.discards.push(a.card);
      logAct(s, i, "discard");
      s.toAct = nextDiscarder(s, i);
      if (s.toAct < 0) { s.discard = false; advance(s, true); }
      return;
    }
    if (type === "allin") {
      // "All in" = as much as the rules allow: the whole stack in no limit, capped
      // at the pot-limit / fixed-limit maximum otherwise.
      let to = p.bet + p.stack;
      if (to <= s.currentBet || !L.canRaise) type = "call";
      else { type = "raise"; to = Math.min(to, L.maxTo); }
      a = { type, to };
    }
    if (type === "check" && !L.canCheck) illegal("Can't check facing a bet");
    if (type === "call" && L.toCall === 0) type = "check";
    const potBefore = potTotal(s);
    const info = { toCall: L.toCall, potBefore, betBefore: p.bet };

    if (type === "fold") {
      p.folded = true;
      logAct(s, i, "fold", info);
    } else if (type === "check") {
      logAct(s, i, "check", info);
    } else if (type === "call") {
      const amt = putIn(s, i, L.toCall, true);
      logAct(s, i, "call", Object.assign(info, { amount: amt, allIn: p.allIn }));
    } else if (type === "bet" || type === "raise") {
      if (!L.canRaise) illegal("Raising isn't allowed here");
      let to = Math.round(a.to);
      const allInTo = p.bet + p.stack;
      if (!(to >= L.minTo || to === allInTo)) illegal(`Raise must be to at least ${L.minTo}`);
      if (to > L.maxTo) illegal(`Raise can be to at most ${L.maxTo}`);
      if (to <= s.currentBet) illegal("A raise must be more than the current bet");
      const increase = to - s.currentBet;
      const full = s.cfg.betting === "fl" ? increase >= betUnit(s) : increase >= s.minRaise || s.currentBet === 0 && to >= s.bb;
      const amt = putIn(s, i, to - p.bet, true);
      const wasBet = s.currentBet === 0;
      if (full) { if (s.cfg.betting !== "fl") s.minRaise = Math.max(s.minRaise, increase); }
      s.currentBet = p.bet;
      s.bets += 1;
      if (s.cfg.betting === "fl" && s.bets >= 4 && !capLifted(s)) s.capped = true;
      s.lastAggressor = i;
      logAct(s, i, wasBet ? "bet" : "raise", Object.assign(info, { amount: amt, to: p.bet, allIn: p.allIn, full }));
    } else illegal("Unknown action " + type);

    p.acted = true;
    p.actedAt = s.currentBet;
    s.toAct = -1;

    if (inHand(s).length === 1) { finishFold(s); return; }
    if (needsAction(s)) {
      s.toAct = nextSeat(s, i, (k) => canAct(s, k) && (!s.seats[k].acted || s.seats[k].bet < s.currentBet));
      return;
    }
    advance(s);
  }

  /** Pineapple: discard after the betting before the flop; Crazy Pineapple: after the betting on the flop. */
  const DISCARD_AT = { pineapple: "preflop", crazy: "flop" };
  /** Next live player (from the left of seat `from`) who still holds three cards, or -1. */
  function nextDiscarder(s, from) {
    return nextSeat(s, from, (k) => !s.seats[k].folded && s.seats[k].hole.length > 2);
  }

  /** Close the betting round and deal on until someone must act or the hand ends. */
  function advance(s, discarded) {
    while (true) {
      for (const p of s.seats) { p.bet = 0; p.acted = false; p.actedAt = -1; }
      s.currentBet = 0; s.minRaise = s.bb; s.bets = 0; s.capped = false;
      if (!discarded && DISCARD_AT[s.cfg.game] === s.street) {
        const first = nextDiscarder(s, s.button);
        if (first >= 0) { s.discard = true; s.toAct = first; return; }
      }
      discarded = false;
      if (s.street === "river") { showdown(s); return; }
      const next = STREETS[STREETS.indexOf(s.street) + 1];
      s.street = next;
      const burn = s.deck.shift(); void burn;
      const count = next === "flop" ? 3 : 1;
      for (let k = 0; k < count; k++) s.board.push(s.deck.shift());
      logAct(s, -1, next, { cards: s.board.slice() });
      if (needsAction(s)) {
        s.toAct = nextSeat(s, s.button, (k) => canAct(s, k));
        return;
      }
    }
  }

  function finishFold(s) {
    const w = s.seats.findIndex((p) => !p.folded);
    const pot = potTotal(s);
    const net = s.seats.map((p) => -p.total);
    s.seats[w].stack += pot;
    net[w] += pot;
    s.result = { byFold: true, pots: [{ amount: pot, winners: [w], eligible: [w] }], shown: [], scores: {}, names: {}, net };
    endHand(s);
  }

  /** Split the money into main and side pots by how much each player put in. */
  function buildPots(s) {
    const levels = [...new Set(s.seats.map((p) => p.total).filter((t) => t > 0))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const lv of levels) {
      const contributors = s.seats.filter((p) => p.total >= lv).length;
      const amount = (lv - prev) * contributors;
      const eligible = s.seats.filter((p) => p.total >= lv && !p.folded).map((p) => p.i);
      prev = lv;
      if (!amount) continue;
      const last = pots[pots.length - 1];
      // Chips from folded players above every live player's total (e.g. a folded
      // big-blind ante) belong to the last real pot, not a pot nobody can win.
      if (!eligible.length && last) { last.amount += amount; continue; }
      if (last && last.eligible.join() === eligible.join()) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    return pots;
  }

  function showdown(s) {
    s.street = "showdown";
    const scores = {}, names = {};
    for (const p of s.seats) if (!p.folded) {
      scores[p.i] = P.score(s.cfg.game, p.hole, s.board);
      names[p.i] = P.describeFor(scores[p.i], s.cfg.game);
    }
    const pots = buildPots(s);
    const net = s.seats.map((p) => -p.total);
    for (const pot of pots) {
      let elig = pot.eligible;
      if (!elig.length) elig = inHand(s).map((p) => p.i); // safety; shouldn't happen
      const best = Math.max(...elig.map((i) => scores[i]));
      const winners = elig.filter((i) => scores[i] === best);
      // Order winners from the left of the button: odd chips go to the first one.
      winners.sort((a, b) => ((a - s.button - 1 + 99 * s.seats.length) % s.seats.length) - ((b - s.button - 1 + 99 * s.seats.length) % s.seats.length));
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      for (const w of winners) {
        const amt = share + (odd > 0 ? 1 : 0);
        if (odd > 0) odd--;
        s.seats[w].stack += amt; net[w] += amt;
      }
      pot.winners = winners;
      pot.uncontested = elig.length === 1;
    }
    // Hands shown: everyone who reached showdown and was in a contested pot.
    const shown = inHand(s).map((p) => p.i).filter((i) => pots.some((pt) => !pt.uncontested && pt.eligible.includes(i)));
    s.result = { byFold: false, pots, shown, scores, names, net };
    endHand(s);
  }

  function endHand(s) {
    s.street = "done";
    s.toAct = -1;
    s.hand += 1;
    // Busted players: in a tournament they finish in order.
    const busted = s.seats.filter((p) => !p.out && p.stack === 0);
    if (s.cfg.format === "tourney" && busted.length) {
      // Busted in the same hand: whoever started the hand with fewer chips finishes lower;
      // the same starting stack = a tie for the better of their places (TDA, Robert's Rules).
      busted.sort((a, b) => a.total - b.total);
      for (let k = 0; k < busted.length;) {
        let j = k;
        while (j < busted.length && busted[j].total === busted[k].total) j++;
        const place = s.nextPlace - (j - k) + 1;
        for (let m = k; m < j; m++) { busted[m].out = true; busted[m].place = place; }
        s.nextPlace -= j - k;
        k = j;
      }
      const left = s.seats.filter((p) => !p.out);
      if (left.length === 1) { s.over = true; s.winner = left[0].i; left[0].place = 1; }
    }
  }

  function rebuy(s, seat) {
    if (s.cfg.format !== "cash") illegal("Rebuys are for cash games");
    if (s.street !== "done" && s.street !== "idle") illegal("Rebuy between hands");
    const p = s.seats[seat];
    if (p.stack > 0) illegal("Only when out of chips");
    p.stack = s.cfg.startStack; p.buyIns++; p.out = false;
  }

  /** The one entry point: returns a new state. */
  function apply(state, action) {
    const s = clone(state);
    switch (action.type) {
      case "deal":
        if (s.street !== "idle" && s.street !== "done") illegal("Hand still in progress");
        if (s.over) illegal("Game over");
        startHand(s);
        break;
      case "rebuy": rebuy(s, action.seat); break;
      case "sitout": s.seats[action.seat].out = true; break;
      default: act(s, action);
    }
    return s;
  }

  /** What `seat` is allowed to see. seat = -1 for a spectator. */
  function view(state, seat) {
    const s = clone(state);
    delete s.deck;
    const shown = new Set(s.result ? s.result.shown : []);
    for (const p of s.seats) {
      if (p.i !== seat && !shown.has(p.i)) p.hole = p.hole.map(() => null);
      if (p.i !== seat && p.discards) p.discards = p.discards.map(() => null); // discards are face down
    }
    return s;
  }

  const api = { LEVELS, STREETS, newGame, apply, view, legal, potTotal, buildPots, blindsFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== "undefined" ? self : this);
