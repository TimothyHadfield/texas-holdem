/* homecalc.js — maths for the home-game companion (pure, tested in Node).
 *   settle(players, perBuyIn, chipsPerBuyIn) -> cash-game results + transfers
 *   settleNote(result)                       -> plain note when the chip count is off
 *   transfers(nets)                          -> fewest payments to square up
 *   icm(stacks, prizes)                      -> fair deal (Malmuth–Harville)
 *   chipValue(counts, denoms)                -> total of a stack by colour
 */
(function (root) {
  "use strict";

  /** Who pays whom: biggest loser pays biggest winner until all square. Amounts in cents. */
  function transfers(nets) {
    const debt = [], cred = [];
    nets.forEach((v, i) => { if (v < 0) debt.push([i, -v]); else if (v > 0) cred.push([i, v]); });
    debt.sort((a, b) => b[1] - a[1]); cred.sort((a, b) => b[1] - a[1]);
    const out = [];
    let d = 0, c = 0;
    while (d < debt.length && c < cred.length) {
      const amt = Math.min(debt[d][1], cred[c][1]);
      if (amt > 0) out.push({ from: debt[d][0], to: cred[c][0], cents: amt });
      debt[d][1] -= amt; cred[c][1] -= amt;
      if (debt[d][1] === 0) d++;
      if (cred[c][1] === 0) c++;
    }
    return out;
  }

  /**
   * Cash game: each player { buyIns, chips }. Money is in dollars per buy-in.
   * Chip value = total money / total chips (so a miscount is shared fairly).
   * Returns { rows: [{paid, cashOut, net}] (cents), transfers, perChip, chipsExpected, chipsCounted }.
   */
  function settle(players, perBuyIn, chipsPerBuyIn) {
    const paidC = players.map((p) => Math.round((+p.buyIns || 0) * perBuyIn * 100));
    const moneyC = paidC.reduce((a, b) => a + b, 0);
    const chips = players.map((p) => Math.max(0, +p.chips || 0));
    const totalChips = chips.reduce((a, b) => a + b, 0);
    const expected = players.reduce((a, p) => a + (+p.buyIns || 0) * chipsPerBuyIn, 0);
    // cash out in cents, rounding so the totals still match exactly (largest remainders)
    let cash = chips.map(() => 0);
    if (totalChips > 0) {
      const exact = chips.map((c) => (c * moneyC) / totalChips);
      cash = exact.map(Math.floor);
      let left = moneyC - cash.reduce((a, b) => a + b, 0);
      const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
      for (let k = 0; k < order.length && left > 0; k++, left--) cash[order[k][1]]++;
    }
    const nets = cash.map((c, i) => c - paidC[i]);
    return {
      rows: players.map((p, i) => ({ paid: paidC[i], cashOut: cash[i], net: nets[i] })),
      transfers: transfers(nets), perChip: totalChips ? moneyC / 100 / totalChips : 0,
      chipsExpected: expected, chipsCounted: totalChips,
      // "uncounted": no chips entered yet (nothing to settle); "off": count differs from buy-ins
      status: totalChips === 0 && expected > 0 ? "uncounted" : totalChips !== expected ? "off" : "ok",
    };
  }

  const n0 = (x) => Math.round(x).toLocaleString("en-US");
  /** Plain note about the chip count for the settle screen ("" when it matches). */
  function settleNote(r) {
    if (r.status === "uncounted") return `Chips counted: ${n0(r.chipsCounted)} of ${n0(r.chipsExpected)} — finish counting`;
    if (r.status === "off") return `Chips counted ${n0(r.chipsCounted)} vs ${n0(r.chipsExpected)} bought — the difference is shared by chip value.`;
    return "";
  }

  /**
   * Independent Chip Model: chance of each finishing place from chip shares
   * (P(first) = share of chips; later places by removing the winner and
   * repeating). Returns each player's fair share of the prizes.
   */
  function icm(stacks, prizes) {
    const n = stacks.length;
    const memo = new Map();
    // value(mask, place) = expected prize vector for players in mask competing for places place..
    function rec(mask, place) {
      if (place >= prizes.length || mask === 0) return new Float64Array(n);
      const key = mask * 16 + place;
      if (memo.has(key)) return memo.get(key);
      let total = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) total += stacks[i];
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        if (!(mask & (1 << i))) continue;
        const p = total > 0 ? stacks[i] / total : 1 / popcount(mask);
        if (p === 0) continue;
        out[i] += p * prizes[place];
        const sub = rec(mask & ~(1 << i), place + 1);
        for (let j = 0; j < n; j++) out[j] += p * sub[j];
      }
      memo.set(key, out);
      return out;
    }
    return Array.from(rec((1 << n) - 1, 0));
  }
  function popcount(m) { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; }

  function chipValue(counts, denoms) {
    return denoms.reduce((a, d, i) => a + (+counts[i] || 0) * d.value, 0);
  }

  const PAYOUTS = {
    "1": [100],
    "2": [65, 35],
    "3": [50, 30, 20],
    "4": [40, 30, 20, 10],
  };

  const api = { transfers, settle, settleNote, icm, chipValue, PAYOUTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HomeCalc = api;
})(typeof self !== "undefined" ? self : this);
