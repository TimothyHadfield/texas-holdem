/* home.test.js — settle-up and ICM maths.   node tests/home.test.js */
const H = require("../js/homecalc.js");
let passed = 0;
const failures = [];
const ok = (c, w) => { if (c) passed++; else failures.push(w); };
const near = (a, b, t, w) => ok(Math.abs(a - b) <= t, `${w}: expected ${b}, got ${a}`);
const eq = (a, b, w) => ok(JSON.stringify(a) === JSON.stringify(b), `${w}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// ---- cash game: 4 players, $20 buy-in = 1000 chips
{
  const r = H.settle([
    { buyIns: 1, chips: 2500 }, // up $30
    { buyIns: 2, chips: 500 },  // paid 40, out 10 -> -30
    { buyIns: 1, chips: 1000 }, // even
    { buyIns: 1, chips: 1000 }, // even
  ], 20, 1000);
  eq(r.rows.map((x) => x.net), [3000, -3000, 0, 0], "nets in cents");
  eq(r.transfers, [{ from: 1, to: 0, cents: 3000 }], "one transfer settles it");
  eq(r.chipsCounted, r.chipsExpected, "chip count matches buy-ins");
  near(r.perChip, 0.02, 1e-12, "2 cents a chip");
}
// ---- money always balances, even with a miscount and awkward cents
{
  const r = H.settle([{ buyIns: 1, chips: 333 }, { buyIns: 1, chips: 333 }, { buyIns: 1, chips: 334 }], 10, 1000);
  eq(r.rows.reduce((a, x) => a + x.cashOut, 0), 3000, "cash out totals the money in exactly");
  eq(r.rows.reduce((a, x) => a + x.net, 0), 0, "nets sum to zero");
}
// ---- transfers: never more than n-1 payments, and they square everyone
{
  const nets = [5000, -1200, -800, 3000, -6000];
  const t = H.transfers(nets);
  ok(t.length <= nets.length - 1, "at most n-1 payments");
  const after = nets.slice();
  for (const x of t) { after[x.from] += x.cents; after[x.to] -= x.cents; }
  eq(after, [0, 0, 0, 0, 0], "everyone squared");
}
// ---- nothing counted yet: never "everyone is even"; say how far the count is
{
  const four = () => [0, 1, 2, 3].map(() => ({ buyIns: 1, chips: 0 }));
  const r = H.settle(four(), 20, 1000);
  eq(r.status, "uncounted", "all chips 0 -> not counted yet");
  eq(H.settleNote(r), "Chips counted: 0 of 4,000 — finish counting", "plain message for an empty count");
  const blank = H.settle([{ buyIns: 1, chips: "" }, { buyIns: 1, chips: "" }], 20, 1000);
  eq(blank.status, "uncounted", "blank chips -> not counted yet");
  const off = H.settle([{ buyIns: 1, chips: 1500 }, { buyIns: 1, chips: 0 }], 20, 1000);
  eq(off.status, "off", "some chips missing -> off");
  ok(/1,500 vs 2,000/.test(H.settleNote(off)), "miscount note names both totals: " + H.settleNote(off));
  const good = H.settle([{ buyIns: 1, chips: 1500 }, { buyIns: 1, chips: 500 }], 20, 1000);
  eq(good.status, "ok", "full count -> ok");
  eq(H.settleNote(good), "", "no note when the count matches");
}
// ---- ICM
{
  const v = H.icm([5000, 5000], [70, 30]);
  near(v[0], 50, 1e-9, "equal stacks split evenly");
  // worked by hand: stacks 5000/3000/2000, prizes 50/30/20 -> 38.393 / 33.214? (P1 below)
  const w = H.icm([5000, 3000, 2000], [50, 30, 20]);
  near(w[0], 50 * 0.5 + 30 * (0.3 * 5 / 7 + 0.2 * 5 / 8) + 20 * (1 - 0.5 - (0.3 * 5 / 7 + 0.2 * 5 / 8)), 1e-9, "ICM by hand, big stack");
  near(w.reduce((a, b) => a + b, 0), 100, 1e-9, "ICM shares add up to the prize pool");
  ok(w[0] < 50 && w[0] > 33.3, "chip leader gets less than chip share x pool would suggest... but more than equal");
  const z = H.icm([0, 4000, 6000], [60, 40]);
  near(z[0], 0, 1e-9, "no chips, no money");
}
// ---- chip value by colour
eq(H.chipValue([10, 4, 2], [{ value: 1 }, { value: 5 }, { value: 25 }]), 80, "10x1 + 4x5 + 2x25");

if (failures.length) { console.log(`home.test: ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log("  FAIL " + f)); process.exit(1); }
console.log(`home.test: all ${passed} passed`);
