/* ============================================================================
 * online.test.mjs — the Hold'em game object for the shared online layer.
 *     node tests/online.test.mjs
 * Bot-only games to the end (every variant), secrecy of hole cards and the
 * shuffle seed, JSON round trips, illegal moves, seat rotation, and a
 * createLocal room (js/online.js, unchanged copy) playing a tournament out.
 * ==========================================================================*/
import { createRequire } from "node:module";
import { createLocal } from "../js/online.js";
const require = createRequire(import.meta.url);
const { game, rotate } = require("../js/online-game.js");
const P = require("../js/poker.js");

let passed = 0;
const failures = [];
const ok = (c, what) => { if (c) passed++; else failures.push(what); };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clone = (x) => JSON.parse(JSON.stringify(x));

// 1. Bot-only tournaments to the end, every betting type, 2-9 seats.
let games = 0, hands = 0, bad = "";
for (let g = 0; g < 30 && !bad; g++) {
  const rng = mulberry(g + 1);
  const n = 2 + (g % 8);
  const opts = { level: ["easy", "medium", "hard"][g % 3], betting: ["nl", "pl", "fl"][(g / 3 | 0) % 3], format: "tourney", stack: 50, ante: ["none", "each", "bb"][g % 3] };
  let s = game.setup(n, opts, rng, Array.from({ length: n }, () => ({ kind: "computer" })));
  const chips = s.seats.reduce((a, p) => a + p.stack + p.total, 0);
  let steps = 0;
  while (!game.isOver(s) && steps++ < 40000) {
    const t = game.toAct(s);
    if (!t.length) { bad = `game ${g}: nobody to act`; break; }
    const seat = t[0];
    const ctx = { pub: game.publicView(s), mine: game.privateView(s, seat), state: s };
    const a = game.bot(ctx, seat, rng);
    if (a.type === "deal") hands++;
    try { s = game.apply(clone(s), seat, a, rng); } catch (e) { bad = `game ${g}: bot move ${JSON.stringify(a)} threw ${e.message}`; break; }
    if (JSON.stringify(clone(s)) !== JSON.stringify(s)) { bad = "state does not survive JSON"; break; }
    const now = s.seats.reduce((a2, p) => a2 + p.stack + (s.street === "done" ? 0 : p.total), 0);
    if (now !== chips) { bad = `game ${g}: chips ${now} != ${chips}`; break; }
  }
  if (!bad && !game.isOver(s)) bad = `game ${g} did not finish`;
  games++;
}
ok(!bad, "bot-only tournaments: " + bad);
ok(games === 30 && hands > 300, `30 tournaments, ${hands} hands`);

// 2. Secrecy: nobody's unshown cards, the deck, or the seed in public; private = own cards only.
{
  let s = game.setup(4, { betting: "nl" }, mulberry(9), [{ kind: "human", name: "A" }, { kind: "human", name: "B" }, { kind: "computer" }, { kind: "computer" }]);
  const pub = game.publicView(s);
  const pubStr = JSON.stringify(pub);
  ok(pub.deck === undefined, "no deck in public view");
  ok(pub.cfg.seed === undefined, "no shuffle seed in public view");
  ok(pub.seats.every((p) => p.hole.every((c) => c === null)), "public view hides every hole card");
  ok(!/"hole":\[\d/.test(pubStr), "no hole card numbers in public JSON");
  for (let i = 0; i < 4; i++) {
    const mine = game.privateView(s, i);
    ok(JSON.stringify(mine) === JSON.stringify({ hole: s.seats[i].hole }), `seat ${i} private view is only its own two cards`);
    for (let j = 0; j < 4; j++) if (j !== i) ok(!s.seats[j].hole.some((c) => mine.hole.includes(c)), `seat ${i} can't see seat ${j}`);
  }
}

// 3. Illegal moves throw: out of turn, deal mid-hand, junk.
{
  const s = game.setup(3, {}, mulberry(4), [{ kind: "human" }, { kind: "human" }, { kind: "human" }]);
  const other = (s.toAct + 1) % 3;
  const t = (fn) => { try { fn(); return false; } catch (e) { return true; } };
  ok(t(() => game.apply(clone(s), other, { type: "call" })), "acting out of turn throws");
  ok(t(() => game.apply(clone(s), s.toAct, { type: "deal" })), "dealing mid-hand throws");
  ok(t(() => game.apply(clone(s), s.toAct, { type: "rebuy", seat: 0 })), "rebuy as a move throws");
  ok(t(() => game.apply(clone(s), s.toAct, { type: "raise", to: 1 })), "too-small raise throws");
  ok(game.toAct(s).length === 1, "one seat to act during a hand");
}

// 4. Between hands every human may deal; cash game buys busted players back in.
{
  let s = game.setup(3, { format: "cash" }, mulberry(5), [{ kind: "human" }, { kind: "computer" }, { kind: "human" }]);
  while (s.street !== "done") s = game.apply(s, s.toAct, { type: E_legalFold(s) });
  ok(JSON.stringify(game.toAct(s)) === "[0,2]", "between hands both humans may deal: " + JSON.stringify(game.toAct(s)));
  s.seats[2].stack = 0;
  const s2 = game.apply(clone(s), 2, { type: "deal" });
  ok(s2.seats[2].buyIns === 2 && s2.street === "preflop", "busted cash player bought back in at the deal");
}
function E_legalFold(s) { const L = require("../js/engine.js").legal(s); return L.canCheck ? "check" : "fold"; }

// 5. Rotation: I am drawn at seat 0, and indices follow.
{
  let s = game.setup(4, {}, mulberry(12), [{ kind: "human", name: "A" }, { kind: "human", name: "B" }, { kind: "computer" }, { kind: "computer" }]);
  const me = 1;
  const r = rotate(game.publicView(s), game.privateView(s, me), me, null);
  ok(r.seats[0].name === "B", "my seat is drawn first");
  ok(JSON.stringify(r.seats[0].hole) === JSON.stringify(s.seats[1].hole), "my cards are visible to me");
  ok(r.seats[1].hole.every((c) => c === null), "others still hidden after rotation");
  ok(r.button === (s.button - me + 4) % 4 && r.toAct === (s.toAct - me + 4) % 4, "button and turn rotated");
  ok(r.log.every((e, k) => e.seat === (s.log[k].seat < 0 ? s.log[k].seat : (s.log[k].seat - me + 4) % 4)), "log seats rotated");
}

// 6. createLocal room: me + 3 computers, tournament, I always call; plays to the end.
await new Promise((resolve) => {
  const room = createLocal({ game, seats: ["human", "computer", "computer", "computer"], names: ["You"], options: { format: "tourney", stack: 50, betting: "nl" }, botDelayMs: 0, rng: mulberry(21) });
  let last = null, errs = 0, moves = 0;
  room.on("change", (snap) => {
    last = snap;
    if (snap.status === "finished") { done(); return; }
    if (snap.myTurn && moves++ < 20000) setTimeout(() => {
      const st = snap.pub;
      const a = st.street === "done" || st.street === "idle" ? { type: "deal" } : { type: "call" };
      const res = room.act(a);
      if (!res.ok) room.act({ type: "check" });
    }, 0);
  });
  room.on("error", () => errs++);
  room.start();
  const timer = setTimeout(done, 60000);
  function done() {
    clearTimeout(timer);
    room.close();
    ok(last && last.status === "finished", "local room tournament finished (status " + (last && last.status) + ")");
    ok(last && last.pub && last.pub.over && last.pub.seats.filter((p) => p.place === 1).length === 1, "one winner");
    resolve();
  }
});

void P;
if (failures.length) {
  console.log(`online.test: ${passed} passed, ${failures.length} FAILED`);
  failures.forEach((f) => console.log("  FAIL " + f));
  process.exit(1);
} else console.log(`online.test: all ${passed} passed`);
