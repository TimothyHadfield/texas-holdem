/* ui.js — shared helpers: storage, cards, chips, pop-ups, colours. */
(function (root) {
  "use strict";
  const P = root.Poker;
  const KEY = "holdem:v1";

  const Store = {
    data: null,
    load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { d = null; }
      this.data = Object.assign({
        tab: "play",
        settings: { overlay: true, hints: true, undo: true, speed: "normal", fourColor: false, autoNext: false },
        setup: { opponents: 5, level: "mixed", betting: "nl", format: "cash", stack: 100, ante: "none" },
        game: null, history: [], odds: null, home: null, stats: { hands: 0, net: 0 },
      }, d || {});
      this.data.settings = Object.assign({ overlay: true, hints: true, undo: true, speed: "normal", fourColor: false, autoNext: false }, this.data.settings);
      return this.data;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* full or blocked: keep going */ }
    },
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const RANK_SHOW = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  /** One playing card. c = 0..51, null = face down, -1 = empty slot. */
  /* Cards are drawn like a casino "jumbo index" poker deck (63 x 88): big rank + suit in two
     opposite corners, the real pip layout smaller in the middle, framed two-headed courts.
     Small cards (under ~36 px, set in CSS) show the corner index and one big suit only.
     The paper, edge and back come from the shared table kit (css/table.css). */
  function middle(r, sym) {
    const rank = RANK_SHOW[r];
    if (rank === "A") return `<span class="tbl-pip">${sym}</span>`;
    if ("JQK".includes(rank)) return `<span class="tbl-pip tbl-court"><em>${rank}${sym}</em><em>${rank}${sym}</em></span>`;
    const xy = root.TABLE && root.TABLE.PIPXY[rank];
    return xy ? `<span class="tbl-pips">${xy.map(([x, y]) => `<b style="left:${x}%;top:${y}%"${y > 50 ? ' class="r"' : ""}>${sym}</b>`).join("")}</span>` : "";
  }
  function card(c, cls, attrs) {
    cls = cls || "";
    attrs = attrs || "";
    if (c === null || c === undefined) return `<div class="cd tbl-card back tbl-back tbl-lattice ${cls}" ${attrs}></div>`;
    if (c < 0) return `<div class="cd slot ${cls}" ${attrs}></div>`;
    const r = c >> 2, s = c & 3, sym = P.SUIT_SYMBOL[s];
    const ix = (b) => `<span class="ix${b ? " b" : ""}">${RANK_SHOW[r]}<i>${sym}</i></span>`;
    return `<div class="cd tbl-card s${s} ${cls}" ${attrs} aria-label="${RANK_SHOW[r]}${"cdhs"[s]}">${ix()}<span class="pip">${sym}</span><span class="pp">${middle(r, sym)}</span>${ix(1)}</div>`;
  }
  const cardText = (c) => RANK_SHOW[c >> 2] + P.SUIT_SYMBOL[c & 3];

  const CHIP_COLORS = [[1000, "#f0b354"], [500, "#8e5cd9"], [100, "#1b1d24"], [25, "#2e9e5b"], [5, "#d64545"], [1, "#e9e9ee"]];
  function chip(amount) {
    const col = (CHIP_COLORS.find(([v]) => amount >= v * 4) || CHIP_COLORS[CHIP_COLORS.length - 1])[1];
    return `<span class="chip" style="--cc:${col}"></span>`;
  }

  /** red -> amber -> green for a value in [lo, hi]. */
  function scale(x, lo, hi) {
    const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
    const hue = t * 130;
    return `hsl(${hue.toFixed(0)} 70% 58%)`;
  }
  const pct = (x, d) => (x * 100).toFixed(d === undefined ? 1 : d) + "%";
  const money = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2).replace(/\.00$/, "");
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  // ---------------------------------------------------------------- sheet
  const Sheet = {
    open(html, onMount) {
      const el = document.getElementById("sheet");
      document.getElementById("sheetBody").innerHTML = html;
      el.hidden = false;
      if (onMount) onMount(document.getElementById("sheetBody"));
    },
    close() { document.getElementById("sheet").hidden = true; },
  };
  document.addEventListener("click", (e) => {
    if (e.target.id === "sheet" || e.target.closest("[data-close]")) Sheet.close();
  });

  /** "?" explanations, keyed by name. Each says WHY, not what. */
  const HELP = {
    equity: ["Win chance", "Your share of the pot if every remaining card were dealt out with no more betting, against hands you can't see (any two cards). Ties count as a share of the pot."],
    potodds: ["Pot odds", "A call pays off when your win chance is bigger than the price: what you put in divided by what the pot will be after you call. Below that line, calling loses chips in the long run."],
    outs: ["Outs", "Cards that would improve you to a better kind of hand using your own cards. They don't guarantee a win — the odds above already count that."],
    ev: ["Expected value", "The chips a choice wins on average if the hand is checked down from there: win chance × pot − what you put in. Folding is 0. \"You knew\" uses any-two-cards for opponents (what you could know); \"Their cards\" uses what they really held."],
    lost: ["Chips lost", "How many chips the choice gave up on average compared with the best option, using what you could have known at the time. Luck isn't counted."],
    luck: ["Luck meter", "When you're all in before the last card, the deck decides. Expected = your win chance × the pot at that moment; Actual = what you won. Above zero means the cards ran good for you."],
    strength: ["How strong?", ""],
    format: ["Cash or tournament", ""],
    settle: ["Settle up", "Chips are worth the money put in: each chip = total buy-ins ÷ total chips. The list pays everyone off in as few transfers as possible."],
    icm: ["Fair deal (ICM)", "Splits the prize money by each player's chance of finishing in each place, worked out from chip counts. It's the standard way to agree a deal at a final table."],
    chart: ["Starting hands", "Each square is a two-card starting hand. Colour = how often it wins against that many random hands. Top-right half is suited, bottom-left is off-suit, the diagonal is pairs."],
  };
  function qm(key) { return `<button class="qm" data-help="${key}" aria-label="Why?">?</button>`; }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-help]");
    if (!b) return;
    const h = HELP[b.dataset.help];
    if (!h) return;
    Sheet.open(`<h3>${esc(h[0])}</h3>${h[1] ? `<p>${esc(h[1])}</p>` : (root.helpExtra && root.helpExtra[b.dataset.help] ? root.helpExtra[b.dataset.help]() : "")}<div class="row"><button class="btn" data-close>Close</button></div>`);
  });

  let toastT = 0;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }

  root.UI = { Store, esc, card, cardText, chip, scale, pct, money, fmt, Sheet, qm, HELP, toast, RANK_SHOW };
})(this);
