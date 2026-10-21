/* ============================================================================
 * engine.test.js — betting rules, blinds, side pots, variants.
 *     node tests/engine.test.js
 * Hand-worked cases for each rule in docs/rules-check.md, then 20,000 random
 * hands of random legal actions checking that chips are never created or lost
 * and that every hand finishes.
 * ==========================================================================*/
const P = require("../js/poker.js");
const E = require("../js/engine.js");
const C = P.parseCards;

let passed = 0;
const failures = [];
function ok(cond, what) { if (cond) passed++; else failures.push(what); }
function eq(a, b, what) { ok(JSON.stringify(a) === JSON.stringify(b), `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function throws(fn, what) { try { fn(); failures.push(what + " (did not throw)"); } catch (e) { if (e.code === "illegal") passed++; else failures.push(what + ": " + e.message); } }

const names = (n) => Array.from({ length: n }, (_, i) => ({ name: "P" + i, kind: "bot" }));
function game(n, cfg) { return E.newGame(Object.assign({ seed: 3 }, cfg || {}), names(n)); }
const A = E.apply;
const total = (s) => s.seats.reduce((a, p) => a + p.stack + p.total * (s.street === "done" || s.street === "idle" ? 0 : 1), 0);

/** Deal, then force the cards: holes[i] for seat i, and the board to come. */
function rig(s, holes, board) {
  s = A(s, { type: "deal" });
  const used = [].concat(...holes, board);
  s.seats.forEach((p, i) => { if (holes[i]) p.hole = holes[i].slice(); });
  // deck: burn, flop(3), burn, turn, burn, river
  const rest = P.remainingDeck(used);
  s.deck = [rest[0], board[0], board[1], board[2], rest[1], board[3], rest[2], board[4]];
  return s;
}

// ------------------------------------------------ blinds and order (6 players)
{
  let s = A(game(6), { type: "deal" });
  const b = s.button;
  eq(s.sbSeat, (b + 1) % 6, "small blind left of button");
  eq(s.bbSeat, (b + 2) % 6, "big blind left of small blind");
  eq(s.seats[s.sbSeat].bet, 10, "small blind posted 10");
  eq(s.seats[s.bbSeat].bet, 20, "big blind posted 20");
  eq(s.toAct, (b + 3) % 6, "first to act preflop is left of the big blind");
  const L = E.legal(s);
  eq([L.toCall, L.minTo, L.maxTo], [20, 40, 2000], "NL preflop: call 20, min raise to 40, max all-in");
  // everybody calls, small blind completes, big blind has the option
  for (let k = 0; k < 4; k++) s = A(s, { type: "call" });
  eq(s.toAct, s.sbSeat, "small blind acts after the callers");
  s = A(s, { type: "call" });
  eq(s.toAct, s.bbSeat, "big blind gets the option");
  eq(E.legal(s).canCheck, true, "big blind may check");
  s = A(s, { type: "check" });
  eq(s.street, "flop", "flop dealt after the big blind checks");
  eq(s.board.length, 3, "three flop cards");
  eq(s.toAct, s.sbSeat, "first to act after the flop is left of the button");
  // the button moves one seat next hand
  for (let k = 0; k < 6; k++) s = A(s, { type: "check" });
  for (let k = 0; k < 6; k++) s = A(s, { type: "check" });
  for (let k = 0; k < 6; k++) s = A(s, { type: "check" });
  eq(s.street, "done", "hand over after the river");
  s = A(s, { type: "deal" });
  eq(s.button, (b + 1) % 6, "button moves one seat left");
}

// ------------------------------------------------ heads-up: button is the small blind
{
  let s = A(game(2), { type: "deal" });
  eq(s.sbSeat, s.button, "heads-up: the button posts the small blind");
  eq(s.toAct, s.button, "heads-up: the button acts first preflop");
  s = A(s, { type: "call" });
  s = A(s, { type: "check" });
  eq(s.toAct, s.bbSeat, "heads-up: the big blind acts first after the flop");
}

// ------------------------------------------------ going heads-up: nobody posts the big blind twice
{
  let s = game(3, { startStack: 1000 });
  s = A(s, { type: "deal" });
  const bbBefore = s.bbSeat;
  // the button busts: give the button's chips away so two players remain
  const btn = s.button;
  s = A(s, { type: "fold" }); s = A(s, { type: "fold" }); // hand ends
  s.seats[btn].stack = 0; s.seats[btn].out = true;
  s = A(s, { type: "deal" });
  ok(s.bbSeat !== bbBefore, "after going heads-up the last big blind does not post it again");
  eq(s.sbSeat, s.button, "heads-up: button is the small blind");
}

// ------------------------------------------------ min raise follows the last raise size
{
  let s = A(game(4), { type: "deal" });
  s = A(s, { type: "raise", to: 70 }); // raise of 50
  eq(E.legal(s).minTo, 120, "re-raise must be at least the last raise (70+50)");
  throws(() => A(s, { type: "raise", to: 100 }), "raise smaller than the last raise is illegal");
  s = A(s, { type: "raise", to: 200 }); // raise of 130
  eq(E.legal(s).minTo, 330, "after a 130 raise, next min is 330");
  throws(() => A(s, { type: "check" }), "can't check facing a bet");
}

// ------------------------------------------------ pot limit
{
  let s = A(game(4, { betting: "pl", sb: 1, bb: 2, startStack: 1000 }), { type: "deal" });
  eq(E.legal(s).maxTo, 7, "pot-limit: first raiser may raise to 7 with 1/2 blinds");
  s = A(s, { type: "raise", to: 7 });
  // pot now 1+2+7 = 10; next player calls 7 -> 17, raises 17 -> to 24
  eq(E.legal(s).maxTo, 24, "pot-limit: re-pot is to 24");
  throws(() => A(s, { type: "raise", to: 25 }), "over-pot raise is illegal");
}

// ------------------------------------------------ fixed limit sizes and the cap
{
  let s = A(game(4, { betting: "fl", sb: 10, bb: 20 }), { type: "deal" });
  let L = E.legal(s);
  eq([L.minTo, L.maxTo], [40, 40], "limit preflop raise is exactly one small bet");
  s = A(s, { type: "raise", to: 40 });
  s = A(s, { type: "raise", to: 60 });
  s = A(s, { type: "raise", to: 80 }); // bet + 3 raises = capped
  L = E.legal(s);
  eq(L.canRaise, false, "limit: capped after a bet and three raises");
  // a round capped with three players stays capped when one folds
  s = A(s, { type: "fold" });
  s = A(s, { type: "fold" });
  eq(s.seats.filter((p) => !p.folded).length, 2, "down to two players after the cap");
  ok(!E.legal(s).canRaise, "limit: capped round stays capped when it becomes heads-up");
  // cash game heads-up: no cap (Robert's Rules)
  let h = A(game(2, { betting: "fl" }), { type: "deal" });
  for (let k = 0; k < 6; k++) h = A(h, { type: "raise", to: h.currentBet + 20 });
  ok(E.legal(h).canRaise, "limit cash heads-up: no cap");
  // tournament heads-up in a hand but 3 still in the event: cap holds (TDA 50)
  let tt = A(game(3, { betting: "fl", format: "tourney" }), { type: "deal" });
  tt = A(tt, { type: "fold" });
  while (tt.bets < 4 && E.legal(tt).canRaise) tt = A(tt, { type: "raise", to: tt.currentBet + 20 });
  eq(tt.bets, 4, "tournament: reached the cap heads-up");
  ok(!E.legal(tt).canRaise, "limit tournament: cap holds heads-up while 3 are left in the event");
  // tournament with only two left in the event: no cap
  let t2 = A(game(2, { betting: "fl", format: "tourney" }), { type: "deal" });
  for (let k = 0; k < 5; k++) t2 = A(t2, { type: "raise", to: t2.currentBet + 20 });
  ok(E.legal(t2).canRaise, "limit tournament down to two players: no cap");
  // turn uses the big bet
  let t = A(game(2, { betting: "fl" }), { type: "deal" });
  t = A(t, { type: "call" }); t = A(t, { type: "check" }); // flop
  t = A(t, { type: "check" }); t = A(t, { type: "check" }); // turn
  eq(t.street, "turn", "reached the turn");
  eq(E.legal(t).minTo, 40, "limit turn bet is the big bet (2 x 20)");
}

// ------------------------------------------------ short all-in does not reopen the betting
{
  let s = game(3, { startStack: 1000 });
  s.seats[2].stack = 1000;
  s = A(s, { type: "deal" });
  // order: find seats
  const b = s.button, sb = s.sbSeat, bb = s.bbSeat;
  // Give the small blind only 100 behind after posting -> short all-in later.
  s.seats[sb].stack = 100 - 10;
  s = A(s, { type: "raise", to: 80 }); // button raises to 80 (raise of 60)
  eq(s.toAct, sb, "small blind to act");
  s = A(s, { type: "allin" }); // to 100: an increase of 20, less than 60
  s = A(s, { type: "call" }); // big blind calls 100
  eq(s.toAct, b, "back to the original raiser");
  const L = E.legal(s);
  eq(L.toCall, 20, "raiser owes 20");
  eq(L.canRaise, false, "short all-in did not reopen the raising for the raiser");
}

// ------------------------------------------------ side pots + showdown
{
  let s = game(3, { startStack: 1000 });
  s = rig(s, [C("Ah As"), C("Kh Ks"), C("Qh Qs")], C("2c 7d 9s 3h 4c"));
  // seat stacks: make three different all-ins
  const order = [s.toAct, (s.toAct + 1) % 3, (s.toAct + 2) % 3];
  void order;
  // set stacks so: AA short (100), KK medium (300), QQ deep (1000)
  const st = [100, 300, 1000];
  s.seats.forEach((p, i) => { p.stack = st[i] - p.total; });
  while (s.street !== "done") s = A(s, { type: "allin" }.type ? (E.legal(s).canRaise ? { type: "allin" } : { type: "call" }) : null);
  const r = s.result;
  eq(r.pots[0].amount, 300, "main pot 3 x 100");
  eq(r.pots[0].winners, [0], "AA takes the main pot");
  eq(r.pots[1].amount, 400, "side pot 2 x 200");
  eq(r.pots[1].winners, [1], "KK takes the side pot");
  eq(r.pots.reduce((a, p) => a + p.amount, 0) + s.seats[2].stack - 700, 700, "QQ keeps everything above 300 (uncalled chips come back)");
  eq(s.seats.map((p) => p.stack), [300, 400, 700], "final stacks");
}

// ------------------------------------------------ split pot with an odd chip
{
  let s = game(3, { sb: 5, bb: 10, startStack: 1000 });
  s = rig(s, [C("Ah 2c"), C("Ad 3c"), C("7s 8s")], C("Kc Qd Jh Th 4s")); // AK QJT -> both A-high straights
  const b = s.button;
  // button raises to 25, SB calls, BB folds: pot = 25+25+10 = 60 split evenly; make it odd
  s = A(s, { type: "raise", to: 25 });
  s = A(s, { type: "call" });
  s = A(s, { type: "call" });
  // all check down
  while (s.street !== "done") s = A(s, { type: "check" });
  const pot = s.result.pots[0];
  eq(pot.amount, 75, "pot 75");
  void b;
  eq(pot.winners.length, 2, "two straights split");
  const w = pot.winners;
  // first winner left of the button gets the odd chip
  eq(s.seats[w[0]].stack - (1000 - 25), 38, "odd chip to the first winner left of the button");
  eq(s.seats[w[1]].stack - (1000 - 25), 37, "other winner gets 37");
}

// ------------------------------------------------ everyone folds: no cards shown
{
  let s = A(game(3), { type: "deal" });
  s = A(s, { type: "fold" });
  s = A(s, { type: "fold" });
  eq(s.street, "done", "hand ends when all but one fold");
  eq(s.result.shown, [], "nobody shows when everyone folds");
  eq(s.seats[s.bbSeat].stack, 2010, "big blind wins the small blind");
}

// ------------------------------------------------ antes
{
  let s = A(game(4, { ante: 5, anteType: "each" }), { type: "deal" });
  eq(E.potTotal(s), 10 + 20 + 4 * 5, "everyone antes 5");
  eq(s.currentBet, 20, "antes don't count toward the bet to call");
  let b = A(game(4, { ante: 20, anteType: "bb" }), { type: "deal" });
  eq(b.seats[b.bbSeat].total, 40, "big blind ante: big blind pays blind + one ante");
  eq(E.potTotal(b), 50, "pot 10+20+20");
}

// ------------------------------------------------ view hides other hands
{
  const s = A(game(3), { type: "deal" });
  const v = E.view(s, 0);
  eq(v.deck, undefined, "deck hidden");
  ok(v.seats[0].hole.every((c) => c !== null), "own cards visible");
  ok(v.seats[1].hole.every((c) => c === null) && v.seats[2].hole.every((c) => c === null), "others hidden");
  ok(s.seats[1].hole[0] !== null, "original state untouched by view");
  // apply doesn't mutate
  const before = JSON.stringify(s);
  A(s, { type: "fold" });
  eq(JSON.stringify(s), before, "apply does not mutate its input");
}

// ------------------------------------------------ tournament: blinds rise, elimination, winner
{
  let s = game(3, { format: "tourney", sb: 10, bb: 20, levelHands: 2, startStack: 300 });
  s = A(s, { type: "deal" });
  eq(s.bb, 20, "level 1 big blind 20");
  const rand = P.rng32(5);
  let guard = 0;
  while (!s.over && guard++ < 2000) {
    if (s.street === "done" || s.street === "idle") { s = A(s, { type: "deal" }); continue; }
    s = A(s, E.legal(s).canRaise && rand() < 0.5 ? { type: "allin" } : { type: "call" });
    if (s.hand === 2 && s.street === "done") { const t = A(s, { type: "deal" }); eq(t.bb, 30, "level 2 after 2 hands"); }
  }
  ok(s.over, "tournament finishes");
  const pl = s.seats.map((p) => p.place).sort();
  // two busting in one hand with the same stack tie for 2nd ([1, 2, 2]); otherwise [1, 2, 3]
  ok(JSON.stringify(pl) === "[1,2,3]" || JSON.stringify(pl) === "[1,2,2]", "places 1-3 assigned: " + pl);
  eq(s.seats[s.winner].stack, 900, "winner holds every chip");
}

// ------------------------------------------------ two bust in one hand: bigger starting stack places higher
{
  let s = game(4, { format: "tourney", startStack: 1000 });
  s.seats[0].stack = 900; s.seats[1].stack = 300; s.seats[2].stack = 2000; s.seats[3].stack = 2000;
  s.button = 3; // so seat 0 is the small blind next hand
  s = rig(s, [C("7c 2d"), C("8c 3d"), C("Ac Ad"), C("Kc Kd")], C("As Ah 9s 5h 4c"));
  let g = 0;
  while (s.street !== "done" && g++ < 20) {
    const L = E.legal(s);
    s = A(s, s.toAct <= 1 ? { type: "allin" } : L.canCheck ? { type: "check" } : { type: "call" });
  }
  eq([s.seats[0].out, s.seats[1].out], [true, true], "both short stacks bust");
  eq(s.seats[0].place, 3, "same-hand busts: bigger starting stack (900) finishes 3rd");
  eq(s.seats[1].place, 4, "same-hand busts: smaller starting stack (300) finishes 4th");
}

// ------------------------------------------------ two bust in one hand with the same stack: they tie for the place
{
  let s = game(4, { format: "tourney", startStack: 1000 });
  s.seats[0].stack = 500; s.seats[1].stack = 500; s.seats[2].stack = 2000; s.seats[3].stack = 2000;
  s.button = 3;
  s = rig(s, [C("7c 2d"), C("8c 3d"), C("Ac Ad"), C("Kc Kd")], C("As Ah 9s 5h 4c"));
  let g = 0;
  while (s.street !== "done" && g++ < 20) {
    const L = E.legal(s);
    s = A(s, s.toAct <= 1 ? { type: "allin" } : L.canCheck ? { type: "check" } : { type: "call" });
  }
  eq([s.seats[0].out, s.seats[1].out], [true, true], "both equal short stacks bust");
  eq([s.seats[0].place, s.seats[1].place], [3, 3], "same-hand busts with equal starting stacks tie for 3rd");
  // the next one out finishes 2nd, the winner 1st
  s.seats[3].stack += s.seats[2].stack - 1; s.seats[2].stack = 1;
  g = 0;
  while (!s.over && g++ < 200) {
    if (s.street === "done") { s = A(s, { type: "deal" }); continue; }
    s = A(s, E.legal(s).canCheck ? { type: "check" } : { type: "call" });
  }
  eq(s.seats.map((p) => p.place).sort(), [1, 2, 3, 3], "places after a tie: 1, 2, 3, 3");
}

// ------------------------------------------------ "all in" in pot limit is capped at the pot
{
  let s = game(3, { betting: "pl", sb: 1, bb: 2, startStack: 1000 });
  s = A(s, { type: "deal" });
  const before = E.legal(s).maxTo;
  s = A(s, { type: "allin" });
  eq(s.currentBet, before, "pot-limit all in = pot-size raise when the stack is bigger");
}

// ------------------------------------------------ folded chips above every live player go to a real pot
{
  let s = game(3, { ante: 20, anteType: "bb", startStack: 1000 });
  s.seats.forEach((p) => { p.stack = 1000; });
  s = A(s, { type: "deal" });
  const bb = s.bbSeat;
  // the other two have 30 behind: shove, call, and the big blind (40 in with its ante) folds
  s.seats.forEach((p) => { if (p.i !== bb) { p.stack = 30 - p.bet; } });
  let g = 0;
  while (s.street !== "done" && g++ < 30) {
    const L = E.legal(s);
    s = A(s, s.toAct === bb ? (L.canCheck ? { type: "check" } : { type: "fold" }) : { type: "allin" });
  }
  eq(s.seats[bb].folded, true, "big blind folded");
  ok(s.result.pots.every((p) => p.eligible.length > 0), "no pot without an eligible player: " + JSON.stringify(s.result.pots.map((p) => p.eligible)));
  eq(s.result.pots.reduce((a, p) => a + p.amount, 0), 100, "all 100 chips are in winnable pots");
}

// ------------------------------------------------ random play: chips conserved, every hand ends
{
  const rand = P.rng32(99);
  let hands = 0, bad = "", stuck = 0;
  for (let g = 0; g < 400 && !bad; g++) {
    const n = 2 + Math.floor(rand() * 8);
    const betting = ["nl", "pl", "fl"][g % 3];
    let s = E.newGame({ seed: g + 1, betting, ante: g % 4 === 0 ? 5 : 0, anteType: g % 8 === 0 ? "bb" : "each", startStack: 200 + Math.floor(rand() * 2000) }, names(n));
    s.seats.forEach((p) => { p.stack = 50 + Math.floor(rand() * 2000); });
    const chips = s.seats.reduce((a, p) => a + p.stack, 0);
    for (let h = 0; h < 50 && !bad; h++) {
      if (s.seats.filter((p) => p.stack > 0).length < 2) break;
      s = A(s, { type: "deal" });
      let steps = 0;
      while (s.street !== "done") {
        if (++steps > 500) { stuck++; bad = "stuck"; break; }
        const L = E.legal(s);
        if (!L) { bad = "no legal actions mid-hand at " + s.street; break; }
        const r = rand();
        let a;
        if (r < 0.15 && L.toCall > 0) a = { type: "fold" };
        else if (r < 0.35 && L.canRaise) a = { type: "raise", to: L.minTo + Math.floor(rand() * (L.maxTo - L.minTo + 1)) };
        else if (r < 0.40 && L.canRaise) a = { type: "allin" };
        else a = { type: L.canCheck ? "check" : "call" };
        if (a.type === "allin" && s.cfg.betting !== "nl" && L.stack + L.bet > L.maxTo) a = { type: "raise", to: L.maxTo };
        s = A(s, a);
        const inPlay = s.seats.reduce((x, p) => x + p.stack + (s.street === "done" ? 0 : p.total), 0);
        if (inPlay !== chips) { bad = `chips changed ${chips} -> ${inPlay} (${betting})`; break; }
      }
      hands++;
      const after = s.seats.reduce((x, p) => x + p.stack, 0);
      if (!bad && after !== chips) bad = `after hand chips ${chips} -> ${after}`;
      if (!bad && s.seats.some((p) => p.stack < 0)) bad = "negative stack";
    }
  }
  eq(bad, "", "random play: chips conserved, no stuck hands");
  ok(hands > 8000, "random play covered " + hands + " hands");
  eq(stuck, 0, "no stuck hands");
}

void total;
if (failures.length) {
  console.log(`engine.test: ${passed} passed, ${failures.length} FAILED`);
  failures.forEach((f) => console.log("  FAIL " + f));
  process.exit(1);
}
console.log(`engine.test: all ${passed} passed`);
