// Fit test: a crowded table (9 players, long names, 6-7 digit stacks, 5 board cards, side pots, last-action
// tags, your raise slider open) and a normal early table, at 5 screen sizes. Checks that what you need to decide
// is on screen without scrolling, numbers are >= 12 px and not cut or covered, names stay identifiable, tap
// targets are big enough, and nothing scrolls sideways.
//   node tests/fit-ui.mjs                 (Playwright WebKit from ~/.claude/tools)
//   HOLDEM_ROOT=<other checkout> runs it against older code; FIT_SHOTS=<dir> saves screenshots.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import fs from "node:fs";
const require = createRequire(join(homedir(), ".claude/tools/") + "x.js");
const pw = require("playwright");
const ROOT = process.env.HOLDEM_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.env.FIT_SHOTS || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": T[extname(p)] || "application/octet-stream", "cache-control": "no-store" }); r.end(d); } });
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const url = "http://127.0.0.1:" + srv.address().port + "/?nosw#play";
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "  PASS  " : "  FAIL  ") + msg); if (!ok) failed++; };

const SIZES = [
  { name: "393x659", width: 393, height: 659, mobile: true },
  { name: "320x568", width: 320, height: 568, mobile: true },
  { name: "659x393", width: 659, height: 393, mobile: true },
  { name: "1280x800", width: 1280, height: 800, mobile: false },
  { name: "1440x900", width: 1440, height: 900, mobile: false },
];

// Built inside the page from the real engine: the river, you to act facing a bet with the raise slider open.
function buildTable(kind) {
  const crowded = kind === "crowded";
  const names = crowded
    ? ["You", "Maximiliana", "Bartholomew", "Christopher", "Evangelina", "Fitzgerald", "Guinevere", "Hieronymus", "Konstantin"]
    : ["You", "Ada", "Ben", "Cleo"];
  const levels = ["easy", "medium", "hard"];
  const players = names.map((n, i) => (i ? { name: n, kind: "bot", level: levels[i % 3] } : { name: n, kind: "human" }));
  const cfg = crowded
    ? { game: "holdem", betting: "nl", format: "cash", sb: 5000, bb: 10000, startStack: 2000000, seed: 4242, ante: 0, anteType: "each", levelHands: 10, anteFromLevel: 99 }
    : { game: "holdem", betting: "nl", format: "cash", sb: 10, bb: 20, startStack: 2000, seed: 77, ante: 0, anteType: "each", levelHands: 10, anteFromLevel: 99 };
  const E = Engine;
  let s = E.newGame(cfg, players);
  if (crowded) [3456789, 2987654, 150000, 1876543, 4321098, 420000, 2468024, 1357913, 999999].forEach((v, i) => { s.seats[i].stack = v; });
  s = E.apply(s, { type: "deal" });
  const shorts = new Set(crowded ? [2, 5] : []);
  for (let k = 0; k < 400; k++) {
    const L = E.legal(s);
    if (!L) break;
    const i = s.toAct;
    if (!crowded) { if (i === 0 && s.street === "preflop") break; s = E.apply(s, { type: L.canCheck ? "check" : "call" }); continue; }
    if (i === 0 && s.board.length === 5 && !L.canCheck) break;
    let a;
    if (s.street === "preflop" && shorts.has(i)) a = { type: "allin" };
    else if (s.street === "river" && i !== 0 && L.canCheck && L.canRaise) a = { type: "raise", to: 250000 };
    else if (s.street === "river" && !L.canCheck && i % 4 === 3) a = { type: "fold" };
    else if (s.street === "river" && !L.canCheck && i === 6 && L.canRaise) a = { type: "raise", to: Math.min(L.maxTo, 750000) };
    else a = { type: L.canCheck ? "check" : "call" };
    s = E.apply(s, a);
  }
  UI.Store.data.game = { state: s, decisions: [], startStacks: s.seats.map((p) => p.stack), handLog: null, done: false, hands: 0, bigPot: 0, best: 0, helped: true, tutorial: false, daily: null };
  UI.Store.save();
  PlayTab.sync();
  return { toAct: s.toAct, board: s.board.length, seats: s.seats.length, sidePots: s.seats.filter((p) => p.allIn).length };
}

// Everything measured in the page.
function measure() {
  const vw = innerWidth, vh = innerHeight, out = { problems: [], counts: {} };
  const bad = (m) => out.problems.push(m);
  const se = document.scrollingElement;
  if (se.scrollWidth > vw + 1) bad(`page scrolls sideways (${se.scrollWidth} > ${vw})`);
  if (se.scrollHeight > vh + 1) bad(`page scrolls down (${se.scrollHeight} > ${vh})`);
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
  const textRect = (e) => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); };
  const inside = (a, b, t = 1) => a.left >= b.left - t && a.right <= b.right + t && a.top >= b.top - t && a.bottom <= b.bottom + t;
  const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const label = (e) => (e.closest("[data-seat]") ? "seat " + e.closest("[data-seat]").dataset.seat + " " : "") + (e.className || e.tagName) + ' "' + e.textContent.trim().slice(0, 18) + '"';
  // (every table part answers elementFromPoint while measuring)
  const pe = document.createElement("style");
  pe.textContent = ".table-area *, .actions * { pointer-events: auto !important; }";
  document.head.appendChild(pe);
  const nums = Array.from(document.querySelectorAll(".table-area .seat .st, .table-area .seatbet .amt, .table-area .pot .amt, #amt, .act-row .btn small, .wait b")).filter(vis);
  out.counts.numbers = nums.length;
  let minNum = 99;
  for (const e of nums) {
    const fs = parseFloat(getComputedStyle(e).fontSize);
    minNum = Math.min(minNum, fs);
    if (fs < 12) bad(`number under 12 px: ${label(e)} ${fs}px`);
    const t = textRect(e);
    if (!inside(t, { left: 0, top: 0, right: vw, bottom: vh })) bad(`number off screen: ${label(e)}`);
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if ((cs.overflowX !== "visible" || cs.overflowY !== "visible") && !inside(t, a.getBoundingClientRect())) { bad(`number cut by ${a.className || a.tagName}: ${label(e)}`); break; }
    }
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible") bad(`number ellipsised: ${label(e)}`);
    // painted on top? sample points along the number: what's drawn there must be the number's own plate / bet / pot / button
    const own = e.closest(".plate, .bet, .pot, .btn, .sizer, .wait") || e;
    const ys = [t.top + t.height * 0.5];
    let hidden = 0, by = null;
    for (let k = 0; k < 5; k++) {
      const x = t.left + 2 + (t.width - 4) * k / 4;
      for (const y of ys) {
        const top = document.elementFromPoint(x, y);
        if (top && !own.contains(top) && !top.contains(own)) { hidden++; by = top; }
      }
    }
    if (hidden) bad(`number covered (${hidden}/5 points) by ${label(by)}: ${label(e)}`);
  }
  out.counts.minNumberPx = minNum;
  // names: >= 10 px, and if cut short at least 7 letters still show
  let minName = 99;
  for (const e of Array.from(document.querySelectorAll(".table-area .seat .nm")).filter(vis)) {
    const fs = parseFloat(getComputedStyle(e).fontSize), full = e.textContent.trim();
    minName = Math.min(minName, fs);
    if (fs < 10) bad(`name under 10 px: ${label(e)} ${fs}px`);
    if (e.scrollWidth > e.clientWidth + 1) {
      const shown = Math.floor(full.length * e.clientWidth / e.scrollWidth) - 1;
      if (shown < Math.min(7, full.length)) bad(`name cut to ~${shown} letters: ${full}`);
      else if (vw >= 900 && full.length <= 12) bad(`laptop has room, but name cut: ${full}`);
    }
    if (!inside(e.getBoundingClientRect(), { left: 0, top: 0, right: vw, bottom: vh })) bad(`name off screen: ${full}`);
  }
  out.counts.minNamePx = minName;
  // last-action / all-in labels: readable words
  for (const e of Array.from(document.querySelectorAll(".table-area .seat .tag")).filter(vis)) {
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 10) bad(`action tag under 10 px: ${label(e)} ${fs}px`);
    if (!inside(e.getBoundingClientRect(), { left: 0, top: 0, right: vw, bottom: vh })) bad(`tag off screen: ${label(e)}`);
  }
  out.counts.tags = document.querySelectorAll(".table-area .seat .tag").length;
  // board: all five cards on screen, index readable
  const board = Array.from(document.querySelectorAll(".table-area .board .cd"));
  out.counts.board = board.length;
  for (const c of board) if (!inside(c.getBoundingClientRect(), { left: 0, top: 0, right: vw, bottom: vh })) bad("board card off screen");
  // controls: on screen, big enough to tap
  const ctrls = Array.from(document.querySelectorAll(".act-row .btn, .sizer .btn, .sizer [data-range]")).filter(vis);
  out.counts.controls = ctrls.length;
  let minTap = 99;
  for (const b of ctrls) {
    const r = b.getBoundingClientRect();
    minTap = Math.min(minTap, r.height);
    if (!inside(r, { left: 0, top: 0, right: vw, bottom: vh })) bad(`control off screen: ${label(b)}`);
    if (r.height < 36 || r.width < 36) bad(`control smaller than 36 px: ${label(b)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  out.counts.minTapPx = Math.round(minTap);
  // every seat's plate fully inside the table area
  const ta = document.querySelector(".table-area").getBoundingClientRect();
  for (const p of Array.from(document.querySelectorAll(".table-area .plate")).filter(vis)) if (!inside(p.getBoundingClientRect(), ta, 2)) bad(`plate outside the table: ${label(p)}`);
  // plates and turned cards must not overlap each other
  const plates = Array.from(document.querySelectorAll(".table-area .plate")).filter(vis);
  for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) if (area(plates[i].getBoundingClientRect(), plates[j].getBoundingClientRect()) > 6) bad(`plates overlap: ${label(plates[i])} / ${label(plates[j])}`);
  pe.remove();
  return out;
}

const browser = await pw.webkit.launch();
try {
  for (const sz of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: sz.width, height: sz.height }, hasTouch: sz.mobile, isMobile: sz.mobile });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.PlayTab && window.HoldemCoach && window.Engine);
    await page.evaluate(() => { localStorage.setItem("coach-offer:" + HoldemCoach.ID, "1"); UI.Store.data.settings.speed = "fast"; UI.Store.data.settings.overlay = true; UI.Store.save(); });
    await page.reload();
    await page.waitForFunction(() => window.PlayTab && window.Engine);
    for (const kind of ["crowded", "normal"]) {
      const info = await page.evaluate(buildTable, kind);
      await page.waitForTimeout(2500); // deal animations and keepOnScreen's second pass
      if (kind === "crowded") check(info.toAct === 0 && info.board === 5 && info.seats === 9 && info.sidePots >= 2, `${sz.name} crowded table built (you to act on the river, ${info.sidePots} all in)`);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${kind}-${sz.name}.png`) });
      const m = await page.evaluate(measure);
      check(!m.problems.length, `${sz.name} ${kind}: ${JSON.stringify(m.counts)}${m.problems.length ? "\n        " + m.problems.join("\n        ") : ""}`);
    }
    check(!errs.length, `${sz.name} no console errors ${errs.join(" | ")}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? failed + " FAILED" : "all passed");
process.exit(failed ? 1 : 0);
