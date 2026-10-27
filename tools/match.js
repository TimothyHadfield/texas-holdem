/* ============================================================================
 * match.js — head-to-head matches between two computer levels.
 *     node tools/match.js [matches] [hands] [betting] [a] [b]
 *       defaults: 300 matches of 100 hands, nl, hard vs medium
 *
 * Each match is heads-up, duplicate style: the same decks are played twice
 * with the seats swapped, so card luck cancels. A match is won by whichever
 * level is ahead in big blinds after both passes. Reports the share of
 * matches won (ties count half) and bb/100 with a 95% range.
 * Stacks reset to 100 BB every hand (a cash game), like tools/measure.js.
 * ==========================================================================*/
const P = require("../js/poker.js");
const E = require("../js/engine.js");
const B = require(process.env.BOTS ? require("path").resolve(process.env.BOTS) : "../js/bots.js");

const M = +process.argv[2] || 300;
const H = +process.argv[3] || 100;
const BET = process.argv[4] || "nl";
const A = process.argv[5] || "hard";
const Bl = process.argv[6] || "medium";
const SEED0 = +(process.env.SEED || 7000);

function playHand(levels, seed, handNo) {
  const players = levels.map((l, i) => ({ name: l + i, kind: "bot", level: l }));
  let s = E.newGame({ seed, betting: BET, sb: 1, bb: 2, startStack: 200 }, players);
  s.hand = handNo;
  s.button = handNo % 2;
  s = E.apply(s, { type: "deal" });
  const rand = P.rng32(seed * 9973 + handNo);
  let steps = 0;
  while (s.street !== "done") {
    const v = E.view(s, s.toAct);
    const d = B.decide(v, levels[s.toAct], rand);
    try { s = E.apply(s, d.action); } catch (e) { s = E.apply(s, { type: E.legal(s).toCall ? "fold" : "check" }); }
    if (++steps > 400) throw new Error("stuck");
  }
  return s.seats.map((p) => (p.stack - 200) / 2);
}

const t0 = Date.now();
let wins = 0;
const per = [];
for (let m = 0; m < M; m++) {
  let tot = 0;
  for (let h = 0; h < H; h++) {
    const seed = SEED0 + m * 1000 + h;
    const w1 = playHand([A, Bl], seed, h);
    const w2 = playHand([Bl, A], seed, h);
    const x = (w1[0] + w2[1]) / 2;
    tot += x; per.push(x);
  }
  wins += tot > 0 ? 1 : tot === 0 ? 0.5 : 0;
}
const n = per.length, mean = per.reduce((a, b) => a + b, 0) / n;
const sd = Math.sqrt(per.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
console.log(`${BET} ${A} vs ${Bl}: ${A} wins ${(100 * wins / M).toFixed(1)}% of ${M} matches (${H} hands x2 seats); ${(mean * 100).toFixed(1)} bb/100 ±${(196 * sd / Math.sqrt(n)).toFixed(1)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
