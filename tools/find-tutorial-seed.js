/* find-tutorial-seed.js — search once for the guided first game's deal (then hard-code it in js/coach-holdem.js).
 *     node tools/find-tutorial-seed.js
 * Wants: you (seat 0) vs one Easy computer, no limit, 100 BB. Your first hand is a big pair or ace-king,
 * the flop gives you top pair or better, the computer calls along to the river, and you win at the showdown
 * whether you raise and bet (the coach's line) or only check and call. Bots draw their random numbers exactly
 * like js/play.js does. */
const P = require("../js/poker.js");
const E = require("../js/engine.js");
const B = require("../js/bots.js");

function cfgFor(seed) {
  return { betting: "nl", format: "cash", sb: 10, bb: 20, startStack: 2000, seed, ante: 0, anteType: "each", levelHands: 10, anteFromLevel: 99 };
}
function run(seed, heroLine) {
  let s = E.newGame(cfgFor(seed), [{ name: "You", kind: "human" }, { name: "Ada", kind: "bot", level: "easy" }]);
  s = E.apply(s, { type: "deal" });
  const hole = s.seats[0].hole.slice();
  let guard = 0;
  while (s.street !== "done" && guard++ < 50) {
    if (s.toAct === 0) {
      const L = E.legal(s);
      let a;
      if (heroLine === "aggro" && L.canRaise) {
        const t = s.currentBet === 0 ? Math.round(L.pot * 0.66) : s.street === "preflop" && s.currentBet === s.bb ? s.bb * 3 : null;
        a = t ? { type: "raise", to: Math.max(L.minTo, Math.min(L.maxTo, Math.round(t / 10) * 10)) } : { type: L.canCheck ? "check" : "call" };
      } else a = { type: L.canCheck ? "check" : "call" };
      s = E.apply(s, a);
    } else {
      const v = E.view(s, s.toAct);
      const r = B.decide(v, "easy", P.rng32((s.cfg.seed + s.hand * 977 + s.log.length * 31) >>> 0));
      try { s = E.apply(s, r.action); } catch (e) { s = E.apply(s, { type: E.legal(s).toCall ? "fold" : "check" }); }
    }
  }
  return { s, hole };
}
const found = [];
for (let seed = 1; seed < 200000 && found.length < 8; seed++) {
  const a = run(seed, "aggro"), b = run(seed, "passive");
  const h = a.hole, cls = P.handClass(h[0], h[1]);
  if (!/^(AA|KK|QQ|JJ|TT|AKs|AK|AKo)$/.test(cls)) continue;
  const ok = (x) => x.s.result && !x.s.result.byFold && x.s.result.pots[0].winners.length === 1 && x.s.result.pots[0].winners[0] === 0;
  if (!ok(a) || !ok(b)) continue;
  // a pair or better on the flop that uses one of your cards, and the computer hasn't folded on the flop
  const flop = a.s.board.slice(0, 3);
  const cat = P.category(P.evaluate(h, 2, flop, 3));
  if (cat < 1) continue;
  const heroFirstPre = (() => { const e = a.s.log.find((x) => x.street === "preflop" && !["sb", "bb", "ante"].includes(x.type)); return e && e.seat === 0; })();
  found.push({ seed, cls, flop: flop.map((c) => "23456789TJQKA"[c >> 2] + "cdhs"[c & 3]).join(" "), hand: a.s.result.names[0], heroFirstPre, potA: a.s.result.pots[0].amount, potB: b.s.result.pots[0].amount });
}
console.log(found);
