/* ============================================================================
 * rules-doc.test.js — keeps docs/rules-check.md honest.
 *     node tests/rules-doc.test.js
 * Every rule row names a test that must exist; every number in "Counts" is
 * checked against the real engine and evaluator.
 * ==========================================================================*/
const fs = require("fs");
const path = require("path");
const P = require("../js/poker.js");
const E = require("../js/engine.js");

let passed = 0;
const failures = [];
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function eq(a, b, what) { ok(a === b, `${what}: doc says ${b}, engine gives ${a}`); }

const doc = fs.readFileSync(path.join(__dirname, "../docs/rules-check.md"), "utf8");
const testSrc = ["engine.test.js", "poker.test.js", "home.test.js"]
  .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");

// --- rule rows: | n | rule | sources | `test name` |
const rows = doc.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l));
eq(rows.length, 26, "number of rules in the doc");
rows.forEach((l, i) => {
  const n = +l.split("|")[1];
  ok(n === i + 1, `rule ${i + 1} is numbered ${n}`);
  const m = l.match(/`([^`]+)`\s*\|\s*$/);
  ok(!!m, `rule ${n} names a test`);
  if (m) ok(testSrc.includes(m[1]), `rule ${n}: test "${m[1]}" exists in tests/`);
  const src = l.split("|")[3] || "";
  // Two sources, or an honest "one source (rooms differ)" where real rooms disagree.
  ok(/one source \(rooms differ\)/.test(src) || src.split(",").filter((x) => x.trim()).length >= 2, `rule ${n} has two sources`);
});

// --- counts
const counts = {};
for (const l of doc.split("\n")) {
  const m = l.match(/^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*$/);
  if (m) counts[m[1]] = +m[2];
}
eq(Object.keys(counts).length, 11, "number of counts in the doc");

// Play one full hand where everyone checks/calls, watching the deck.
let s = E.newGame({ seed: 11 }, Array.from({ length: 4 }, (_, i) => ({ name: "P" + i, kind: "bot" })));
s = E.apply(s, { type: "deal" });
eq(s.deck.length + s.seats.reduce((a, p) => a + p.hole.length, 0), counts["Cards in the deck"], "Cards in the deck");
eq(new Set(s.deck.concat(...s.seats.map((p) => p.hole))).size, 52, "deck has no duplicates");
eq(s.seats[0].hole.length, counts["Hole cards per player"], "Hole cards per player");
const deckAtStart = s.deck.length;
const streets = new Set([s.street]);
let flop = 0;
while (s.street !== "done") {
  const L = E.legal(s);
  s = E.apply(s, { type: L.canCheck ? "check" : "call" });
  if (s.street === "flop" && !flop) flop = s.board.length;
  streets.add(s.street);
}
eq(s.board.length, counts["Community cards"], "Community cards");
eq(flop, counts["Flop cards"], "Flop cards");
eq(deckAtStart - s.deck.length - s.board.length, counts["Burn cards per hand (before flop, turn, river)"], "Burn cards per hand");
eq(["preflop", "flop", "turn", "river"].filter((x) => streets.has(x)).length, counts["Betting rounds"], "Betting rounds");

// Evaluator counts
const cats = new Set();
let n5 = 0;
for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++)
  for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
    n5++;
    if (cats.size < 9 && n5 % 7 === 0) cats.add(P.category(P.evaluate([a, b, c, d, e], 5)));
  }
// make sure the rare categories are represented
cats.add(P.category(P.evaluate(P.parseCards("Ah Kh Qh Jh Th"), 5)));
cats.add(P.category(P.evaluate(P.parseCards("2c 2d 2h 2s 3c"), 5)));
cats.add(P.category(P.evaluate(P.parseCards("2c 2d 2h 3s 3c"), 5)));
eq(n5, counts["Distinct 5-card hands"], "Distinct 5-card hands");
eq(cats.size, counts["Hand categories"], "Hand categories");
eq(P.CLASSES.length, counts["Starting-hand classes"], "Starting-hand classes");

// Fixed limit: one bet + three raises, then capped (6 players so the cap applies).
let f = E.newGame({ seed: 5, betting: "fl" }, Array.from({ length: 6 }, (_, i) => ({ name: "P" + i, kind: "bot" })));
f = E.apply(f, { type: "deal" });
let raises = 0;
while (E.legal(f).canRaise && raises < 10) { f = E.apply(f, { type: "raise", to: E.legal(f).minTo }); raises++; }
eq(f.bets, counts["Bets in a fixed-limit round before the cap"], "Bets in a fixed-limit round before the cap");

// Table size: 9 seats (you + 8 computers) is accepted.
let nine = E.newGame({ seed: 1 }, Array.from({ length: counts["Most players at the table"] }, (_, i) => ({ name: "P" + i, kind: "bot" })));
nine = E.apply(nine, { type: "deal" });
eq(nine.seats.filter((p) => p.hole.length === 2).length, counts["Most players at the table"], "Most players at the table");

if (failures.length) {
  console.log(`rules-doc.test: ${passed} passed, ${failures.length} FAILED`);
  failures.forEach((f) => console.log("  FAIL " + f));
  process.exit(1);
} else console.log(`rules-doc.test: all ${passed} passed`);
