/* fx.test.js — table sounds, animations and celebrations (js/table-fx.js + js/fx.js).
 *   node tests/fx.test.js
 * Plays short scripted hands with the real engine and checks which sounds,
 * animations and celebrations each state change produces, and that the
 * Sound / Animations / Celebrations switches turn them off. */
let passed = 0;
const failures = [];
const ok = (c, w) => { if (c) passed++; else failures.push(w); };

// ---- fake Web Audio (counts nodes), so FX.play really runs in node
let nodes = 0;
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const node = (x) => { nodes++; return Object.assign({ connect() {}, disconnect() {} }, x); };
const src = () => node({ start() {}, stop() {} });
let clock = 0;
class FakeAC {
  constructor() { this.sampleRate = 8000; this.state = "running"; this.destination = {}; }
  get currentTime() { return clock; }
  createGain() { return node({ gain: param() }); }
  createOscillator() { return Object.assign(src(), { frequency: param() }); }
  createBufferSource() { return src(); }
  createBiquadFilter() { return node({ frequency: param(), Q: param() }); }
  createStereoPanner() { return node({ pan: param() }); }
  createDynamicsCompressor() { return node({}); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
  resume() { return Promise.resolve(); }
}
globalThis.AudioContext = FakeAC;
globalThis.localStorage = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; })();

require("../js/fx.js");
const FX = globalThis.FX;
FX.init({ game: "holdem", clicks: false });
FX.unlock();
const P = require("../js/poker.js");
const E = require("../js/engine.js");
const TF = require("../js/table-fx.js");

const cfg = (o) => Object.assign({ betting: "nl", format: "cash", sb: 10, bb: 20, startStack: 2000, seed: 7, ante: 0, anteType: "each", levelHands: 10, anteFromLevel: 99 }, o);
const players = (n) => [{ name: "You", kind: "human" }].concat(Array.from({ length: n - 1 }, (_, i) => ({ name: "B" + i, kind: "bot", level: "medium" })));

/** Run the plan for every state change; returns the sounds, animations and celebrations it asked for. */
function trace(states) {
  const out = { sounds: [], anims: [], celebrate: [] };
  for (let k = 1; k < states.length; k++) {
    const p = TF.plan(states[k - 1], states[k], 0);
    out.sounds.push(...p.sounds.map((x) => x.name));
    out.anims.push(...p.anims.map((x) => x.kind));
    if (p.celebrate) out.celebrate.push(p.celebrate.kind);
  }
  return out;
}
const count = (arr, n) => arr.filter((x) => x === n).length;

// ---- (a) a checked-down two-player hand: shuffle, 4 cards dealt, chips, knocks, 5 board flips, your turn, coins
{
  const st = [TF.SETUP];
  let s = E.newGame(cfg(), players(2));
  s = E.apply(s, { type: "deal" }); st.push(s);
  let guard = 0;
  while (s.street !== "done" && guard++ < 40) {
    const L = E.legal(s);
    s = E.apply(s, { type: L.canCheck ? "check" : "call" });
    st.push(s);
  }
  const t = trace(st);
  ok(count(t.sounds, "shuffle") === 1, "one shuffle per hand: " + t.sounds.join(","));
  ok(count(t.sounds, "cardDeal") === 4, "a deal sound per hole card (4): " + count(t.sounds, "cardDeal"));
  ok(count(t.sounds, "cardFlip") >= 5 + 2, "5 board flips + the opponent's 2 cards turned over at showdown: " + count(t.sounds, "cardFlip"));
  ok(count(t.sounds, "knock") >= 3, "checks knock: " + count(t.sounds, "knock"));
  ok(t.sounds.includes("chip") || t.sounds.includes("chips"), "a call or blind makes chips");
  ok(count(t.sounds, "coins") === 1, "pot pushed to the winner once");
  ok(t.sounds.includes("turn"), "your-turn chime");
  ok(t.anims.includes("sweep") && t.anims.includes("push"), "bets swept to the pot and the pot pushed: " + t.anims.join(","));
  ok(t.celebrate.length === 0 || t.celebrate.every((k) => k === "big") === true, "no win/lose celebration in a cash hand");
  // the turn chime only when it BECOMES your turn
  let chimes = 0;
  for (let k = 1; k < st.length; k++) if (TF.plan(st[k - 1], st[k], 0).sounds.some((x) => x.name === "turn")) chimes++;
  const becomes = st.filter((x, k) => k > 0 && x.toAct === 0 && x.street !== "done" && (st[k - 1] === TF.SETUP || st[k - 1].toAct !== 0 || st[k - 1].street !== x.street)).length;
  ok(chimes === becomes && chimes > 0, `turn chime ${chimes} times, became your turn ${becomes} times`);
  // the same state twice (an online snapshot repeat) makes nothing
  const same = TF.plan(st[3], JSON.parse(JSON.stringify(st[3])), 0);
  ok(same.sounds.length === 0 && same.anims.length === 0, "a repeated snapshot is silent");
  // first render after a reload (no previous state) is silent
  const fresh = TF.plan(null, st[3], 0);
  ok(fresh.sounds.length === 0 && fresh.anims.length === 0, "a page reload mid-hand is silent");
}

// ---- fold: card slide
{
  let s = E.newGame(cfg(), players(3));
  const a = E.apply(s, { type: "deal" });
  let b = a, guard = 0;
  while (b.toAct !== 0 && guard++ < 5) b = E.apply(b, { type: "call" });
  const c = E.apply(b, { type: "fold" });
  const p = TF.plan(b, c, 0);
  ok(p.sounds.some((x) => x.name === "cardSlide"), "a fold slides the cards: " + p.sounds.map((x) => x.name));
  ok(p.anims.some((x) => x.kind === "fold" && x.seat === 0), "your fold animates your cards");
}

// ---- raise: chips + bet slide; all-in called before the river: drumroll, then the board
{
  let s = E.apply(E.newGame(cfg({ seed: 11 }), players(2)), { type: "deal" });
  const L = E.legal(s);
  const r = E.apply(s, { type: "raise", to: L.minTo });
  const p1 = TF.plan(s, r, 0);
  ok(p1.sounds.some((x) => x.name === "chips"), "a raise sounds like chips");
  ok(p1.anims.some((x) => x.kind === "bet"), "a raise slides chips out");
  const sh = E.apply(r, { type: "allin" });
  const done = E.apply(sh, { type: "call" });
  ok(done.street === "done" && done.board.length === 5, "all-in runout reaches showdown");
  const p2 = TF.plan(sh, done, 0);
  const names = p2.sounds.map((x) => x.name);
  ok(names.includes("drumroll"), "all-in runout has a drumroll: " + names.join(","));
  const dr = p2.sounds.find((x) => x.name === "drumroll").at;
  const flips = p2.sounds.filter((x) => x.name === "cardFlip" && x.board);
  ok(flips.length === 5 && flips.every((x) => x.at > dr), "board cards flip after the drumroll");
  ok(Object.keys(p2.board).length === 5 && p2.board[4] > p2.board[0], "board cards are revealed one street at a time");
  // the winner of a 100 BB pot gets the big moment (if it's you) — the pot here is 4000 = 200 BB
  const heroWon = done.result.pots.some((pt) => pt.winners.includes(0));
  ok(heroWon ? p2.celebrate && p2.celebrate.kind === "big" : !p2.celebrate, "big pot won by you = big celebration");
}

// ---- (c) tournament over: win for you, lose for the others
{
  let seenWin = false, seenLose = false;
  for (let seed = 1; seed < 60 && !(seenWin && seenLose); seed++) {
    let s = E.apply(E.newGame(cfg({ format: "tourney", seed, startStack: 400 }), players(2)), { type: "deal" });
    let prev = s, guard = 0, cel = [];
    while (!s.over && guard++ < 400) {
      if (s.street === "done") { s = E.apply(s, { type: "deal" }); }
      else s = E.apply(s, { type: E.legal(s).canRaise ? "allin" : E.legal(s).canCheck ? "check" : "call" });
      const p = TF.plan(prev, s, 0);
      if (p.celebrate) cel.push(p.celebrate.kind);
      prev = s;
    }
    if (!s.over) continue;
    const want = s.winner === 0 ? "win" : "lose";
    ok(cel.filter((k) => k !== "big").length === 1 && cel.includes(want), `seed ${seed}: game over celebrates ${want} once (got ${cel.join(",")})`);
    if (want === "win") seenWin = true; else seenLose = true;
  }
  ok(seenWin && seenLose, "both a won and a lost tournament were checked");
}

// ---- (b) switches: Sound off = no sound; Animations off = no animation and no card delays
{
  const s0 = E.apply(E.newGame(cfg({ seed: 3 }), players(4)), { type: "deal" });
  const s1 = E.apply(s0, { type: "call" });
  const p0 = TF.plan(TF.SETUP, s0, 0), p1 = TF.plan(s0, s1, 0);
  const p = { sounds: p0.sounds.concat(p1.sounds), anims: p0.anims.concat(p1.anims), celebrate: null, board: {} };
  const ran = { anims: 0 };
  const dom = { anim: () => { ran.anims++; } };
  const run = () => { const n0 = nodes; ran.anims = 0; TF.run(p, { later: (ms, f) => f(), dom }); clock += 5; return { audio: nodes - n0, anims: ran.anims }; };
  FX.reset(); FX.unlock();
  const on = run();
  ok(on.audio > 0, "sound on: audio nodes made " + on.audio);
  ok(on.anims > 0, "animations on: animations ran " + on.anims);
  ok(TF.delayK() > 0, "animations on: cards have deal delays");
  FX.set("sound", false);
  ok(run().audio === 0, "sound off: no audio at all");
  FX.set("sound", true); FX.set("moves", false);
  ok(run().audio === 0, "game sounds off: no card/chip sounds");
  FX.set("moves", true);
  FX.set("animations", false);
  ok(run().anims === 0, "animations off: nothing animates");
  ok(TF.delayK() === 0, "animations off: no card delays");
  FX.set("animations", true); FX.set("animSpeed", "fast");
  ok(TF.delayK() > 0 && TF.delayK() < 0.6, "fast speed shortens delays: " + TF.delayK());
  // celebrations switch
  let celebrated = 0;
  const real = FX.celebrate;
  FX.celebrate = (o) => { celebrated++; return real(o); };
  FX.reset(); FX.unlock();
  TF.run({ sounds: [], anims: [], celebrate: { kind: "win" }, board: {}, deal0: 0 }, { later: (ms, f) => f(), dom });
  ok(celebrated === 1, "game over calls FX.celebrate");
  FX.celebrate = real;
  FX.reset();
}

console.log(`fx.test: ${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log("  FAIL " + f)); process.exit(1); }
