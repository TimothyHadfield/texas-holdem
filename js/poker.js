/* ============================================================================
 * poker.js — cards, the 5-to-7 card hand evaluator, and equity (odds) maths.
 * Pure functions, no DOM. Works in the browser (window.Poker) and in Node
 * (require). Everything else in the site builds on this file.
 *
 * Card = integer 0..51: rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3
 * (0 clubs, 1 diamonds, 2 hearts, 3 spades).
 *
 * Hand score = one integer, bigger is better:
 *   category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5
 * category 0 high card .. 8 straight flush. k1..k5 are tie-break ranks.
 * ==========================================================================*/
(function (root) {
  "use strict";

  const RANKS = "23456789TJQKA";
  const SUITS = "cdhs";
  const SUIT_SYMBOL = ["♣", "♦", "♥", "♠"];
  const CAT_NAMES = ["High card", "Pair", "Two pair", "Three of a kind", "Straight",
                     "Flush", "Full house", "Four of a kind", "Straight flush"];
  const RANK_WORD = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
                     "Jack", "Queen", "King", "Ace"];
  const RANK_PLURAL = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines",
                       "Tens", "Jacks", "Queens", "Kings", "Aces"];

  const rankOf = (c) => c >> 2;
  const suitOf = (c) => c & 3;
  const makeCard = (r, s) => (r << 2) | s;

  /** "Ah" -> card. Accepts "10h" too. Returns -1 when it can't parse. */
  function parseCard(str) {
    if (typeof str !== "string") return -1;
    let s = str.trim();
    if (s.startsWith("10")) s = "T" + s.slice(2);
    if (s.length !== 2) return -1;
    const r = RANKS.indexOf(s[0].toUpperCase());
    const u = SUITS.indexOf(s[1].toLowerCase());
    return r < 0 || u < 0 ? -1 : makeCard(r, u);
  }
  function parseCards(str) {
    return str.trim().split(/[\s,]+/).filter(Boolean).map(parseCard);
  }
  const cardStr = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];

  // --------------------------------------------------------------- tables
  // 13-bit rank masks: popcount, the high card of the best straight, and the
  // top bits, precomputed once so the evaluator does no loops for them.
  const POP = new Uint8Array(8192);
  const STRAIGHT_HI = new Int8Array(8192);
  for (let m = 0; m < 8192; m++) {
    let p = 0;
    for (let b = 0; b < 13; b++) if (m & (1 << b)) p++;
    POP[m] = p;
    let hi = -1;
    for (let top = 12; top >= 4 && hi < 0; top--) {
      const run = 0x1f << (top - 4);
      if ((m & run) === run) hi = top;
    }
    if (hi < 0 && (m & 0x100f) === 0x100f) hi = 3; // A-2-3-4-5, five high
    STRAIGHT_HI[m] = hi;
  }
  /** Highest set bit of a 13-bit mask, or -1. */
  const HIGH = new Int8Array(8192);
  for (let m = 1; m < 8192; m++) HIGH[m] = 31 - Math.clz32(m);
  HIGH[0] = -1;

  /** Pack up to n highest ranks of mask as kickers starting at shift. */
  function topKickers(mask, n) {
    let out = 0;
    for (let i = 0; i < n; i++) {
      const h = HIGH[mask];
      out = (out << 4) | (h < 0 ? 0 : h);
      if (h >= 0) mask &= ~(1 << h);
    }
    return out;
  }


  /**
   * Score the best 5-card hand from `n` cards taken from arr (5..7 cards).
   * `arr2`/`n2` lets callers pass hole + board without concatenating.
   */
  function evaluate(arr, n, arr2, n2) {
    // One 13-bit rank mask per suit; rank counts then fall out of bit logic
    // (a rank in 2+ suits is a pair, 3+ trips, 4 quads) with no arrays.
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    if (n === undefined) n = arr.length;
    for (let i = 0; i < n; i++) {
      const c = arr[i], b = 1 << (c >> 2);
      switch (c & 3) { case 0: s0 |= b; break; case 1: s1 |= b; break; case 2: s2 |= b; break; default: s3 |= b; }
    }
    if (arr2) {
      if (n2 === undefined) n2 = arr2.length;
      for (let i = 0; i < n2; i++) {
        const c = arr2[i], b = 1 << (c >> 2);
        switch (c & 3) { case 0: s0 |= b; break; case 1: s1 |= b; break; case 2: s2 |= b; break; default: s3 |= b; }
      }
    }
    const rankMask = s0 | s1 | s2 | s3;
    // Flush / straight flush
    let flush = 0;
    if (POP[s0] >= 5) flush = s0; else if (POP[s1] >= 5) flush = s1;
    else if (POP[s2] >= 5) flush = s2; else if (POP[s3] >= 5) flush = s3;
    if (flush) {
      const sf = STRAIGHT_HI[flush];
      if (sf >= 0) return (8 << 20) | (sf << 16);
    }
    // Rank groups
    const quads = s0 & s1 & s2 & s3;
    const three = (s0 & s1 & s2) | (s0 & s1 & s3) | (s0 & s2 & s3) | (s1 & s2 & s3);
    const two = (s0 & s1) | (s0 & s2) | (s0 & s3) | (s1 & s2) | (s1 & s3) | (s2 & s3);
    const trips = three & ~quads;
    const pairs = two & ~three;
    const quad = quads ? HIGH[quads] : -1;
    if (quad >= 0) {
      const rest = rankMask & ~(1 << quad);
      return (7 << 20) | (quad << 16) | (HIGH[rest] << 12);
    }
    if (trips) {
      const t = HIGH[trips];
      const others = (trips & ~(1 << t)) | pairs; // second trips counts as a pair
      if (others) return (6 << 20) | (t << 16) | (HIGH[others] << 12);
    }
    if (flush) return (5 << 20) | topKickers(flush, 5);
    const st = STRAIGHT_HI[rankMask];
    if (st >= 0) return (4 << 20) | (st << 16);
    if (trips) {
      const t = HIGH[trips];
      return (3 << 20) | (t << 16) | (topKickers(rankMask & ~(1 << t), 2) << 8);
    }
    if (POP[pairs] >= 2) {
      const p1 = HIGH[pairs];
      const p2 = HIGH[pairs & ~(1 << p1)];
      const rest = rankMask & ~(1 << p1) & ~(1 << p2);
      return (2 << 20) | (p1 << 16) | (p2 << 12) | (HIGH[rest] << 8);
    }
    if (pairs) {
      const p = HIGH[pairs];
      return (1 << 20) | (p << 16) | (topKickers(rankMask & ~(1 << p), 3) << 4);
    }
    return topKickers(rankMask, 5);
  }

  const category = (score) => score >> 20;

  /** Plain-English name of a score: "Two pair, Kings and Sevens". */
  function describe(score) {
    const cat = score >> 20;
    const k1 = (score >> 16) & 15, k2 = (score >> 12) & 15;
    switch (cat) {
      case 8: return k1 === 12 ? "Royal flush" : "Straight flush, " + RANK_WORD[k1] + " high";
      case 7: return "Four " + RANK_PLURAL[k1];
      case 6: return "Full house, " + RANK_PLURAL[k1] + " full of " + RANK_PLURAL[k2];
      case 5: return "Flush, " + RANK_WORD[k1] + " high";
      case 4: return "Straight, " + RANK_WORD[k1] + " high";
      case 3: return "Three " + RANK_PLURAL[k1];
      case 2: return "Two pair, " + RANK_PLURAL[k1] + " and " + RANK_PLURAL[k2];
      case 1: return "Pair of " + RANK_PLURAL[k1];
      default: return RANK_WORD[k1] + " high";
    }
  }

  // ------------------------------------------------------------------ RNG
  /** Small fast seeded RNG (mulberry32). Returns floats in [0,1). */
  function rng32(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }

  /** Cards not in `used` (array of cards). */
  function remainingDeck(used) {
    const taken = new Uint8Array(52);
    for (const c of used) if (c >= 0) taken[c] = 1;
    const out = [];
    for (let c = 0; c < 52; c++) if (!taken[c]) out.push(c);
    return out;
  }

  // --------------------------------------------------------------- equity
  /**
   * Odds of `hero` winning against opponents.
   *   hero:      [c, c]
   *   board:     0..5 known board cards
   *   dead:      cards known to be out of play (seen, folded, burned face up)
   *   opponents: total number of opponents (>= known.length)
   *   known:     array of [c, c] hands for some opponents (optional)
   * Exact enumeration when the case count is small enough, otherwise Monte
   * Carlo with `trials` deals. Returns { win, tie, lose, equity, n, exact }.
   * equity = win + the hero's share of ties (a two-way tie counts as half).
   */
  function equity(opts) {
    const hero = opts.hero;
    const board = opts.board || [];
    const known = (opts.known || []).filter((h) => h && h.length === 2);
    const nOpp = Math.max(opts.opponents || 1, known.length);
    const unknownOpp = nOpp - known.length;
    const used = hero.concat(board, opts.dead || [], ...known);
    const deck = remainingDeck(used);
    const need = 5 - board.length;
    const exactLimit = opts.exactLimit === undefined ? 2500000 : opts.exactLimit;

    // Case count for exact enumeration (only 0 or 1 unknown opponent).
    let cases = Infinity;
    if (unknownOpp === 0) cases = choose(deck.length, need);
    else if (unknownOpp === 1) cases = choose(deck.length, 2) * choose(deck.length - 2, need);
    const evals = cases * (nOpp + 1);
    if (evals <= exactLimit && !opts.forceMC) return exactEquity(hero, board, known, unknownOpp, deck, need);
    return mcEquity(hero, board, known, unknownOpp, deck, need, opts.trials || 20000, opts.rng || rng32(opts.seed || 12345));
  }

  // Shared tally for both methods.
  function tally(acc, hero, full, opps) {
    const h = evaluate(hero, 2, full, 5);
    let best = h, ties = 1, heroBest = true;
    for (let i = 0; i < opps.length; i++) {
      const s = evaluate(opps[i], 2, full, 5);
      if (s > best) { best = s; heroBest = false; ties = 1; }
      else if (s === best) ties++;
    }
    if (!heroBest || h !== best) { acc.lose++; return; }
    if (ties === 1) acc.win++;
    else { acc.tie++; acc.share += 1 / ties; }
  }

  function finish(acc, exact) {
    const n = acc.win + acc.tie + acc.lose;
    return {
      win: acc.win / n, tie: acc.tie / n, lose: acc.lose / n,
      equity: (acc.win + acc.share) / n, n, exact,
    };
  }

  function exactEquity(hero, board, known, unknownOpp, deck, need) {
    const acc = { win: 0, tie: 0, lose: 0, share: 0 };
    const full = new Array(5);
    for (let i = 0; i < board.length; i++) full[i] = board[i];
    const opps = known.slice();
    const runBoards = (avail) => {
      const m = avail.length;
      const idx = [];
      const rec = (start, depth) => {
        if (depth === need) { tally(acc, hero, full, opps); return; }
        for (let i = start; i <= m - (need - depth); i++) {
          full[board.length + depth] = avail[i];
          rec(i + 1, depth + 1);
        }
      };
      rec(0, 0);
      void idx;
    };
    if (unknownOpp === 0) runBoards(deck);
    else {
      const vill = [0, 0];
      opps.push(vill);
      for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) {
        vill[0] = deck[i]; vill[1] = deck[j];
        const avail = deck.filter((c, k) => k !== i && k !== j);
        runBoards(avail);
      }
    }
    return finish(acc, true);
  }

  function mcEquity(hero, board, known, unknownOpp, deck, need, trials, rand) {
    const acc = { win: 0, tie: 0, lose: 0, share: 0 };
    const d = deck.slice();
    const full = new Array(5);
    for (let i = 0; i < board.length; i++) full[i] = board[i];
    const opps = known.slice();
    for (let u = 0; u < unknownOpp; u++) opps.push([0, 0]);
    const draw = need + 2 * unknownOpp;
    for (let t = 0; t < trials; t++) {
      // partial Fisher-Yates: the first `draw` slots become a random sample
      for (let i = 0; i < draw; i++) {
        const j = i + Math.floor(rand() * (d.length - i));
        const tmp = d[i]; d[i] = d[j]; d[j] = tmp;
      }
      let k = 0;
      for (let i = board.length; i < 5; i++) full[i] = d[k++];
      for (let u = 0; u < unknownOpp; u++) {
        const o = opps[known.length + u];
        o[0] = d[k++]; o[1] = d[k++];
      }
      tally(acc, hero, full, opps);
    }
    return finish(acc, false);
  }

  /**
   * Odds for every player when all hands are known (study mode: "who was
   * really ahead"). Returns an array of equities, one per hand.
   */
  function allEquities(hands, board, dead, opts) {
    opts = opts || {};
    const used = board.concat(dead || [], ...hands);
    const deck = remainingDeck(used);
    const need = 5 - board.length;
    const shares = new Float64Array(hands.length);
    const full = new Array(5);
    for (let i = 0; i < board.length; i++) full[i] = board[i];
    const scores = new Int32Array(hands.length);
    let n = 0;
    const score = () => {
      let best = -1, ties = 0;
      for (let i = 0; i < hands.length; i++) {
        scores[i] = evaluate(hands[i], 2, full, 5);
        if (scores[i] > best) { best = scores[i]; ties = 1; } else if (scores[i] === best) ties++;
      }
      for (let i = 0; i < hands.length; i++) if (scores[i] === best) shares[i] += 1 / ties;
      n++;
    };
    const cases = choose(deck.length, need);
    const limit = opts.exactLimit === undefined ? 1200000 : opts.exactLimit;
    if (cases * hands.length <= limit) {
      const rec = (start, depth) => {
        if (depth === need) { score(); return; }
        for (let i = start; i <= deck.length - (need - depth); i++) {
          full[board.length + depth] = deck[i];
          rec(i + 1, depth + 1);
        }
      };
      rec(0, 0);
    } else {
      const rand = opts.rng || rng32(opts.seed || 777);
      const d = deck.slice();
      const trials = opts.trials || 20000;
      for (let t = 0; t < trials; t++) {
        for (let i = 0; i < need; i++) {
          const j = i + Math.floor(rand() * (d.length - i));
          const tmp = d[i]; d[i] = d[j]; d[j] = tmp;
          full[board.length + i] = d[i];
        }
        score();
      }
    }
    return Array.from(shares, (s) => s / n);
  }

  // ----------------------------------------------------------------- outs
  /**
   * Cards that would improve the hero to a better kind of hand on the next
   * card, where the improvement uses the hero's own cards (a pair landing on
   * the board alone doesn't count). Board must have 3 or 4 cards.
   * Returns { cards: [...], byKind: {"Flush": [...], ...}, nextPct, riverPct }.
   */
  function outs(hero, board, dead) {
    if (board.length < 3 || board.length > 4) return null;
    const deck = remainingDeck(hero.concat(board, dead || []));
    const before = category(evaluate(hero, 2, board, board.length));
    const list = [], byKind = {};
    const b2 = board.slice();
    for (const c of deck) {
      b2[board.length] = c;
      const after = evaluate(hero, 2, b2, board.length + 1);
      const cat = category(after);
      if (cat <= before) continue;
      // Does the board alone already make this kind of hand? Then it's shared.
      const boardOnly = b2.length >= 5 ? category(evaluate(b2, b2.length)) : boardCategory(b2);
      if (cat <= boardOnly) continue;
      list.push(c);
      const k = CAT_NAMES[cat];
      (byKind[k] = byKind[k] || []).push(c);
    }
    const unseen = deck.length;
    const nextPct = list.length / unseen;
    const riverPct = board.length === 3
      ? 1 - choose(unseen - list.length, 2) / choose(unseen, 2)
      : nextPct;
    return { cards: list, byKind, nextPct, riverPct, unseen };
  }

  /** Category made by fewer than 5 cards (pairs/trips/quads only). */
  function boardCategory(cards) {
    const cnt = new Uint8Array(13);
    for (const c of cards) cnt[c >> 2]++;
    let p = 0, t = 0, q = 0;
    for (const k of cnt) { if (k === 2) p++; else if (k === 3) t++; else if (k === 4) q++; }
    if (q) return 7;
    if (t && p) return 6;
    if (t) return 3;
    if (p >= 2) return 2;
    if (p) return 1;
    return 0;
  }

  // ------------------------------------------------- starting-hand classes
  /** 169 starting-hand classes: "AA", "AKs", "AKo"... index 0..168. */
  const CLASSES = [];
  for (let a = 12; a >= 0; a--) for (let b = a; b >= 0; b--) {
    if (a === b) CLASSES.push(RANKS[a] + RANKS[b]);
    else { CLASSES.push(RANKS[a] + RANKS[b] + "s"); CLASSES.push(RANKS[a] + RANKS[b] + "o"); }
  }
  const CLASS_INDEX = {};
  CLASSES.forEach((c, i) => { CLASS_INDEX[c] = i; });
  function handClass(c1, c2) {
    let a = rankOf(c1), b = rankOf(c2);
    if (a < b) { const t = a; a = b; b = t; }
    if (a === b) return RANKS[a] + RANKS[b];
    return RANKS[a] + RANKS[b] + (suitOf(c1) === suitOf(c2) ? "s" : "o");
  }

  const api = {
    RANKS, SUITS, SUIT_SYMBOL, CAT_NAMES, RANK_WORD,
    rankOf, suitOf, makeCard, parseCard, parseCards, cardStr,
    evaluate, category, describe, equity, allEquities, outs,
    rng32, choose, remainingDeck, CLASSES, CLASS_INDEX, handClass,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Poker = api;
})(typeof self !== "undefined" ? self : this);
