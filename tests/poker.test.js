/* ============================================================================
 * poker.test.js — the hand evaluator and the odds maths.
 *     node tests/poker.test.js
 *
 * Checked against published facts, not against itself:
 *  - every one of the 2,598,960 five-card hands, counted by kind, must match
 *    the textbook frequency table;
 *  - 7-card scores must agree with a separate, deliberately simple evaluator
 *    (best of the 21 five-card subsets) on 200,000 random hands;
 *  - known matchups: AA vs KK preflop 81.9% (exact enumeration of all
 *    1,712,304 boards), AA vs one random hand ~85.2%, etc.
 * ==========================================================================*/
const P = require("../js/poker.js");
const { parseCards: C } = P;

let passed = 0;
const failures = [];
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function eq(a, b, what) { ok(a === b, `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function near(a, b, tol, what) { ok(Math.abs(a - b) <= tol, `${what}: expected ${b} ±${tol}, got ${a.toFixed(5)}`); }

// ------------------------------------------------ parsing and naming
eq(P.cardStr(P.parseCard("Ah")), "Ah", "parse Ah");
eq(P.parseCard("10s"), P.parseCard("Ts"), "10s = Ts");
eq(P.parseCard("Zz"), -1, "bad card");
eq(P.describe(P.evaluate(C("Ah Kh Qh Jh Th"))), "Royal flush", "royal name");
eq(P.describe(P.evaluate(C("Ah 2d 3c 4s 5h"))), "Straight, Five high", "wheel");
eq(P.describe(P.evaluate(C("Kh Kd 7c 7s 2h"))), "Two pair, Kings and Sevens", "two pair name");
eq(P.describe(P.evaluate(C("9h 9d 9c 4s 4h"))), "Full house, Nines full of Fours", "boat name");

// ------------------------------------------------ ordering spot checks
const s = (str) => P.evaluate(C(str));
ok(s("Ah Kh Qh Jh Th") > s("Kh Qh Jh Th 9h"), "royal beats K-high SF");
ok(s("5h 4h 3h 2h Ah") < s("6h 5h 4h 3h 2h"), "steel wheel is the lowest SF");
ok(s("2c 2d 2h 2s 3c") > s("Ac Ad Ah Kc Kd"), "quads beat full house");
ok(s("Ac Ad Ah 2c 2d") > s("Kc Kd Kh Ac Ad"), "AAA22 beats KKKAA");
ok(s("2h 4h 6h 8h Th") > s("Ac Kd Qh Js Tc"), "flush beats straight");
ok(s("Ac 2d 3h 4s 5c") < s("2c 3d 4h 5s 6c"), "wheel is the lowest straight");
ok(s("Ac Ad Kh Qs Jc") > s("Ac Ad Kh Qs Tc"), "pair kicker 3");
ok(s("Ac Ad Kh Kd 3c") === s("As Ah Ks Kc 3d"), "identical two pair ties");
ok(s("Ac Ad Kh Kd 3c 2s Qd") > s("Ac Ad Kh Kd Jc 2s 3d"), "7-card two pair uses best kicker");
// three pairs: the best two pair plays with the best kicker (which may be the third pair)
eq(s("Ac Ad Kh Kd Qc Qs 2d"), s("Ac Ad Kh Kd Qc 3s 2d"), "three pairs -> AAKK Q kicker");
// two sets -> full house
eq(P.category(s("9c 9d 9h 5s 5c 5d 2h")), 6, "two trips is a full house");
eq(s("9c 9d 9h 5s 5c 5d 2h"), s("9c 9d 9h 5s 5c Kd 2h"), "999-555 = nines full of fives");
// 6-card flush keeps the top 5
eq(s("Ah 9h 7h 5h 3h 2h Kc"), s("Ah 9h 7h 5h 3h Kc Qd"), "6-card flush top five");

// ------------------------------------------------ 5-card frequency table (all 2,598,960 hands)
{
  const expected = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40];
  const got = new Array(9).fill(0);
  const h = [0, 0, 0, 0, 0];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++)
    for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
      h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e;
      got[P.category(P.evaluate(h, 5))]++;
    }
  for (let k = 0; k < 9; k++) eq(got[k], expected[k], `5-card count of ${P.CAT_NAMES[k]}`);
}

// ------------------------------------------------ 7-card vs a naive reference
// The reference scores 5-card hands with plain sorting and takes the best of 21.
function naive5(cards) {
  const r = cards.map((c) => c >> 2).sort((x, y) => y - x);
  const suits = cards.map((c) => c & 3);
  const flush = suits.every((u) => u === suits[0]);
  const uniq = [...new Set(r)];
  let straightHi = -1;
  if (uniq.length === 5) {
    if (r[0] - r[4] === 4) straightHi = r[0];
    else if (r[0] === 12 && r[1] === 3 && r[4] === 0) straightHi = 3;
  }
  const cnt = {};
  r.forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; });
  const groups = Object.keys(cnt).map(Number).sort((x, y) => cnt[y] - cnt[x] || y - x);
  const shape = groups.map((g) => cnt[g]).join("");
  const pack = (cat, ks) => ks.reduce((acc, k, i) => acc | (k << (16 - 4 * i)), cat << 20);
  if (flush && straightHi >= 0) return pack(8, [straightHi]);
  if (shape === "41") return pack(7, groups);
  if (shape === "32") return pack(6, groups);
  if (flush) return pack(5, r);
  if (straightHi >= 0) return pack(4, [straightHi]);
  if (shape === "311") return pack(3, groups);
  if (shape === "221") return pack(2, groups);
  if (shape === "2111") return pack(1, groups);
  return pack(0, r);
}
function naive7(cards) {
  let best = -1;
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
    const five = cards.filter((_, i) => i !== a && i !== b);
    best = Math.max(best, naive5(five));
  }
  return best;
}
{
  const rand = P.rng32(2026);
  let mismatch = 0, first = "";
  for (let t = 0; t < 200000; t++) {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = 0; i < 7; i++) { const j = i + Math.floor(rand() * (52 - i)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const seven = deck.slice(0, 7);
    const a = P.evaluate(seven, 7), b = naive7(seven);
    if (a !== b) { mismatch++; if (!first) first = seven.map(P.cardStr).join(" ") + ` fast=${a} naive=${b}`; }
  }
  eq(mismatch, 0, "7-card evaluator agrees with naive best-of-21 on 200k hands" + (first ? " (first: " + first + ")" : ""));
}

// ------------------------------------------------ equity: known results
{
  // AA vs KK preflop, exact over all C(48,5) = 1,712,304 boards.
  // Published (PokerStove): AA wins 81.06% when no suits are shared, 81.71%
  // sharing one suit, 82.36% sharing both; the often-quoted "81.9%" is the
  // equity averaged over all 36 suit pairings (1 + 4 + 1 out of 6 per AA).
  const r = P.equity({ hero: C("Ah As"), known: [C("Kd Kc")], opponents: 1, exactLimit: 4e6 });
  eq(r.exact, true, "AA vs KK uses exact enumeration");
  eq(r.n, 1712304, "AA vs KK board count");
  near(r.win, 0.8106, 0.0005, "AhAs vs KdKc win");
  const r1 = P.equity({ hero: C("Ah As"), known: [C("Kh Kc")], opponents: 1, exactLimit: 4e6 });
  near(r1.win, 0.8171, 0.0005, "AhAs vs KhKc win");
  const r2 = P.equity({ hero: C("Ah As"), known: [C("Kh Ks")], opponents: 1, exactLimit: 4e6 });
  near(r2.win, 0.8236, 0.0005, "AhAs vs KhKs win");
  const avg = (r.equity + 4 * r1.equity + r2.equity) / 6;
  near(avg, 0.819, 0.001, "AA vs KK averaged over suits = 81.9%");
}
{
  // AKs vs QQ: the classic coin flip, QQ a small favourite (~54%).
  const r = P.equity({ hero: C("As Ks"), known: [C("Qh Qd")], opponents: 1, exactLimit: 4e6 });
  near(r.equity, 0.4617, 0.003, "AKs vs QQ");
}
{
  // AA vs one random hand ~85.2%; 72o vs one random ~34.6% (Monte Carlo, 100k).
  const aa = P.equity({ hero: C("Ah As"), opponents: 1, trials: 100000, seed: 1 });
  near(aa.equity, 0.852, 0.006, "AA vs 1 random");
  const s72 = P.equity({ hero: C("7h 2d"), opponents: 1, trials: 100000, seed: 2 });
  near(s72.equity, 0.346, 0.006, "72o vs 1 random");
  // AA vs 4 random hands ~55.9%.
  const aa4 = P.equity({ hero: C("Ah As"), opponents: 4, trials: 60000, seed: 3 });
  near(aa4.equity, 0.559, 0.012, "AA vs 4 random");
}
{
  // Flop, one random opponent: exact (1081 boards x 990 hands).
  const r = P.equity({ hero: C("Ah Kh"), board: C("2h 7h Qc"), opponents: 1 });
  eq(r.exact, true, "flop vs 1 random is exact");
  // Monte Carlo of the same spot must agree.
  const m = P.equity({ hero: C("Ah Kh"), board: C("2h 7h Qc"), opponents: 1, forceMC: true, trials: 80000, seed: 9 });
  near(m.equity, r.equity, 0.008, "MC agrees with exact on the flop");
}
{
  // River, nothing left to come: a made royal can't lose.
  const r = P.equity({ hero: C("Ah Kh"), board: C("Qh Jh Th 2c 3d"), opponents: 3 });
  eq(r.win, 1, "royal on the river always wins");
  // Board plays: everyone ties.
  const t = P.equity({ hero: C("2c 3d"), known: [C("4c 5d")], board: C("Ah Kh Qh Jh Th"), opponents: 1 });
  eq(t.tie, 1, "royal on board: always a tie");
  near(t.equity, 0.5, 1e-9, "two-way tie = half");
}
{
  // all-known equities sum to 1
  const e = P.allEquities([C("Ah As"), C("Kd Kc"), C("7s 2h")], [], [], { trials: 30000 });
  near(e.reduce((a, b) => a + b, 0), 1, 1e-9, "allEquities sums to 1");
  ok(e[0] > e[1] && e[1] > e[2], "AA > KK > 72");
}

// ------------------------------------------------ outs
{
  // Four to a flush on the flop: 9 flush outs (no pair outs counted
  // separately here: pairing a hole card is also an improvement).
  const o = P.outs(C("Ah Kh"), C("2h 7h Qc"));
  eq(o.byKind["Flush"].length, 9, "nut flush draw has 9 flush outs");
  eq(o.byKind["Pair"].length, 6, "AK on Q72: 6 pair outs (3 aces, 3 kings)");
  near(o.riverPct, 1 - P.choose(47 - 15, 2) / P.choose(47, 2), 1e-9, "turn+river odds formula");
  // Open-ended straight draw: 8 outs to a straight.
  const s8 = P.outs(C("9c 8d"), C("7h 6s 2c"));
  eq(s8.byKind["Straight"].length, 8, "open-ended straight draw: 8 outs");
  // A pair landing on the board is not an out.
  const b = P.outs(C("Ac Kd"), C("7h 7s 2c 9d"));
  ok(!b.cards.some((c) => (c >> 2) === 5 || (c >> 2) === 0 || (c >> 2) === 7), "board-pairing cards are not outs");
}

// ------------------------------------------------ classes
eq(P.CLASSES.length, 169, "169 starting-hand classes");
eq(P.handClass(P.parseCard("Kd"), P.parseCard("As")), "AKo", "class AKo");
eq(P.handClass(P.parseCard("7h"), P.parseCard("8h")), "87s", "class 87s");

if (failures.length) {
  console.log(`poker.test: ${passed} passed, ${failures.length} FAILED`);
  failures.forEach((f) => console.log("  FAIL " + f));
  process.exit(1);
}
console.log(`poker.test: all ${passed} passed`);
