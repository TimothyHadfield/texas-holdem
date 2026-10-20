/* table-fx.js — which sounds, animations and celebrations a change at the
 * table makes. plan(prev, next, me) compares two table states (solo, or an
 * online snapshot rotated so you are seat `me`) and returns a timeline;
 * run(plan, ctx) plays it through js/fx.js, obeying the Sound & effects
 * settings. Works the same for your moves, the computers' and other players'
 * (online), because it only looks at what changed in the state.
 *
 * Event -> sound (times in ms, Normal speed; Fast = 0.55x):
 *   new hand        chips (blinds) + shuffle, then cardDeal per hole card (45 ms apart)
 *   check           knock          fold     cardSlide (cards fly to the middle)
 *   call            chip / chips   bet, raise, all in   chips (all in louder)
 *   street dealt    chips swept to the pot, cardFlip per board card
 *   all-in runout   hands turned up, drumroll, then the board one street at a time
 *   showdown        cardFlip for each hand turned over
 *   pot won         coins (pot slides to the winner, "+N" floats, stack counts up)
 *   your turn       turn chime + your plate pulses (only when it BECOMES your turn)
 *   big pot (you win >= 50 big blinds)  celebrate big
 *   tournament won  celebrate win  ·  knocked out / lost  celebrate lose
 *   illegal move    error (play.js)  ·  home-game blind level up  alarm (home.js)
 */
(function (root) {
  "use strict";
  const SETUP = { setup: true }; // "the setup / lobby screen was showing": the next deal is fresh
  const BIG_POT_BB = 50;
  const live = (s) => s.street !== "done" && s.street !== "idle";
  const sig = (s) => [s.hand, s.street, (s.log || []).length, s.over ? 1 : 0, s.toAct, s.board.length].join("|");

  function wonBy(s, i) {
    if (!s.result) return 0;
    let w = 0;
    for (const p of s.result.pots) {
      if (!s.result.byFold && p.uncontested) continue; // an uncalled bet coming back is not a win
      const k = p.winners.indexOf(i);
      if (k < 0) continue;
      const share = Math.floor(p.amount / p.winners.length);
      w += share + (k < p.amount - share * p.winners.length ? 1 : 0);
    }
    return w;
  }

  function plan(prev, next, me) {
    me = me || 0;
    const out = { sounds: [], anims: [], celebrate: null, board: {}, deal0: 0, flip0: 0 };
    if (!prev || !next || !next.seats) return out;
    const fresh = !!prev.setup;
    if (!fresh && sig(prev) === sig(next)) return out;
    const snd = (name, at, o) => out.sounds.push(Object.assign({ name, at: Math.round(at) }, o || {}));
    const anim = (kind, at, o) => out.anims.push(Object.assign({ kind, at: Math.round(at) }, o || {}));
    const n = next.seats.length;

    let mode = "none";
    if (live(next) && (fresh || !live(prev) || prev.hand !== next.hand)) mode = "new";
    else if (!fresh && live(prev) && live(next) && prev.hand === next.hand) mode = "same";
    else if (!fresh && live(prev) && next.street === "done" && next.hand === prev.hand + 1) mode = "same";

    let t = 0;
    let entries = [];
    let boardLen = 0;
    let hadBets = false;
    if (mode === "new") {
      snd("chips", 0, { vol: 0.5 });
      snd("shuffle", 120);
      out.deal0 = 560;
      next.seats.forEach((p, k) => p.hole.forEach((_, j) => snd("cardDeal", out.deal0 + (j * n + k) * 45)));
      const dealt = next.seats.filter((p) => p.hole.length).length;
      t = out.deal0 + (2 * n) * 45 + 300;
      void dealt;
      // actions already made (an online snapshot can skip ahead); not after a reload/lobby
      entries = fresh ? [] : next.log.filter((e) => !["sb", "bb", "ante"].includes(e.type));
      hadBets = true;
    } else if (mode === "same") {
      entries = next.log.slice(prev.log.length);
      boardLen = prev.board.length;
      hadBets = prev.seats.some((p) => p.bet > 0);
    }
    // all-in runout: the last action is followed by more than one street with nobody able to act
    let lastAct = -1;
    entries.forEach((e, i) => { if (e.seat >= 0) lastAct = i; });
    const streetsAfter = entries.slice(lastAct + 1).filter((e) => e.seat === -1).length;
    const showdown = next.street === "done" && next.result && !next.result.byFold;
    const runout = showdown && streetsAfter >= 1 && next.seats.some((p) => p.allIn && !p.folded);
    const flipShown = () => {
      if (!showdown) return;
      out.flip0 = t;
      for (const i of next.result.shown || []) if (i !== me && next.seats[i] && next.seats[i].hole.length) next.seats[i].hole.forEach((_, j) => snd("cardFlip", t + j * 70, { seat: i }));
    };
    let swept = false, flipped = false;
    entries.forEach((e, i) => {
      if (e.seat >= 0) {
        const bb = next.bb || 20;
        const ty = e.type;
        if (ty === "fold") { snd("cardSlide", t); anim("fold", t, { seat: e.seat }); }
        else if (ty === "check") { snd("knock", t); anim("knock", t, { seat: e.seat }); }
        else if (ty === "call" || ty === "bet" || ty === "raise" || ty === "sb" || ty === "bb" || ty === "ante") {
          const big = ty !== "call" || e.amount >= 4 * bb;
          snd(e.allIn ? "chips" : big ? "chips" : "chip", t, e.allIn ? { vol: 1.3 } : undefined);
          if (ty !== "ante") anim("bet", t + 40, { seat: e.seat });
          hadBets = true;
        }
        if (e.allIn) anim("allin", t, { seat: e.seat });
        t += 300;
        return;
      }
      // a street is dealt
      if (!swept && hadBets) { snd("chips", t, { vol: 0.5 }); anim("sweep", t); t += 320; }
      swept = true;
      if (runout && i > lastAct && !flipped) { flipShown(); flipped = true; t += 350; snd("drumroll", t); t += 950; }
      const cards = e.cards || [];
      for (let c = boardLen; c < cards.length; c++) {
        const at = t + (c - boardLen) * 90;
        out.board[c] = at;
        snd("cardFlip", at, { board: true });
      }
      t += (cards.length - boardLen) * 90 + (runout ? 520 : 300);
      boardLen = cards.length;
    });

    // showdown and the pot
    if (next.street === "done" && next.result && mode === "same") {
      if (!flipped) { flipShown(); if (showdown) t += 400; }
      if (!swept && hadBets) { anim("sweep", t); t += 300; }
      const winners = next.seats.filter((p) => wonBy(next, p.i) > 0).map((p) => p.i);
      if (winners.length) {
        snd("coins", t, { vol: winners.includes(me) ? 1 : 0.7 });
        anim("push", t, { seats: winners });
        winners.forEach((i) => anim("won", t + 380, { seat: i, amount: wonBy(next, i), stack: next.seats[i].stack }));
        const mine = wonBy(next, me);
        if (mine >= BIG_POT_BB * (next.bb || 20) && !next.over) out.celebrate = { kind: "big", at: t + 450 };
        t += 600;
      }
    }

    // game over / knocked out (tournament)
    const meNow = next.seats[me], meBefore = prev.seats && prev.seats[me];
    if (next.over && !prev.over && !fresh) {
      if (next.winner === me) out.celebrate = { kind: "win", at: t };
      else if (!(meBefore && meBefore.out)) out.celebrate = { kind: "lose", at: t };
    } else if (!fresh && meNow && meNow.out && meBefore && !meBefore.out && next.cfg && next.cfg.format === "tourney") {
      out.celebrate = { kind: "lose", at: t };
    }

    // your turn (only when it becomes yours)
    if (live(next) && next.toAct === me && meNow && meNow.kind === "human" &&
        (fresh || mode === "new" || prev.toAct !== me || prev.street !== next.street || prev.hand !== next.hand)) {
      snd("turn", t);
      anim("turn", t, { seat: me });
    }
    return out;
  }

  const FXo = () => root.FX || null;
  const speed = () => { const F = FXo(); return F && F.settings.animSpeed === "fast" ? 0.55 : 1; };
  /** Multiplier for the CSS card-animation delays: 0 when animations are off. */
  function delayK() { const F = FXo(); if (!F || !F.settings.animations) return 0; return speed(); }

  /** Play a plan. ctx.later(ms, fn) schedules; ctx.dom.anim(a) runs one animation. */
  function run(p, ctx) {
    const F = FXo();
    if (!F || !p) return;
    ctx = ctx || {};
    const later = ctx.later || ((ms, fn) => setTimeout(fn, ms));
    const k = speed();
    for (const s of p.sounds) later(s.at * k, () => F.play(s.name, s.vol ? { vol: s.vol } : undefined));
    if (F.settings.animations && ctx.dom && ctx.dom.anim) {
      for (const a of p.anims) later(a.at * k, () => { try { ctx.dom.anim(a); } catch (e) { /* never break the table */ } });
    }
    if (p.celebrate) later(p.celebrate.at * k, () => F.celebrate(Object.assign({ kind: p.celebrate.kind }, ctx.celebrateOpts ? ctx.celebrateOpts(p.celebrate.kind) : {})));
  }

  /** The table's own "check" sound: two knuckle raps on the felt. */
  function defineSounds() {
    const F = FXo();
    if (!F || !F.define) return;
    F.define("knock", (k) => {
      [0, 0.11].forEach((at, i) => {
        const v = i ? 0.26 : 0.32;
        k.tone({ f: 190, f2: 120, dur: 0.07, vol: v, at });
        k.noise({ f: 900, f2: 400, filter: "lowpass", dur: 0.05, vol: v * 0.9, at });
      });
    }, "moves");
  }
  defineSounds();

  const api = { plan, run, delayK, SETUP, BIG_POT_BB, defineSounds };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TableFX = api;
})(typeof window !== "undefined" ? window : globalThis);
