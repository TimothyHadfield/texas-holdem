/* ============================================================================
 * improve.test.js — the pieces the 2026-10-27 improvement pass leans on.
 *     node tests/improve.test.js
 *  - Undo / Replay: replaying a hand's log from the table just before the deal
 *    gives back exactly the same states (the engine is pure + seeded), for
 *    hundreds of real computer-vs-computer hands in all three betting kinds;
 *  - the guided first game's deal (HoldemCoach.SEED) still gives you A-K;
 *  - Profile: game results, the Daily setup, the level ratings;
 *  - limit Hard always returns a legal move.
 * ==========================================================================*/
const P = require("../js/poker.js");
const E = require("../js/engine.js");
const B = require("../js/bots.js");
const HC = require("../js/coach-holdem.js");
const HP = require("../js/profile-holdem.js");

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log("FAIL", name); } }

// the same mapping js/play.js uses for Undo and Replay
const ACTS = new Set(["fold", "check", "call", "bet", "raise"]);
const toAction = (e) => (e.type === "bet" || e.type === "raise" ? { type: "raise", to: e.to } : { type: e.type });
function rebuild(pre, full) {
  let s = E.apply(pre, { type: "deal" });
  const out = [s];
  while (s.log.length < full.log.length) {
    const e = full.log[s.log.length];
    if (!e || !ACTS.has(e.type) || e.seat !== s.toAct) break;
    s = E.apply(s, toAction(e));
    out.push(s);
  }
  return out;
}

// ---- Undo / Replay rebuild matches the live hand, state for state
for (const betting of ["nl", "pl", "fl"]) {
  let hands = 0, same = 0, everyStep = true;
  for (let g = 0; g < 20; g++) {
    const players = [{ name: "You", kind: "bot", level: "hard" }, { name: "A", kind: "bot", level: "medium" }, { name: "B", kind: "bot", level: "easy" }, { name: "C", kind: "bot", level: "hard" }];
    let s = E.newGame({ seed: 5000 + g, betting, format: "cash", sb: 10, bb: 20, startStack: 2000 }, players);
    for (let h = 0; h < 10; h++) {
      for (const p of s.seats) if (p.stack === 0) s = E.apply(s, { type: "rebuy", seat: p.i });
      const pre = s;
      s = E.apply(s, { type: "deal" });
      const live = [s];
      const rand = P.rng32((s.cfg.seed + s.hand * 977) >>> 0);
      let guard = 0;
      while (s.street !== "done" && guard++ < 400) {
        const d = B.decide(E.view(s, s.toAct), s.seats[s.toAct].level, rand);
        s = E.apply(s, d.action);
        live.push(s);
      }
      hands++;
      const rb = rebuild(pre, s);
      const last = rb[rb.length - 1];
      if (JSON.stringify(last) === JSON.stringify(s)) same++;
      // Undo stops at any of your earlier decisions: each rebuilt state must be the live one
      for (const r of rb) {
        const l = live.find((x) => x.log.length === r.log.length);
        if (!l || JSON.stringify(l) !== JSON.stringify(r)) everyStep = false;
      }
      // a finished hand has already counted itself (play.js preOk)
      ok(pre.hand + 1 === s.hand, `${betting}: s.hand goes up by one when the hand ends`);
    }
  }
  ok(same === hands, `${betting}: replaying the log rebuilds the final state (${same}/${hands} hands)`);
  ok(everyStep, `${betting}: every rebuilt step equals the live state`);
}

// ---- guided first game: you hold A-K and the flop pairs your king
{
  const players = [{ name: "You", kind: "human" }, { name: "Ada", kind: "bot", level: "easy" }];
  let s = E.newGame({ seed: HC.SEED, betting: "nl", format: "cash", sb: 10, bb: 20, startStack: 2000, ante: 0, anteType: "each", levelHands: 10, anteFromLevel: 99 }, players);
  s = E.apply(s, { type: "deal" });
  const hole = s.seats[0].hole.map(P.cardStr);
  ok(hole.map((c) => c[0]).sort().join("") === "AK", `tutorial deal is A-K (got ${hole.join(" ")})`);
  ok(s.toAct === 0, "tutorial: you act first before the flop");
  ok(HC.steps({ state: () => s, overlay: () => true }).length === 11, "tutorial has 11 steps");
  const R = HC.rules();
  ok(R.sections.length === 8 && R.sections.every((x) => x.id && x.title && x.html), "rules sheet: 8 sections, all filled");
}

// ---- profile: results, daily, ratings
{
  const r1 = HP.result({ format: "tourney", levels: ["easy", "hard", "medium"], players: 4, place: 1, netBB: 0, bigPot: 40.4, best: 5, helped: false });
  ok(r1.won && r1.mode === "computer" && r1.level === "hard" && r1.extra.bigPot === 40, "tournament win vs the table's strongest computer");
  const r2 = HP.result({ format: "tourney", levels: ["medium"], players: 2, place: 2, helped: true });
  ok(!r2.won && r2.mode === "help" && r2.level === null, "Hint/Undo makes the game unrated");
  const r3 = HP.result({ format: "cash", levels: ["easy"], players: 2, netBB: 0 });
  ok(!r3.won && r3.draw, "cash: break even is a draw");
  const r4 = HP.result({ format: "cash", levels: ["easy"], players: 2, netBB: 12.6 });
  ok(r4.won && r4.score === 13, "cash: up is a win, score = BB won");
  const d1 = HP.dailySetup(20261027), d2 = HP.dailySetup(20261027), d3 = HP.dailySetup(20261028);
  ok(JSON.stringify(d1) === JSON.stringify(d2), "Daily: same day, same game");
  ok(d1.levels.slice().sort().join() === "easy,hard,hard,medium,medium" && d1.format === "tourney", "Daily: 5 computers, tournament");
  ok(d1.seed !== d3.seed, "Daily: next day, new deal");
  const L = HP.LEVELS.map((l) => l.rating);
  ok(L[0] < L[1] && L[1] < L[2], "ratings go up with level");
  const names = new Set(HP.achievements.map((a) => a.id));
  ok(names.size === HP.achievements.length, "achievement ids are unique");
}

// ---- limit Hard: always a legal move, many spots
{
  let bad = 0, n = 0;
  for (let g = 0; g < 200; g++) {
    const players = [0, 1, 2].map((i) => ({ name: "p" + i, kind: "bot", level: i === 0 ? "hard" : "medium" }));
    let s = E.newGame({ seed: 777 + g, betting: "fl", format: "cash", sb: 1, bb: 2, startStack: 200 }, players);
    s = E.apply(s, { type: "deal" });
    const rand = P.rng32(g + 1);
    let guard = 0;
    while (s.street !== "done" && guard++ < 200) {
      const d = B.decide(E.view(s, s.toAct), s.seats[s.toAct].level, rand);
      if (s.toAct === 0) n++;
      try { s = E.apply(s, d.action); } catch (e) { bad++; break; }
    }
  }
  ok(bad === 0 && n > 300, `limit Hard: ${n} decisions, ${bad} illegal`);
}

console.log(fail ? `improve.test: ${pass} passed, ${fail} FAILED` : `improve.test: all ${pass} passed`);
process.exit(fail ? 1 : 0);
