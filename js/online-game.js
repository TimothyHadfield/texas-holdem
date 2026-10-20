/* online-game.js — Texas Hold'em as the pure game object that the shared
 * online layer (js/online.js, copied unchanged from ../_online) expects:
 * setup / toAct / apply / publicView / privateView / bot / isOver.
 * It only wraps engine.js; every rule still lives there.
 *
 * Between hands, every human seat still in the game may press "Next hand"
 * (first press deals). In a cash game, anyone out of chips buys back in
 * automatically at the next deal (their buy-ins are counted). */
(function (root) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const P = isNode ? require("./poker.js") : root.Poker;
  const E = isNode ? require("./engine.js") : root.Engine;
  const B = isNode ? require("./bots.js") : root.Bots;

  const NAMES = ["Ada", "Ben", "Cleo", "Dev", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jun", "Kit", "Lux"];
  const BETTING = ["nl", "pl", "fl"];
  const PLAY_TYPES = ["fold", "check", "call", "bet", "raise", "allin"];
  const between = (s) => s.street === "done" || s.street === "idle";

  /** Table options (same choices as the solo setup screen). */
  function config(o, seed) {
    o = o || {};
    const stack = [50, 100, 200].includes(+o.stack) ? +o.stack : 100;
    const ante = ["none", "each", "bb"].includes(o.ante) ? o.ante : "none";
    return {
      betting: BETTING.includes(o.betting) ? o.betting : "nl",
      format: o.format === "tourney" ? "tourney" : "cash",
      sb: 10, bb: 20, startStack: 20 * stack, seed,
      ante: ante === "none" ? 0 : ante === "bb" ? 20 : 2, anteType: ante === "bb" ? "bb" : "each",
      levelHands: 10, anteFromLevel: ante === "none" ? 99 : 1,
    };
  }

  const game = {
    id: "holdem",
    minSeats: 2, maxSeats: 9,

    setup(n, options, rng, seats) {
      seats = seats || [];
      const seed = Math.floor(rng() * 4294967296) >>> 0;
      const level = ["easy", "medium", "hard"].includes(options && options.level) ? options.level : "hard";
      let bots = 0;
      const players = Array.from({ length: n }, (_, i) => {
        const s = seats[i] || { kind: "computer" };
        if (s.kind === "human") return { name: String(s.name || "Player " + (i + 1)).slice(0, 20), kind: "human" };
        return { name: NAMES[bots++ % NAMES.length], kind: "bot", level };
      });
      return E.apply(E.newGame(config(options, seed), players), { type: "deal" });
    },

    toAct(s) {
      if (s.over) return [];
      if (between(s)) {
        const people = s.seats.filter((p) => p.kind === "human" && !(s.cfg.format === "tourney" && p.out)).map((p) => p.i);
        if (people.length) return people;
        // only computers left with chips: let them play it out
        return s.seats.filter((p) => !p.out).slice(0, 1).map((p) => p.i);
      }
      return s.toAct >= 0 ? [s.toAct] : [];
    },

    apply(s, seat, action) {
      if (!action || typeof action.type !== "string") throw new Error("bad move");
      if (action.type === "deal") {
        if (!between(s)) throw new Error("hand still in progress");
        if (s.cfg.format === "cash") {
          for (const p of s.seats) if (p.stack === 0) s = E.apply(s, { type: "rebuy", seat: p.i });
        }
        return E.apply(s, { type: "deal" });
      }
      if (!PLAY_TYPES.includes(action.type)) throw new Error("bad move");
      if (seat !== s.toAct) throw new Error("not your turn");
      const a = { type: action.type };
      if (action.to !== undefined) a.to = Math.round(+action.to);
      return E.apply(s, a);
    },

    /** Everyone sees this: no deck, no unshown hole cards, and no shuffle seed. */
    publicView(s) {
      const v = E.view(s, -1);
      delete v.cfg.seed;
      return v;
    },

    privateView(s, seat) {
      const p = s.seats[seat];
      return { hole: p ? p.hole.slice() : [] };
    },

    bot(ctx, seat, rng) {
      const s = ctx.state;
      if (between(s)) return { type: "deal" };
      const v = JSON.parse(JSON.stringify(ctx.pub));
      v.seats[seat].hole = (ctx.mine && ctx.mine.hole) || [];
      const level = s.seats[seat].level || "hard";
      let a;
      try { a = B.decide(v, level, rng).action; E.apply(s, a); }
      catch (e) { a = { type: E.legal(s).toCall ? "fold" : "check" }; }
      return a;
    },

    isOver(s) { return !!s.over; },
  };

  /**
   * Turn an online snapshot into an engine-shaped state seen from my seat,
   * rotated so that I am seat 0 (the table screen always draws seat 0 at the
   * bottom). Seat numbers in log/result/button are remapped to match.
   */
  function rotate(pub, mine, me, roomSeats) {
    const s = JSON.parse(JSON.stringify(pub));
    const n = s.seats.length;
    if (me < 0) me = 0;
    if (mine && mine.hole && s.seats[me]) s.seats[me].hole = mine.hole.slice();
    const m = (i) => (typeof i === "number" && i >= 0 ? (i - me + n) % n : i);
    s.seats = s.seats.map((_, k) => s.seats[(k + me) % n]);
    s.seats.forEach((p, k) => {
      p.i = k;
      const rs = roomSeats && roomSeats[(k + me) % n];
      if (rs && p.kind === "human" && rs.kind === "computer") p.name += " (computer)";
      if (rs && p.kind === "human" && rs.kind === "human" && rs.online === false) p.name += " (away)";
    });
    for (const f of ["button", "sbSeat", "bbSeat", "toAct", "lastAggressor", "winner"]) if (f in s) s[f] = m(s[f]);
    for (const e of s.log || []) e.seat = m(e.seat);
    if (s.result) {
      const r = s.result;
      for (const p of r.pots) { p.winners = p.winners.map(m); p.eligible = (p.eligible || []).map(m); }
      r.shown = (r.shown || []).map(m);
      const remapObj = (o) => { const out = {}; for (const k in o) out[m(+k)] = o[k]; return out; };
      r.scores = remapObj(r.scores || {});
      r.names = remapObj(r.names || {});
      if (Array.isArray(r.net)) r.net = r.net.map((_, k) => r.net[(k + me) % n]);
    }
    if (s.cfg) s.cfg.seed = 0;
    return s;
  }

  const api = { game, rotate, config };
  if (isNode) module.exports = api;
  else root.HoldemOnline = api;
  void P;
})(typeof self !== "undefined" ? self : this);
