// Two headless iPhone-size WebKit pages play Hold'em online against each other
// through the real shared Firebase project. Usage: node two-browsers.mjs <url> <outdir>
import { createRequire } from "node:module";
const require = createRequire("C:/Users/timha/.claude/tools/package.json");
const { webkit, devices } = require("playwright");
const [url, out] = process.argv.slice(2);
const b = await webkit.launch();
const errs = [];
async function page(name) {
  const ctx = await b.newContext({ ...devices["iPhone 15"] });
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") errs.push(name + ": " + m.text()); });
  p.on("pageerror", (e) => errs.push(name + " EXC: " + e.message));
  await p.goto(url);
  await p.click("[data-tab=play]");
  // fewer seats: 3 (2 people + 1 computer)
  await p.evaluate(() => { const s = UI.Store.data.setup; s.opponents = 2; s.level = "easy"; s.format = "cash"; UI.Store.save(); PlayTab.render(); });
  await p.click("[data-online]");
  await p.fill("[data-oname]", name);
  await p.dispatchEvent("[data-oname]", "input");
  return p;
}
const A = await page("Ann");
const Bp = await page("Bob");
await A.click("[data-ocreate]");
await A.waitForSelector(".ocode", { timeout: 30000 });
const code = (await A.textContent(".ocode")).trim();
console.log("code", code);
await Bp.fill("[data-ocode]", code);
await Bp.dispatchEvent("[data-ocode]", "input");
await Bp.click("[data-ojoin]");
await A.waitForFunction(() => document.querySelectorAll(".oseat.human").length === 2, null, { timeout: 30000 });
await Bp.waitForSelector(".oseats", { timeout: 30000 });
await A.screenshot({ path: out + "/on-lobby-host.png" });
await Bp.screenshot({ path: out + "/on-lobby-guest.png" });
await A.click("[data-ostart]");
await A.waitForSelector(".table-area", { timeout: 30000 });
await Bp.waitForSelector(".table-area", { timeout: 30000 });
console.log("both at the table");

// Secrecy check from the guest page: their own two cards face up, nobody else's (before showdown).
const look = async (p) => p.evaluate(() => {
  const s = PlayTab && document.querySelectorAll(".seat");
  return { seats: s.length, heroFaces: document.querySelectorAll(".seat.hero .hole .cd:not(.back)").length, otherFaces: document.querySelectorAll(".seat:not(.hero) .hole .cd:not(.back)").length, street: document.querySelector(".result-line")?.textContent || "" };
});
console.log("A sees", JSON.stringify(await look(A)), "B sees", JSON.stringify(await look(Bp)));
await A.screenshot({ path: out + "/on-table-host.png" });
await Bp.screenshot({ path: out + "/on-table-guest.png" });

// Play: whoever has an enabled call button presses it; Next hand when it appears. ~3 hands.
let hands = 0, t0 = Date.now(), moves = 0;
while (hands < 3 && Date.now() - t0 < 150000) {
  for (const p of [A, Bp]) {
    const next = await p.$("[data-next]");
    if (next) { await next.click().catch(() => {}); hands++; await p.waitForTimeout(1500); continue; }
    const call = await p.$("[data-act=call]:not([disabled])");
    if (call) { await call.click().catch(() => {}); moves++; await p.waitForTimeout(800); }
  }
  await A.waitForTimeout(400);
}
console.log("hands dealt", hands, "moves", moves);
await A.screenshot({ path: out + "/on-later-host.png" });
await Bp.screenshot({ path: out + "/on-later-guest.png" });
const sameBoard = await Promise.all([A, Bp].map((p) => p.evaluate(() => [...document.querySelectorAll(".board .cd")].map((c) => c.textContent).join("|"))));
console.log("boards", sameBoard[0] === sameBoard[1] ? "match" : "DIFFER", sameBoard);
// close the room (host leaves in lobby = close; during play = leave + guest leaves)
await Bp.evaluate(() => OnlinePlay.leave());
await A.evaluate(() => OnlinePlay.leave());
console.log("errors", JSON.stringify(errs));
await b.close();
