/* ============================================================================
 * measure.js — how strong is each computer level? Long simulated sessions.
 *     node tools/measure.js [hands] [betting] [mode]
 *       hands:   hands per table type (default 20000)
 *       betting: nl | pl | fl (default nl)
 *       mode:    ring (6 seats: 2 easy, 2 medium, 2 hard) | hu (heads-up pairs) | all
 *
 * Cash-game style: every hand starts with 100 big blinds each (so one big
 * loss doesn't end the session), seats reshuffled every 6 hands so nobody
 * keeps a better position. Result = big blinds won per 100 hands, with a 95%
 * confidence range from the per-hand spread.
 * ==========================================================================*/
const P = require("../js/poker.js");
const E = require("../js/engine.js");
const B = require("../js/bots.js");

const HANDS = +process.argv[2] || 20000;
const BETTING = process.argv[3] || "nl";
const MODE = process.argv[4] || "all";

function playHand(levels, seed, handNo, betting) {
  const players = levels.map((l, i) => ({ name: l + i, kind: "bot", level: l }));
  let s = E.newGame({ seed, betting, sb: 1, bb: 2, startStack: 200 }, players);
  s.hand = handNo;           // varies the deck
  s.button = (handNo % levels.length) - 1 + levels.length; // rotate the button
  s.button %= levels.length;
  s = E.apply(s, { type: "deal" });
  const rand = P.rng32(seed * 9973 + handNo);
  let steps = 0;
  while (s.street !== "done") {
    const v = E.view(s, s.toAct);
    const d = B.decide(v, levels[s.toAct], rand);
    try { s = E.apply(s, d.action); }
    catch (e) { s = E.apply(s, { type: E.legal(s).toCall ? "fold" : "check" }); }
    if (++steps > 400) throw new Error("stuck");
  }
  return s.seats.map((p) => (p.stack - 200) / 2); // in big blinds
}

function stats(arr) {
  const n = arr.length;
  const m = arr.reduce((a, b) => a + b, 0) / n;
  const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1);
  return { mean100: m * 100, ci100: 1.96 * Math.sqrt(v / n) * 100, n };
}

function ring(hands) {
  const base = ["easy", "easy", "medium", "medium", "hard", "hard"];
  const res = { easy: [], medium: [], hard: [] };
  const rand = P.rng32(42);
  let levels = base.slice();
  for (let h = 0; h < hands; h++) {
    if (h % 6 === 0) { // reshuffle seats
      levels = base.slice();
      for (let i = levels.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [levels[i], levels[j]] = [levels[j], levels[i]]; }
    }
    const won = playHand(levels, 1000 + Math.floor(h / 6), h, BETTING);
    // average the two seats of each level so each hand gives one sample per level
    const per = { easy: 0, medium: 0, hard: 0 };
    levels.forEach((l, i) => { per[l] += won[i] / 2; });
    for (const l in per) res[l].push(per[l]);
  }
  return res;
}

function hu(a, b, hands) {
  const r = [];
  for (let h = 0; h < hands; h++) {
    // duplicate-style: same deck twice with seats swapped cancels card luck
    const w1 = playHand([a, b], 5000 + h, h, BETTING);
    const w2 = playHand([b, a], 5000 + h, h, BETTING);
    r.push((w1[0] + w2[1]) / 2);
  }
  return r;
}

const t0 = Date.now();
const lines = [];
if (MODE === "ring" || MODE === "all") {
  const res = ring(HANDS);
  lines.push(`6-seat table (2 of each level), ${HANDS} hands, ${BETTING}:`);
  for (const l of ["easy", "medium", "hard"]) {
    const s = stats(res[l]);
    lines.push(`  ${l.padEnd(6)} ${s.mean100 >= 0 ? "+" : ""}${s.mean100.toFixed(1)} bb/100  (±${s.ci100.toFixed(1)})`);
  }
}
if (MODE === "hu" || MODE === "all") {
  const n = Math.round(HANDS / 4);
  for (const [a, b] of [["medium", "easy"], ["hard", "easy"], ["hard", "medium"]]) {
    const s = stats(hu(a, b, n));
    lines.push(`heads-up ${a} vs ${b}, ${n} deals x2 seats: ${a} ${s.mean100 >= 0 ? "+" : ""}${s.mean100.toFixed(1)} bb/100 (±${s.ci100.toFixed(1)})`);
  }
}
lines.push(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log(lines.join("\n"));
