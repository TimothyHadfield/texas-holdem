/* coach-holdem.js — Hold'em's part of the shared coach kit (js/coach.js, never edit that one here):
 * the rules sheet and the guided first game's steps.
 *   HoldemCoach.SEED          the guided game's deal (found once by tools/find-tutorial-seed.js)
 *   HoldemCoach.steps(ctx)    ctx: { state() -> the table's state or null, overlay() -> bool }
 *   HoldemCoach.rules()       COACH.rules() options */
(function (root) {
  "use strict";
  // You get A-K, the flop pairs your king, the river gives you aces and kings; the Easy computer calls along.
  // (Seed 416: you are the dealer, so you act first before the flop; you win whether you bet or only call.)
  const SEED = 416;
  const ID = "holdem-first";

  function steps(ctx) {
    const st = () => ctx.state();
    const street = () => { const s = st(); return s ? s.street : ""; };
    const mine = () => { const s = st(); return !!s && s.toAct === 0; };
    const actedOn = (str) => { const s = st(); return !!s && (s.log.some((e) => e.seat === 0 && e.street === str && !["sb", "bb", "ante"].includes(e.type)) || s.street === "done"); };
    const after = (str) => { const order = ["preflop", "flop", "turn", "river", "showdown", "done"]; return order.indexOf(street()) > order.indexOf(str); };
    const resultEl = () => {
      const a = document.querySelector("#hud .hud-res");
      if (a && a.offsetParent && a.getBoundingClientRect().height) return a;
      return document.querySelector(".table-area .result-line");
    };
    return [
      { title: "Your first hand", text: "You against one Easy computer. Win the chips in the middle (the pot) with the best five-card hand, or by making the other player fold. I'll walk you through one hand." },
      { target: ".table-area .seat.hero .hole", title: "Your two cards", text: "Only you can see these. Ace-king is one of the best starting hands.", when: () => street() === "preflop" },
      { target: "#hud", title: "Your win chance", text: "Your chance to win if all the cards were dealt now, against cards you can't see. Green is good, red is bad.", skipIf: () => !ctx.overlay() || after("preflop") },
      { target: "#actions", title: "Your turn", html: "Fold gives up, <b>Call</b> matches the bet, <b>Raise</b> bets more. Strong hands raise: tap <b>Raise</b>.", when: mine, until: () => actedOn("preflop"), skipIf: () => after("preflop") },
      { target: ".table-area .board", title: "The flop", text: "Three shared cards that everyone uses. The king paired your king: you have the top pair.", when: () => street() === "flop" || after("flop"), skipIf: () => after("flop") },
      { target: "#actions", title: "Bet when ahead", html: "Pick a size (<b>½</b>, <b>¾</b> or <b>Pot</b>, or slide), then tap <b>Bet</b>. <b>Check</b> passes without betting.", when: () => street() === "flop" && mine(), until: () => actedOn("flop") || after("flop"), skipIf: () => after("flop") },
      { target: [".table-area .board", "#actions"], title: "Turn and river", text: "One more shared card, then one last one, with a round of betting after each. Play them your way.", when: () => after("flop"), until: () => street() === "done", skipIf: () => street() === "done" },
      { target: resultEl, title: "Showdown", text: "Cards are turned up and the best five cards out of your two and the five shared ones win the pot.", when: () => street() === "done", skipIf: () => { const s = st(); return !!(s && s.result && s.result.byFold); } },
      { target: resultEl, title: "A fold ends it", text: "When everyone but one player folds, that player wins the pot without showing their cards.", when: () => street() === "done", skipIf: () => { const s = st(); return !(s && s.result && s.result.byFold); } },
      { target: "[data-study]", title: "Study the hand", text: "Study hand replays every decision and shows how many chips each one won or lost on average.", when: () => street() === "done", skipIf: () => !document.querySelector("[data-study]") },
      { title: "You've got it", html: "Keep playing this computer, or open <b>Menu</b> → New table for more players. The full rules are in <b>Settings</b> → Rules." },
    ];
  }

  const RANKS = [
    ["Straight flush", "Five in a row, one suit", "9♠ 8♠ 7♠ 6♠ 5♠"],
    ["Four of a kind", "Four of one rank", "Q Q Q Q 4"],
    ["Full house", "Three of one rank + a pair", "8 8 8 K K"],
    ["Flush", "Five of one suit", "A♦ J♦ 9♦ 6♦ 2♦"],
    ["Straight", "Five in a row", "6 5 4 3 2"],
    ["Three of a kind", "Three of one rank", "7 7 7 K 2"],
    ["Two pair", "Two different pairs", "J J 5 5 A"],
    ["Pair", "Two of one rank", "10 10 A 8 3"],
    ["High card", "None of the above", "A Q 9 6 3"],
  ];

  function rules() {
    return {
      title: "How to play Texas Hold'em",
      sections: [
        { id: "goal", short: "Goal", title: "Goal", html: `<p>Win chips. Each hand, the players put chips into the middle (the <b>pot</b>). You win it by having the <b>best five-card hand</b> at the end, or by betting so the others <b>fold</b> (give up) first.</p>
          <p class="tip">Your hand is the best five cards out of your two private cards and the five shared cards on the table. You may use both, one, or none of yours.</p>` },
        { id: "deal", short: "Deal", title: "The deal and the blinds", html: `<ul><li>The <b>dealer button</b> moves one seat to the left every hand.</li>
          <li>The two players left of the button post forced bets: the <b>small blind</b> and the <b>big blind</b> (twice as much). With only two players, the dealer posts the small blind.</li>
          <li>Everyone gets two cards face down.</li></ul>` },
        { id: "betting", short: "Betting", title: "A round of betting", html: `<p>Players act in turn, going left. On your turn you can:</p>
          <ul><li><b>Fold</b>: give up the hand and anything you put in.</li><li><b>Check</b>: pass, only when nobody has bet this round.</li>
          <li><b>Call</b>: match the bet.</li><li><b>Bet</b> or <b>Raise</b>: put in more. A raise must be at least as big as the last bet or raise.</li></ul>
          <p>The round ends when everyone still in has put in the same amount.</p>` },
        { id: "streets", short: "Streets", title: "Four rounds", html: `<ol><li><b>Before the flop</b>: starts left of the big blind.</li><li><b>Flop</b>: three shared cards.</li><li><b>Turn</b>: a fourth.</li><li><b>River</b>: a fifth.</li></ol>
          <p>From the flop on, the first player still in left of the button acts first. A card is burned (put aside face down) before each deal.</p>` },
        { id: "showdown", short: "Showdown", title: "Showdown", html: `<p>If two or more players are left after the river, the hands are turned up and the best five-card hand wins. Equal hands split the pot.</p>
          <p>A player who is <b>all in</b> can only win as much from each opponent as they put in; the rest goes to a <b>side pot</b> the others play for.</p>` },
        { id: "hands", short: "Hands", title: "Hands, best first", html: `<table><tr><th>Hand</th><th>What it is</th><th>Example</th></tr>${RANKS.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table>
          <p class="tip">An ace counts high or low in a straight (A K Q J 10 or 5 4 3 2 A), but a straight can't wrap around (Q K A 2 3 is not one).</p>` },
        { id: "limits", short: "Limits", title: "No limit, pot limit, limit", html: `<ul><li><b>No limit</b>: bet any amount up to all your chips.</li>
          <li><b>Pot limit</b>: at most the size of the pot after you call.</li>
          <li><b>Limit</b>: fixed bets: one big blind before the flop and on the flop, two on the turn and river; a bet and three raises per round.</li></ul>` },
        { id: "games", short: "Games", title: "Cash game or tournament", html: `<ul><li><b>Cash</b>: blinds stay the same; if you run out you can buy back in.</li>
          <li><b>Tournament</b>: everyone starts equal and the blinds go up every 10 hands. Run out and you're out; the last player with chips wins.</li>
          <li><b>Antes</b> (optional): a small extra bet from everyone, or one from the big blind for the table.</li></ul>` },
      ],
    };
  }

  const api = { SEED, ID, steps, rules, RANKS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HoldemCoach = api;
})(typeof window !== "undefined" ? window : globalThis);
