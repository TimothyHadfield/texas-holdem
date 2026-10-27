/* ============================================================================
 * sng.js — heads-up tournaments between two computer levels (what you get with
 * Game: Tournament against one computer).
 *     node tools/sng.js [pairs] [betting] [a] [b] [stackBB]
 *       defaults: 500 pairs, nl, hard vs medium, 50 BB
 * Each pair plays the same seed twice with the seats swapped (card luck
 * cancels). Blinds go up every 10 hands like the app. Reports the share of
 * tournaments a wins, with a 95% range.
 * ==========================================================================*/
const P = require("../js/poker.js");
const E = require("../js/engine.js");
const B = require(process.env.BOTS ? require("path").resolve(process.env.BOTS) : "../js/bots.js");
const N = +process.argv[2] || 500;
const BET = process.argv[3] || "nl";
const A = process.argv[4] || "hard";
const Bl = process.argv[5] || "medium";
const STACK = +process.argv[6] || 50;
const SEED0 = +(process.env.SEED || 90000);

function sng(levels, seed) {
  const players = levels.map((l, i) => ({ name: l + i, kind: "bot", level: l }));
  let s = E.newGame({ seed, betting: BET, format: "tourney", sb: 10, bb: 20, startStack: 20 * STACK, levelHands: 10, ante: 0, anteFromLevel: 99 }, players);
  let guard = 0;
  while (!s.over && guard++ < 100000) {
    if (s.street === "done" || s.street === "idle") { s = E.apply(s, { type: "deal" }); continue; }
    const v = E.view(s, s.toAct);
    const d = B.decide(v, levels[s.toAct], P.rng32((s.cfg.seed + s.hand * 977 + s.log.length * 31) >>> 0));
    try { s = E.apply(s, d.action); } catch (e) { s = E.apply(s, { type: E.legal(s).toCall ? "fold" : "check" }); }
  }
  return { winner: s.winner, hands: s.hand };
}
const t0 = Date.now();
let w = 0, hands = 0;
for (let k = 0; k < N; k++) {
  const r1 = sng([A, Bl], SEED0 + k), r2 = sng([Bl, A], SEED0 + k);
  w += (r1.winner === 0) + (r2.winner === 1);
  hands += r1.hands + r2.hands;
}
const p = w / (2 * N), ci = 1.96 * Math.sqrt(p * (1 - p) / (2 * N));
console.log(`${BET} heads-up tournaments, ${STACK} BB: ${A} beats ${Bl} ${(100 * p).toFixed(1)}% ±${(100 * ci).toFixed(1)} of ${2 * N} (avg ${(hands / 2 / N).toFixed(0)} hands, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
