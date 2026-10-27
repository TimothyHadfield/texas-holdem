/* profile-holdem.js — Hold'em's part of the player profile (shared kit: js/profile.js, never edit that one here):
 * the computer levels' ratings, the achievement list, today's Daily game and turning a finished game into a result.
 *
 * What counts as one game:
 *   tournament — from the deal to your finishing place (1st = a win);
 *   cash game  — a session, recorded when you leave the table (New table) after at least 10 hands:
 *                up = a win, down = a loss, even = a draw.
 * A game where you used Hint or Undo counts as "with help" and isn't rated. */
(function (root) {
  "use strict";
  // Elo of each level from heads-up tournaments (tools/sng.js, 50 BB, no limit, duplicate seats, 2026-10-27):
  // Medium beats Easy 68.8% (+137), Hard beats Medium 63.7% (+98). Easy anchored at 1200;
  // difference = 400·log10(p / (1 − p)), rounded.
  const LEVELS = [
    { id: "easy", name: "Easy", rating: 1200 },
    { id: "medium", name: "Medium", rating: 1340 },
    { id: "hard", name: "Hard", rating: 1440 },
  ];
  const RANK = { easy: 0, medium: 1, hard: 2 };
  const won = (c) => !!(c.last && c.last.won);
  const ex = (c) => (c.last && c.last.extra) || {};
  const achievements = [
    { id: "first", title: "First win", desc: "Win a tournament or a cash session", test: (c) => c.stats.wins >= 1 },
    { id: "tourney", title: "Last one standing", desc: "Win a tournament", test: (c) => won(c) && ex(c).format === "tourney" },
    { id: "medium", title: "Getting good", desc: "Win against Medium", test: (c) => won(c) && RANK[c.last.level] >= 1 },
    { id: "hard", title: "Shark", desc: "Win a tournament against Hard", test: (c) => won(c) && c.last.level === "hard" && ex(c).format === "tourney" },
    { id: "ring", title: "Full ring", desc: "Win a tournament against 8 computers", test: (c) => won(c) && ex(c).format === "tourney" && ex(c).players >= 9 },
    { id: "bigpot", title: "Monster pot", desc: "Win a pot of 100 big blinds", test: (c) => ex(c).bigPot >= 100 },
    { id: "up100", title: "Good session", desc: "Leave a cash table 100 big blinds up", test: (c) => ex(c).format === "cash" && ex(c).netBB >= 100 },
    { id: "quads", title: "Four of a kind", desc: "Win a hand with four of a kind", test: (c) => ex(c).best >= 7 },
    { id: "sflush", title: "Straight flush", desc: "Win a hand with a straight flush", test: (c) => ex(c).best >= 8 },
    { id: "streak", title: "Hat trick", desc: "Win 3 in a row", test: (c) => c.stats.bestStreak >= 3 },
    { id: "daily", title: "Daily grinder", desc: "3-day Daily streak", test: (c) => c.daily.streak >= 3 },
  ];

  // Today's Daily game: the same deal and the same computers for everyone that day.
  // A no-limit tournament against five computers (two Hard, two Medium, one Easy), 50 big blinds each.
  function dailySetup(seed) {
    seed = seed >>> 0;
    const levels = ["hard", "medium", "easy", "hard", "medium"];
    // the seats' order comes from the seed (same for everyone today)
    let x = seed || 1;
    for (let i = levels.length - 1; i > 0; i--) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; const j = x % (i + 1); [levels[i], levels[j]] = [levels[j], levels[i]]; }
    return { seed: (seed % 2147483646) + 1, levels, betting: "nl", format: "tourney", stack: 50, ante: "none" };
  }

  /** The finished game -> Profile.recordResult input.
   *  g: { format, levels: [computer levels at the table], players, place, netBB, bigPot, best, helped, daily } */
  function result(g) {
    const levels = (g.levels || []).filter((l) => RANK[l] != null);
    const level = levels.length ? levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : null; // the strongest computer at the table
    const mode = g.helped ? "help" : "computer";
    let w, draw = false;
    if (g.format === "tourney") w = g.place === 1;
    else { w = g.netBB > 0; draw = g.netBB === 0; if (draw) w = false; }
    const extra = { format: g.format, players: g.players, place: g.place || 0, netBB: Math.round(g.netBB || 0), bigPot: Math.round(g.bigPot || 0), best: g.best || 0 };
    return { mode, level: mode === "computer" ? level : null, won: w, draw, score: g.format === "tourney" ? g.place : Math.round(g.netBB || 0), daily: !!g.daily, extra };
  }

  const api = { LEVELS, RANK, achievements, dailySetup, result };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HoldemProfile = api;
})(typeof window !== "undefined" ? window : globalThis);
