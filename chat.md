# Texas Hold'em — chat log

## 2026-10-19 — first build (builder agent from the games wave)
- **Asked:** odds calculator (exact + Monte Carlo, AA vs KK ≈ 81.9%), no-limit table vs 1–8 computers with measured strength, odds overlay, hint, study mode with EV, home-game companion. Phase 2: all common variants, rules-check doc with sources, ideas doc, original art, online seats, QA pass.
- **Built:** everything in progress.md Status. Engine fixes from rules research: fixed-limit cap (Robert's Rules cash, TDA 50 tournament), heads-up big-blind rule (TDA 36-C).
- **Verified:** `npm test` (engine 69, home 14, rules-doc 114, poker 55); each new rule test seen failing on a broken engine (wheel removed, burns removed, heads-up rule off, caps off). phone-view at 393 px and laptop on every tab, zero console errors, no overflow.
- **Online:** "Play with friends" on the setup screen → name, Create table (uses the setup choices; open seats become computers) or Join with the 5-letter code → lobby → table. Verified with a scratchpad Playwright script: two WebKit iPhone pages on the live URL, 3 hands, same board on both, each sees only its own cards, zero console errors.
- **Fixed on the way:** native white `<select>` on iPhone (timer start blinds); primary buttons went dark on hover/tap.
- **Open:** QA pass findings (fresh agent).

## 2026-10-19 — QA fixes (v1.2.0)
- **QA:** fresh agent on the live site + 91k-hand fuzz found 7 medium, 10 low issues (see progress.md Status row).
- **Built:** engine fixes (each new test seen failing on the old engine first), table display fixes in play.js/study.js/style.css, Odds/Home fixes by a builder in worktree `texas-holdem-qafix`.
- **Verified:** `npm test` (76/14/114/36/55); phone-view 393 px + laptop of a showdown, a tournament win and 8 computers, zero console errors, no overflow.
- **Note:** progress.md was once edited with sed during the first build (rule slip; content checked, no harm).

## 2026-10-20 — visual design pass (v1.2.1)
- **Asked (Tim, via manager):** "review them again for design improvements especially visually."
- **Built:** CSS polish plus small markup tweaks in play.js (showdown tags class `sd`), study.js (graph at real pixel width), odds-tab.js (outs ? kept with its text). No rules or behaviour changes.
- **Verified:** `npm test` (76/21/114/36/55); phone-view 393 px + 1440 desktop on 12 states (odds empty/cards/chart, setup, hand, 8 seats, showdown, study, home timer/chips/settle, settings): zero console errors, no overflow, setup now fits without scrolling.
- **Open:** a fresh reviewer also flagged bet-chip placement and 9-seat crowding on phone; left as is (tuned by the QA pass).

## 2026-10-20 — sounds, celebrations, animations (v1.3.0)
- **Asked (Tim, via manager):** optional sounds that match what happens, win celebrations, fun animations, all switchable in Settings.
- **Built:** `js/fx.js` (copy of `_fx`), `js/table-fx.js` (state diff -> timeline), play.js effects (chips slide out/in, fold toss, pot to winner, count-up, all-in runout street by street), Settings "Sound & effects", home timer alarm through fx. Event map in progress.md Decisions.
- **Verified:** `npm test` (76/21/114/36/55 + fx 34; fx.test seen failing first: module missing). phone-view 393 + desktop: settings, dealing, mid-game, all-in runout, tournament win with confetti; Animations off = no delays/animation; fx Speed doesn't touch Computer speed; two-browsers online 4 hands, zero errors.
- **Open:** listen on a real iPhone.

## 2026-10-20 — real-table look (v1.4.0)
- **Asked (Tim, via manager):** make the table look like the real thing seen from your seat (words in progress.md Standing instructions).
- **Built:** shared table kit copied (`js/table.js`, `css/table.css`), fx.js re-copied at 1.0.3 (`data-fxspeed`, app.js workaround removed). Cards rewritten (jumbo index, real pips, courts, lattice backs); felt/rail/betting line; deck that shrinks, muck, chip stacks, bets, pot chips, dealer puck; deal-from-deck + 3-D flip, fold to muck. Your seat pinned to the bottom edge.
- **Verified:** `npm test` (76/21/114/36/55/34); phone-view 393 + desktop for 5 states (before/after); matrix at 320, 393, 659 landscape, 1280: zero errors, no scroll, overflow only where v1.3.0 already had it; deal filmstrip; Effects speed fast leaves Computer speed normal; two-browsers online 3 hands, boards match, zero errors. Live at 0624b71.
- **Open:** the independent reviewer sub-agent couldn't start (sub-agent limit); real iPhone look.

## 2026-10-20 — weird-scenario pass (v1.4.1)
- **Asked (Tim, via manager):** make each game perfect in scenarios it doesn't expect (words in progress.md). Plus the table-look reviewer that never ran, and the 320 px plate / landscape felt overflow.
- **Built:** reviewer (read-only) run; 46 scenarios listed and tested; fixes in play.js (keepOnScreen layout guard, tap guard, online one-move-per-decision, no re-deal on reload, emoji avatar, log scroll, sync between tabs, results sheet), app.js (Back walks tabs, storage sync), engine.js (equal-stack busts tie, rules-check row 26), style.css (compact plates, landscape side column, header truncation).
- **Verified:** `npm test` 79/21/118/36/55/34 on main; new engine tests seen failing first; behave.mjs 15/15 and layout.mjs (8 fixtures x 6 sizes) against the live site at b568145.
- **Open:** iPhone SE landscape with 9 players still crowded; reviewer look items left for Tim (progress.md NOT verified).

## 2026-10-21 → 10-27 — visibility pass (v1.4.2)
- **Asked (Tim, via manager):** make what's happening clearly visible; dense parts readable (words in progress.md). Paused 10-21 as a WIP commit, finished 10-27.
- **Built:** bigger card indices (all cards), bigger phone board, slimmer header/tabs on a sideways phone + winner line moved into the side column there, action tags flip off the board, keepOnScreen rewritten as a weighted "nearest clear spot" search (cards, then bets, then the dealer button; covering names/numbers/board counts triple, rail and travel cost), opponents' stacks hidden on phone once their cards are up, your stack hidden at a 7+ phone showdown.
- **Verified:** audit.mjs (manager scratchpad `vis/texas-holdem/`, 11 fixtures x 6 sizes, WebKit): overlap/legibility failures 40 -> see progress.md; taps on every action button hit their target in WebKit and Chrome at 393/320/568x320/1280; `npm test` green. One reviewer sub-agent run, its high items fixed.
- **Open:** 9-seat all-in on an iPhone SE sideways is still tight; laptop bets near the pot still ambiguous.

## 2026-10-27 — improvement pass (v1.5.0)
- **Asked (Tim, via manager):** "start building every single improvement you can think of after your competitor analysis" / "make our boardgames the best in every single metric we can." Brief: Hard ≥65% vs Medium, Replay last hand, Undo vs computer, _coach / _profile / _pwa kits, re-copy _fx; online layer untouched (another builder).
- **Built:** limit Hard (`hardLimit`), guided first game + Rules, My stats + achievements + Daily, Undo, Replay last hand, PWA. tools/sng.js + match.js for head-to-head.
- **Verified:** `npm test` all green incl. new improve.test (620; seen failing with a broken replay mapping and a wrong tutorial seed); pwa-check 18/18 (4/18 on the old build); headless WebKit flow at 393 px (tutorial to the end, Undo, Replay, Rules, My stats; 0 errors, no overflow), shots at 320, 852x393 landscape and 1440 laptop. One reviewer sub-agent: Top up vs Undo/Replay, Undo restoring big pot/best hand, tutorial resume after reload fixed.
- **Open:** NL/PL Hard 63–64% of heads-up tournaments (short of 65%); Tim's look calls in progress.md NOT verified.
