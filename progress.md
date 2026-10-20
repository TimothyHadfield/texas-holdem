# Texas Hold'em — progress

## START HERE
Read order: this file → `CLAUDE.md` → `docs/rules-check.md` → `docs/ideas.md` → `chat.md`.
Last updated: 2026-10-20 (sounds, celebrations, animations; v1.3.0).
Live: https://timothyhadfield.github.io/texas-holdem/ · Repo: https://github.com/TimothyHadfield/texas-holdem

## Goal right now
Odds calculator, practice table vs 1–8 computers with measured strength, study mode with EV per decision, home-game helper (timer, chips, settle up), online seats via the shared `_online` module.

## Status
| Part | State |
|---|---|
| Evaluator + odds (exact/MC), outs, pot odds, starting-hand chart | Done, tested (poker.test 55) |
| Engine: NL / PL / FL, cash / tournament, antes (each / big-blind ante), side pots, heads-up rules | Done, tested (engine.test 76, rules-doc.test 114) |
| QA pass (fresh agent, live site, 91k-hand fuzz): 17 findings | Fixed: same-hand bust places, all-in capped in PL/FL, no unwinnable pot, uncalled chips not shown as a win/side pot, tournament win line, top-up session, luck only on all-ins, raise EV capped by stacks, 8-seat plates on screen, tags clear of names; Odds/Home bugs (verdict clipped, seen-cards overflow, timer off-tab, lone Them card, huge input, zero-chip settle, minutes stepper, chart "top 0%") by builder branch `qa-odds-home` |
| Computers Easy / Medium / Hard, hint, measured bb/100 | Done (see Decisions) |
| Study: hand list, everyone's cards, who-was-ahead graph, EV per decision, luck | Done |
| Home game: blind timer, chips, cash settle-up, tournament payouts + ICM deal | Done (home.test 14) |
| Visual design pass (2026-10-20, v1.2.1) | Done: showdown tags under the plate (cards visible), styled bet slider, bigger laptop cards, laptop Odds outs/pot under the slots, Study graph drawn at real width, setup fits a phone, tab labels aligned, 40px ? tap areas. Before/after shots in the manager's scratchpad `design/texas-holdem/` |
| Sound & effects (2026-10-20, v1.3.0) | Done: `js/fx.js` (unchanged copy of `../_fx/fx.js`), `js/table-fx.js` (state diff -> sounds/animations/celebrations, same for you, computers and online players), Settings section "Sound & effects". fx.test 34 |
| Online seats ("Play with friends") | Done: `js/online.js` (unchanged copy of `../_online/online.js`), `js/online-game.js` (game object + seat rotation), `js/online-play.js` (start / lobby screens). online.test 36; two headless iPhones played 3 hands on the live site through real Firebase (gameId `holdem`) |

## Standing instructions (Tim's words)
- "Make sure to get everything right like rules and artwork and specific numbers of cards, routes, details, etc."
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)
- Design: no page scroll; phone bottom tabs, laptop uses width; labels 1–3 words; "?" explains WHY; red→green for good/bad numbers. $0.

## Traps
- `fill:` in phone-view doesn't fire on number inputs; real typing works (checked by hand). Use `--eval` to set values.
- Port 8231 may be used by other game builders; serve on 8477.
- The AA vs KK "81.9%" is the average over suits; the no-shared-suit case is 81.06%. Tests check all three.
- `js/online.js` must stay an unchanged copy of `../_online/online.js`; re-copy it when that one changes. Online state must never carry `cfg.seed` in a view (it would reveal the deck); `publicView` deletes it and a test checks.
- Online two-browser check: `node tools/two-browsers.mjs <url> <outdir>` (Playwright WebKit from ~/.claude/tools, two iPhone pages, creates a room, plays 3 hands, leaves).
- In an online game, if a player who left (now a computer seat) is the only one allowed to deal, the next hand deals ~1 s after showdown.
- `js/fx.js` must stay an unchanged copy of `../_fx/fx.js`. Its Speed buttons use `data-speed` like Computer speed: app.js ignores clicks inside `.fx-set` (else they'd overwrite the computer speed). fx's fallback switch/seg CSS beats ours on equal specificity, so `.fx-set ...` rules in style.css restyle them to match.
- Playwright WebKit on Windows has no Web Audio (silent, `FX.supported` false) and runs rAF slowly, so confetti barely moves in screenshots.
- Measuring strength takes minutes: `node tools/measure.js` (see the file header for options).

## Decisions
- Measured bb/100 (6-seat ring, 2 of each): NL Easy −374 / Medium +163 / Hard +211 (20k hands, ±22–28); PL −407 / +152 / +255; FL −55 / +29 / +26. Heads-up Hard vs Medium: NL +52 ±18, PL +54 ±26, FL −5 ±15 (Hard ≈ Medium in fixed limit, said honestly in the app).
- Moving button (not dead button); all live hands shown at showdown; big-blind ante is blind-first (TDA 2024).
- Study EV of a raise assumes one caller; "You knew" uses random opponent hands, "Their cards" the real ones.
- Hand history keeps the last 150 hands in localStorage (`holdem:v1`).
- Event -> sound map (table-fx.js header): new hand = chips (blinds) + shuffle, then cardDeal per hole card in deal order; check = knock (custom, two raps); fold = cardSlide + cards fly to the middle; call = chip (chips if >= 4 BB); bet/raise/all in = chips (all in louder, plate flashes); street = bets slide into the pot + cardFlip per card; all-in runout = hands turn up, drumroll, then flop / turn / river one at a time (result line and tags fade in after); showdown = cardFlip per shown card; pot won = coins, pot slides to the winner, "+N" floats, stack counts up; your turn = turn chime + plate pulse (only when it becomes yours); you win a pot >= 50 BB = celebrate big; tournament won = celebrate win; knocked out / lost = celebrate lose; illegal move = error + action bar shakes; home-game blind level up = alarm (was a raw beep). Buttons = fx's default quiet tap.

## NOT verified
- On a real iPhone (only WebKit at 393 px via phone-view).
- Timer beep/vibrate on iOS (vibrate is not supported on iOS Safari; beep needs a tap first).
- Online play with real people on two real phones (only two headless WebKit pages against the live site + real Firebase), host hand-over when the creator drops, and reload mid-game rejoin.
- Fixed limit: Hard is not measurably stronger than Medium (heads-up −5 ±15 bb/100).
- Tag placement after the QA fixes was screenshotted only for 3 tables (2-computer showdown, tournament win, 8 computers preflop), not every seat count at showdown.
- Sounds were never heard: no Web Audio in headless WebKit; the event -> sound mapping is checked by fx.test (spy on FX.play) and by eye in phone-view. Real iPhone sound, silent switch, and pacing by ear are untested. Online sounds come from the same render diff (4 online hands ran with fx loaded, zero errors) but were not listened to.
- Online hands are not saved to Study (other players' cards are hidden, so the EV maths would be wrong).

## Rejected / parked
- ~~Outs quiz, push/fold chart~~ — parked, new screens are Tim's call (docs/ideas.md).
