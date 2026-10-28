/* ============================================================================
 * variants.test.js — the game types besides Texas Hold'em:
 *   short   Short-deck (6+) Hold'em: 36 cards, flush beats full house, A-6-7-8-9 is a straight
 *   pineapple  3 hole cards, discard one after the betting before the flop
 *   crazy      Crazy Pineapple: 3 hole cards, discard one after the betting on the flop
 *   omaha      Omaha: 4 hole cards, a hand uses exactly two of them and three from the board
 *     node tests/variants.test.js
 * ==========================================================================*/
const P = require("../js/poker.js");
const E = require("../js/engine.js");
const B = require("../js/bots.js");
const C = P.parseCards;

let passed = 0;
const failures = [];
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function eq(a, b, what) { ok(JSON.stringify(a) === JSON.stringify(b), `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
const names = (n) => Array.from({ length: n }, (_, i) => ({ name: "P" + i, kind: "bot" }));

// ------------------------------------------------ short deck rankings
{
  const S = (h, b) => P.score("short", C(h), C(b));
  const flush = S("Ah 2h", "9h 7h 6h Kc Kd");   // (2h can't exist in a short deck, but the evaluator doesn't care)
  const boat = S("Kh Ks", "Kc 9d 9s 7c 6d");
  ok(flush > boat, "short deck: flush beats full house");
  ok(P.score("holdem", C("Ah 2h"), C("9h 7h 6h Kc Kd")) < P.score("holdem", C("Kh Ks"), C("Kc 9d 9s 7c 6d")), "hold'em: full house beats flush (unchanged)");
  const wheel = S("Ac 6d", "7h 8s 9c Kd Qd");
  ok(P.category(wheel) === 4, "short deck: A-6-7-8-9 is a straight");
  ok(P.describeFor(wheel, "short") === "Straight, Nine high", "short deck: A-6-7-8-9 is nine high: " + P.describeFor(wheel, "short"));
  ok(P.category(P.score("holdem", C("Ac 6d"), C("7h 8s 9c Kd Qd"))) === 0, "hold'em: A-6-7-8-9 is not a straight");
  const six = S("Tc 6d", "7h 8s 9c Kd Ad");
  ok(six > wheel, "short deck: 6-to-10 beats A-6-7-8-9");
  ok(wheel > S("9d 9h", "9c Kd Qd 7s 6h"), "short deck: a straight still beats three of a kind");
  ok(S("Ah Kh", "Qh Jh Th 9c 9d") > S("Qs Qd", "Qc Qh 9s 7d 6c"), "short deck: straight flush beats four of a kind");
  ok(S("9s 9d", "9c 9h Ad 7d 6c") > flush, "short deck: four of a kind beats a flush");
  ok(P.describeFor(flush, "short").startsWith("Flush"), "short deck: flush named a flush: " + P.describeFor(flush, "short"));
  ok(P.describeFor(boat, "short").startsWith("Full house"), "short deck: full house named a full house: " + P.describeFor(boat, "short"));
  eq(P.stdCategory(flush, "short"), 5, "short deck: flush is category 5 in plain words");
  eq(P.stdCategory(boat, "short"), 6, "short deck: full house is category 6 in plain words");
  const deck = P.deckFor("short");
  eq(deck.length, 36, "short deck has 36 cards");
  ok(deck.every((c) => P.rankOf(c) >= 4), "short deck: no 2 to 5");
}

// ------------------------------------------------ omaha: exactly two from the hand, three from the board
{
  const O = (h, b) => P.score("omaha", C(h), C(b));
  // four hearts on the board, one heart in hand: no flush in Omaha
  ok(P.category(O("Ah Kc Qd 2s", "9h 7h 4h 3h Jc")) !== 5, "omaha: one suited card + four on the board is no flush");
  ok(P.category(O("Ah Kh Qd 2s", "9h 7h 4c 3d Jc")) !== 5, "omaha: two suited cards + two on the board is no flush");
  ok(P.category(O("Ah Kh Qd 2s", "9h 7h 4h 3d Jc")) === 5, "omaha: two hearts in hand + three on the board is a flush");
  // the board's straight doesn't count by itself
  ok(P.category(O("2c 2d 3c 3d", "Ah Kd Qs Jc Th")) < 4, "omaha: a straight on the board alone isn't yours");
  // trips in the hand are only a pair
  ok(P.category(O("Ac Ad Ah 2s", "Kd 9c 7s 5h 3d")) === 1, "omaha: three aces in hand play as one pair");
  // board quads: you use only three of them
  eq(P.category(O("Ac Kd 2s 3s", "9c 9d 9h 9s 5h")), 3, "omaha: four nines on the board play as three nines (two cards must come from the hand)");
  ok(P.describeFor(O("Ah Kh Qd 2s", "9h 7h 4h 3d Jc"), "omaha").startsWith("Flush"), "omaha: names the flush");
}

// ------------------------------------------------ engine: deal sizes
function playOut(s, choose) {
  let guard = 0;
  while (s.street !== "done" && guard++ < 400) {
    const L = E.legal(s);
    s = E.apply(s, choose(s, L));
  }
  return s;
}
const passive = (s, L) => (L.discard ? { type: "discard", card: s.seats[s.toAct].hole[0] } : { type: L.canCheck ? "check" : "call" });
{
  const st = (g, n) => E.apply(E.newGame({ seed: 5, game: g }, names(n)), { type: "deal" });
  eq(st("holdem", 4).seats[0].hole.length, 2, "hold'em deals 2");
  eq(st("short", 4).seats[0].hole.length, 2, "short deck deals 2");
  eq(st("pineapple", 4).seats[0].hole.length, 3, "pineapple deals 3");
  eq(st("crazy", 4).seats[0].hole.length, 3, "crazy pineapple deals 3");
  eq(st("omaha", 4).seats[0].hole.length, 4, "omaha deals 4");
  const sd = st("short", 6);
  ok(sd.deck.concat(...sd.seats.map((p) => p.hole)).every((c) => P.rankOf(c) >= 4), "short deck engine: no 2 to 5 dealt");
  eq(sd.deck.length + 12, 36, "short deck engine: 36 cards");
  // hold'em with no game set deals exactly as before (same seed, same cards)
  const a = E.apply(E.newGame({ seed: 416 }, names(2)), { type: "deal" });
  const b = E.apply(E.newGame({ seed: 416, game: "holdem" }, names(2)), { type: "deal" });
  eq(a.seats.map((p) => p.hole), b.seats.map((p) => p.hole), "hold'em deal unchanged by the game option");
}

// ------------------------------------------------ pineapple: discard after the preflop betting, before the flop
{
  let s = E.apply(E.newGame({ seed: 8, game: "pineapple" }, names(3)), { type: "deal" });
  ok(!E.legal(s).discard, "pineapple: no discard before the preflop betting");
  // everyone calls / checks preflop
  while (!E.legal(s).discard) { const L = E.legal(s); s = E.apply(s, { type: L.canCheck ? "check" : "call" }); }
  eq(s.street, "preflop", "pineapple: discards happen before the flop is dealt");
  eq(s.board.length, 0, "pineapple: no board yet while discarding");
  const first = s.toAct;
  ok(first === (s.button + 1) % 3, "pineapple: discards start left of the button");
  let threw = false;
  try { E.apply(s, { type: "check" }); } catch (e) { threw = e.code === "illegal"; }
  ok(threw, "pineapple: betting is refused during the discard");
  threw = false;
  try { E.apply(s, { type: "discard", card: s.seats[(first + 1) % 3].hole[0] }); } catch (e) { threw = e.code === "illegal"; }
  ok(threw, "pineapple: can't discard a card you don't hold");
  const gone = s.seats[first].hole[2];
  s = E.apply(s, { type: "discard", card: gone });
  eq(s.seats[first].hole.length, 2, "pineapple: two cards left after the discard");
  ok(!s.seats[first].hole.includes(gone), "pineapple: the discarded card is gone");
  // the discard is face down: other seats can't see it
  const v = E.view(s, (first + 1) % 3);
  ok(!JSON.stringify(v.seats[first].discards || []).includes(String(gone)) || (v.seats[first].discards || []).every((c) => c === null), "pineapple: others can't see the discard");
  while (E.legal(s) && E.legal(s).discard) s = E.apply(s, { type: "discard", card: s.seats[s.toAct].hole[0] });
  eq(s.street, "flop", "pineapple: flop dealt after the last discard");
  ok(s.seats.every((p) => p.hole.length === 2), "pineapple: everyone holds two on the flop");
  s = playOut(s, passive);
  eq(s.street, "done", "pineapple: hand finishes");
  ok(Object.keys(s.result.scores).length === 3, "pineapple: three hands at showdown");
}

// ------------------------------------------------ crazy pineapple: discard after the flop betting
{
  let s = E.apply(E.newGame({ seed: 9, game: "crazy" }, names(3)), { type: "deal" });
  let sawDiscardOn = null;
  s = playOut(s, (s, L) => { if (L.discard && !sawDiscardOn) sawDiscardOn = { street: s.street, board: s.board.length, hole: s.seats[s.toAct].hole.length }; return passive(s, L); });
  eq(sawDiscardOn, { street: "flop", board: 3, hole: 3 }, "crazy pineapple: three cards on the flop, discard before the turn");
  eq(s.street, "done", "crazy pineapple: hand finishes");
}

// ------------------------------------------------ all in before the discard: the discard still happens
{
  let s = E.apply(E.newGame({ seed: 12, game: "pineapple" }, names(2)), { type: "deal" });
  s = E.apply(s, { type: "allin" });
  s = E.apply(s, { type: "call" });
  ok(E.legal(s) && E.legal(s).discard, "pineapple all in: still asked to discard");
  s = playOut(s, passive);
  eq(s.street, "done", "pineapple all in: runs out after the discards");
  ok(s.seats.every((p) => p.hole.length === 2), "pineapple all in: two cards each at showdown");
}

// ------------------------------------------------ omaha showdown uses two-plus-three
{
  let s = E.apply(E.newGame({ seed: 4, game: "omaha", betting: "pl" }, names(2)), { type: "deal" });
  // rig: seat 0 has one heart, seat 1 has two hearts; board has three... four hearts
  s.seats[0].hole = C("Ah Kc Qd 2s"); s.seats[1].hole = C("3h 4h 5c 6d");
  const rest = P.remainingDeck(C("Ah Kc Qd 2s 3h 4h 5c 6d 9h 7h Jh Th 8c"));
  s.deck = [rest[0], ...C("9h 7h Jh"), rest[1], ...C("Th"), rest[2], ...C("8c")];
  s = playOut(s, passive);
  // seat 0: needs two hand cards: A K + J T 9? A-K-J-T-9 no; best is K Q + J T 9 = straight K high; seat 1: 3h 4h + 9h 7h Jh flush... or 3h4h + 9h Jh Th = flush J high
  ok(s.result.pots[0].winners[0] === 1, "omaha: two hearts in hand make the flush and win");
  ok(/Flush/.test(s.result.names[1]), "omaha: winner's hand is a flush: " + s.result.names[1]);
}

// ------------------------------------------------ chips are never created or lost, every type, every level
for (const g of ["short", "pineapple", "crazy", "omaha"]) {
  const rand = P.rng32(77 + g.length);
  let bad = 0, illegal = 0, hands = 0;
  for (let k = 0; k < 40; k++) {
    const n = 2 + (k % 5);
    const lv = ["easy", "medium", "hard"];
    let s = E.newGame({ seed: 1000 + k, game: g, betting: ["nl", "pl", "fl"][k % 3], format: k % 2 ? "cash" : "tourney" }, names(n).map((p, i) => Object.assign(p, { level: lv[i % 3] })));
    const total0 = s.seats.reduce((a, p) => a + p.stack, 0);
    for (let h = 0; h < 6 && !s.over; h++) {
      if (s.seats.filter((p) => !p.out && p.stack > 0).length < 2) break;
      s = E.apply(s, { type: "deal" });
      let guard = 0;
      while (s.street !== "done" && guard++ < 300) {
        const v = E.view(s, s.toAct);
        const d = B.decide(v, s.seats[s.toAct].level, rand);
        try { s = E.apply(s, d.action); } catch (e) { illegal++; s = E.apply(s, passive(s, E.legal(s))); }
      }
      hands++;
      if (s.street !== "done") bad++;
      if (s.seats.reduce((a, p) => a + p.stack, 0) !== total0) bad++;
      if (s.cfg.format === "cash" && s.seats.some((p) => p.stack === 0)) break;
    }
  }
  eq(bad, 0, `${g}: every hand finishes with all chips accounted for`);
  eq(illegal, 0, `${g}: computers never make an illegal move`);
  ok(hands > 40, `${g}: hands played (${hands})`);
}

// ------------------------------------------------ the bots' discard is sensible
{
  // pineapple, holding A-A-2: keep the aces
  const s0 = E.newGame({ seed: 1, game: "pineapple" }, names(2));
  let s = E.apply(s0, { type: "deal" });
  while (!E.legal(s).discard) { const L = E.legal(s); s = E.apply(s, { type: L.canCheck ? "check" : "call" }); }
  s.seats[s.toAct].hole = C("Ac 2d Ad");
  for (const lv of ["medium", "hard"]) {
    const d = B.decide(E.view(s, s.toAct), lv, P.rng32(3));
    eq(d.action, { type: "discard", card: C("2d")[0] }, `pineapple ${lv}: keeps a pair of aces`);
  }
}

console.log(`variants.test: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
