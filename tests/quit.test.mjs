// Browser test: leaving a table early (a cash game under 10 hands, a tournament you're still in) counts as a
// loss in My stats; a table left before the first hand is over and the guided game never count.
//   node tests/quit.test.mjs        (needs Playwright in ~/.claude/tools; WebKit)
//   HOLDEM_ROOT=<other checkout> runs it against older code.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import fs from "node:fs";
const require = createRequire(join(homedir(), ".claude/tools/") + "x.js");
const pw = require("playwright");
const ROOT = process.env.HOLDEM_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");

const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": T[extname(p)] || "application/octet-stream" }); r.end(d); } });
});
await new Promise((ok) => srv.listen(0, ok));
const url = "http://localhost:" + srv.address().port + "/?nosw#play";
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "  PASS  " : "  FAIL  ") + msg); if (!ok) failed++; };

const browser = await pw.webkit.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.PlayTab && window.Profile && window.HoldemCoach);
  // no guided-game offer, fast computers
  await page.evaluate(() => { localStorage.setItem("coach-offer:" + HoldemCoach.ID, "1"); UI.Store.data.settings.speed = "fast"; UI.Store.save(); });
  await page.reload();
  await page.waitForFunction(() => window.PlayTab && window.Profile);
  const stats = () => page.evaluate(() => Profile.stats());
  const hands = () => page.evaluate(() => (UI.Store.data.game && UI.Store.data.game.hands) || 0);
  // play until one hand is over: fold when you can, else check or call (tapping the real buttons by script)
  const playHand = async () => {
    for (let i = 0; i < 400 && (await hands()) < 1; i++) {
      await page.evaluate(() => {
        const b = ["fold", "check", "call"].map((a) => document.querySelector('[data-act="' + a + '"]')).find((x) => x && !x.disabled);
        if (b) b.click();
      });
      await page.waitForTimeout(150);
    }
    check((await hands()) >= 1, "a hand was played");
  };
  const leave = async () => { await page.evaluate(() => PlayTab.newGame()); await page.waitForFunction(() => !UI.Store.data.game); };

  await page.waitForSelector("[data-start]", { state: "visible" });
  await page.waitForTimeout(400);
  await page.click("[data-start]");
  await page.waitForFunction(() => UI.Store.data.game);
  await leave();
  let s = await stats();
  check(s.games === 0, "a table left before the first hand is over is not counted (" + s.games + " games)");

  await page.click("[data-start]");
  await page.waitForFunction(() => UI.Store.data.game);
  await playHand();
  check((await stats()).games === 0, "nothing counted while you play");
  await leave();
  s = await stats();
  check(s.games === 1 && s.losses === 1, "leaving after 1 hand counts as a loss (" + s.games + " games, " + s.losses + " lost)");

  // the guided game, left after a hand: never counts
  await page.evaluate(() => PlayTab.startTutorial());
  await page.waitForFunction(() => UI.Store.data.game && UI.Store.data.game.tutorial);
  await page.addStyleTag({ content: ".coach-layer{display:none!important}" });
  await playHand();
  await leave();
  s = await stats();
  check(s.games === 1 && s.losses === 1, "leaving the guided game is not counted (" + s.games + " games, " + s.losses + " lost)");
  check(!errs.length, "no page errors " + errs.join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? failed + " FAILED" : "all passed");
process.exit(failed ? 1 : 0);
