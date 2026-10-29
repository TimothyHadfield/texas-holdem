# Texas Hold'em — progress

## START HERE
Read order: this file → `CLAUDE.md` → `docs/rules-check.md` → `docs/ideas.md` → `chat.md`.
Last updated: 2026-10-28 (v1.6.0, wave 3, live at 124e023: game types Short deck / Pineapple / Crazy Pineapple / Omaha on a "Type" row of the setup (off by default; online stays Hold'em); setup fits 320x568 and 568x320 without scrolling; waiting band shows who acts + pot + call price; Settings "Tournament blinds" 5/10/20 hands; Rules → "Game types" + "Videos" (5 YouTube links, oembed-checked). Earlier, v1.5.1 follow-up: leaving a table early counts as a loss in My stats: a cash game under 10 hands or a tournament you're still in (`recordSession` → `quitRecord`, result `extra.quit`); 10+ hand cash sessions still count their real result; nothing counts before the first hand ends, and the guided game never counts (it used to after 10 hands). Toast "Game left early: counted as a loss" (wording not Tim's). `tests/quit.test.mjs` (WebKit 393, in `npm test`, seen failing on v1.5.0); build 11. Before that: improvement pass, v1.5.0).
Live: https://timothyhadfield.github.io/texas-holdem/ · Repo: https://github.com/TimothyHadfield/texas-holdem

## Goal right now
Odds calculator, practice table vs 1–8 computers with measured strength, study mode with EV per decision, home-game helper (timer, chips, settle up), online seats via the shared `_online` module.

## Status
| Part | State |
|---|---|
| Evaluator + odds (exact/MC), outs, pot odds, starting-hand chart | Done, tested (poker.test 55) |
| Engine: NL / PL / FL, cash / tournament, antes (each / big-blind ante), side pots, heads-up rules | Done, tested (engine.test 79, rules-doc.test 118) |
| QA pass (fresh agent, live site, 91k-hand fuzz): 17 findings | Fixed: same-hand bust places, all-in capped in PL/FL, no unwinnable pot, uncalled chips not shown as a win/side pot, tournament win line, top-up session, luck only on all-ins, raise EV capped by stacks, 8-seat plates on screen, tags clear of names; Odds/Home bugs (verdict clipped, seen-cards overflow, timer off-tab, lone Them card, huge input, zero-chip settle, minutes stepper, chart "top 0%") by builder branch `qa-odds-home` |
| Computers Easy / Medium / Hard, hint, measured bb/100 | Done (see Decisions) |
| Study: hand list, everyone's cards, who-was-ahead graph, EV per decision, luck | Done |
| Home game: blind timer, chips, cash settle-up, tournament payouts + ICM deal | Done (home.test 14) |
| Visual design pass (2026-10-20, v1.2.1) | Done: showdown tags under the plate (cards visible), styled bet slider, bigger laptop cards, laptop Odds outs/pot under the slots, Study graph drawn at real width, setup fits a phone, tab labels aligned, 40px ? tap areas. Before/after shots in the manager's scratchpad `design/texas-holdem/` |
| Sound & effects (2026-10-20, v1.3.0) | Done: `js/fx.js` (unchanged copy of `../_fx/fx.js`), `js/table-fx.js` (state diff -> sounds/animations/celebrations, same for you, computers and online players), Settings section "Sound & effects". fx.test 34 |
| Real-table look (2026-10-20, v1.4.0) | Done: seen from your seat. Felt + leather rail + wood ring + betting line (stadium shape on laptop); jumbo-index 63:88 cards with real pip layouts (full face from 46 px wide) and blue lattice backs; deck by the pot shrinks as cards are dealt; messy muck takes folds and burns; clay chip stacks in front of everyone, bets pushed toward the line, pot chips; dealer puck. Cards fly from the deck and turn in 3-D; folds fly to the muck. Research in the manager's scratchpad `table/texas-holdem/real.md`, before/after shots in `before/` and `after/` there |
| Weird-scenario pass (2026-10-20, v1.4.1) | Done: 46 scenarios, 22 fixed (see "Edge pass" below). Live at b568145 |
| Visibility pass (2026-10-27, v1.4.2) | Done: card indices ~30% bigger (opponents' showdown index 9.7 -> 12.4 px, phone board 13.4 -> 18.8 px), phone board 37 -> 41 px, sideways phone: slimmer bars + winner line in the column (felt 24% -> 29% of screen), weighted clear-spot search in keepOnScreen. Overlap failures 40 -> 8 of 66 shots. Shots + audit.mjs in the manager's scratchpad `vis/texas-holdem/` |
| Improvement pass (2026-10-27, v1.5.0) | Done: guided first game (`js/coach-holdem.js`, seed 416 = you hold A-K) + Rules sheet (Settings → Learn, Menu → Rules); My stats / achievements / Daily game (`js/profile-holdem.js`; rated unless Hint/Undo used; cash counts at 10+ hands); Undo (HUD button, Settings switch) and Replay last hand (done row), both rebuilt from `G.pre`; offline/install kit (`js/pwa.js`, `sw.js`, manifest, icons; pwa-check 18/18); limit Hard rewritten (`hardLimit` in bots.js). improve.test 620 |
| Wave 3 (2026-10-28, v1.6.0) | Done: `P.score/describeFor/stdCategory/deckFor/holeCount/equityFor` in poker.js (short deck: flush > full house, A-6-7-8-9 straight; Omaha exactly 2+3); engine `cfg.game`, Pineapple discard after preflop betting, Crazy after flop betting (discards hidden); bots game-aware (`chooseDiscard`, `omahaDraw`, Hard defends wider in Omaha). Ladder, heads-up tournaments: Hard>Medium short 56.3 / pineapple 64.0 / crazy 58.8 / omaha 56.5 %; Medium>Easy 67.5 / 69.3 / 71.5 / 64.5 %. variants.test 64 (in npm test). Hold'em deals and bot play unchanged |
| Online seats ("Play with friends") | Done: `js/online.js` (unchanged copy of `../_online/online.js`), `js/online-game.js` (game object + seat rotation), `js/online-play.js` (start / lobby screens). online.test 36; two headless iPhones played 3 hands on the live site through real Firebase (gameId `holdem`) |

## Standing instructions (Tim's words)
- "Make sure to get everything right like rules and artwork and specific numbers of cards, routes, details, etc."
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20)
- "could you also make sure that each of the games also have a look to them so that the game (either board or card layout) looks almost identical to how the board or card layout looks like in real life, so it's easy to understand if you've already played it before, and also so it feels more like you're actually playing in real life rather than you're playing it online. Even things like how youre cards or other things are laid out infront of you, make it look like they are actual cards laid out similar to how it looks like in real life. Make the decks look like actual decks. Make the board have the same design as it does in real life with the same layouts. It should look kind of like you're looking through a camera that is connected to a user's glasses that is playing in real life (not actually, but the layout and style of everything should be similar)." (2026-10-20)
- "I've noticed the games often have good user interfaces but could be improved especially when a scenario happens that the game might've not really thought about or whatnot. Could you focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird." (2026-10-20)
- "for a lot of the games the cards or board layout is too small to easily see what's going on. Some games just need small design imporvements like filling the screen with the board view and fitting the cards and other things in the empty space, some have severe errors like TTR. Fix this so the view of what's happening and where everything is is very clear. Consider parts of the board that are dense in what's happening and if the user can reasonably see it." (2026-10-21)
- Design: no page scroll; phone bottom tabs, laptop uses width; labels 1–3 words; "?" explains WHY; red→green for good/bad numbers. $0.

## Traps
- **Kits re-copied 2026-10-28 (wave 3 sweep):** game-coach 1.2.0 (first-visit offer `place:"auto"` + `avoid: [".setup-start"]`) and game-pwa 1.4.0; coach/app/pwa ?v=15, data-version 15 (other files still ?v=14). Copies stay byte-identical to `../_coach` / `../_pwa`.
- **online.js cache stamp (2026-10-27):** every import of `js/online.js` uses `?v=a3d0418b`, the `_online` content stamp. After a re-copy: put the new stamp from `node ../_online/tools/stamp.mjs` there, bump the importing file's `?v=` (and pwa.js `data-version`), then `node ../_online/tools/stamp.mjs --check .` must say OK.
- `fill:` in phone-view doesn't fire on number inputs; real typing works (checked by hand). Use `--eval` to set values.
- Port 8231 may be used by other game builders; serve on 8477.
- The AA vs KK "81.9%" is the average over suits; the no-shared-suit case is 81.06%. Tests check all three.
- `js/online.js` must stay an unchanged copy of `../_online/online.js`; re-copy it when that one changes. Online state must never carry `cfg.seed` in a view (it would reveal the deck); `publicView` deletes it and a test checks.
- Online two-browser check: `node tools/two-browsers.mjs <url> <outdir>` (Playwright WebKit from ~/.claude/tools, two iPhone pages, creates a room, plays 3 hands, leaves).
- In an online game, if a player who left (now a computer seat) is the only one allowed to deal, the next hand deals ~1 s after showdown.
- `js/table.js` and `css/table.css` must stay unchanged copies of `../_table/`; re-copy when those change.
- `js/fx.js` must stay an unchanged copy of `../_fx/fx.js` (1.0.3+). Its Speed buttons now use `data-fxspeed`, so the old app.js `.fx-set` click workaround was removed (checked: Effects fast leaves Computer speed "normal"). fx's fallback switch/seg CSS beats ours on equal specificity, so `.fx-set ...` rules in style.css restyle them to match.
- Playwright WebKit on Windows has no Web Audio (silent, `FX.supported` false) and runs rAF slowly, so confetti barely moves in screenshots.
- Layout guard: `keepOnScreen()` in play.js runs after every render (and again next frame): seats back on screen, then your stack, each player's cards, each bet and the dealer button slide to the cheapest nearby spot (cost = covered area, x3 for plates/tags/board/result line/already placed items, + off-felt and rail-corner penalties, + 3 per px moved). Tune the weights there, and re-run `audit.mjs` (manager scratchpad `vis/texas-holdem/`, serve on your own port with `--bind 127.0.0.1`: port 47613 was shared with another process on 10-27). Measure the real `.table-area` size, not an estimate. Compact plates kick in under 360 px wide and in phone landscape (max-height 520).
- Taps on action buttons are ignored for 350 ms after a new decision appears (`TAP_GUARD_MS`); online, one move per decision is sent until the server answers or 8 s pass.
- Edge-pass test scripts (behave.mjs, layout.mjs, fixtures.js) live in the manager's scratchpad `edge/texas-holdem/`; serve with `python -m http.server <port> --directory <folder>` (a bare port can hit another builder's server).
- Measuring strength takes minutes: `node tools/measure.js` (see the file header for options). Head-to-head: `node tools/sng.js [pairs] [nl|pl|fl] [a] [b]` (heads-up tournaments, the target metric) and `node tools/match.js` (100-hand matches); `BOTS=<file>` swaps in another bots.js to compare.
- `js/coach.js`, `css/coach.css`, `js/profile.js`, `css/profile.css`, `js/pwa.js`, `sw.js`, `tools/pwa-check.mjs`, `tools/make-icons.mjs` are unchanged kit copies (marked `-text` in .gitattributes). Bump `?v=` and pwa.js `data-version` together in index.html on each release. Offline check: `node tools/pwa-check.mjs`.
- Headless WebKit runs rAF slowly, so play.js calls `COACH.update()` after each render during the guided game. Top up after a hand clears `G.pre` (that hand can't be undone or replayed).

## Decisions
- Measured bb/100 (6-seat ring, 2 of each): NL Easy −374 / Medium +163 / Hard +211 (20k hands, ±22–28); PL −407 / +152 / +255; FL −55 / +29 / +26. Heads-up Hard vs Medium: NL +52 ±18, PL +54 ±26, FL −5 ±15 (Hard ≈ Medium in fixed limit, said honestly in the app).
- Hard vs Medium, heads-up tournaments 50 BB (sng.js, 800 duplicate games, 2026-10-27): NL 63.7%, PL 63.0% (unchanged; 88.7% of 100-hand matches), FL 58.3% → 68.4% after `hardLimit`. Medium beats Easy 68.8%. Profile ratings Easy 1200 / Medium 1340 / Hard 1440 from these.
- Moving button (not dead button); all live hands shown at showdown; big-blind ante is blind-first (TDA 2024).
- Study EV of a raise assumes one caller; "You knew" uses random opponent hands, "Their cards" the real ones.
- Table look: deck + muck sit by the pot (casino dealer's spot); burns go in the muck; your folded cards stay dimmed in front of you; brass name placards; chip colours by blind size; phone hides opponents' stacks at 7+ players; dealer puck says "DEALER" on laptop, "D" on phone (on phone it sits just past the plate).
- Tournament: players out in the same hand place by starting stack; equal stacks share the better place (1, 2, 3, 3) — TDA, rules-check row 26.
- Edge pass look choices (plainest version, Tim's call): phone landscape puts odds + buttons in a right-hand column; compact plates under 360 px; status tag on the inner corner for right-hand seats; long header text ends in "…"; Back button walks the tabs; two open tabs follow each other.
- Hand history keeps the last 150 hands in localStorage (`holdem:v1`).
- Event -> sound map (table-fx.js header): new hand = chips (blinds) + shuffle, then cardDeal per hole card in deal order; check = knock (custom, two raps); fold = cardSlide + cards fly to the middle; call = chip (chips if >= 4 BB); bet/raise/all in = chips (all in louder, plate flashes); street = bets slide into the pot + cardFlip per card; all-in runout = hands turn up, drumroll, then flop / turn / river one at a time (result line and tags fade in after); showdown = cardFlip per shown card; pot won = coins, pot slides to the winner, "+N" floats, stack counts up; your turn = turn chime + plate pulse (only when it becomes yours); you win a pot >= 50 BB = celebrate big; tournament won = celebrate win; knocked out / lost = celebrate lose; illegal move = error + action bar shakes; home-game blind level up = alarm (was a raw beep). Buttons = fx's default quiet tap.

## NOT verified
- On a real iPhone (only WebKit at 393 px via phone-view).
- Wave 3 look calls not Tim's: "Type" row + picker sheet wording, waiting-band text, discard buttons as card text, header short names ("Crazy P."), blinds 5/10/20, format note behind a ? on short screens, two-column sideways setup, Omaha auto-switching to pot limit, default-blue video links.
- Game types: only bot-vs-bot ladders + fuzz (40 games each); Study/Replay/Undo of a discard hand checked by tests only, not by hand in a browser. Ladders are ±4.9 % (400 games).
- Timer beep/vibrate on iOS (vibrate is not supported on iOS Safari; beep needs a tap first).
- Online play with real people on two real phones (only two headless WebKit pages against the live site + real Firebase), host hand-over when the creator drops, and reload mid-game rejoin.
- NL/PL Hard beats Medium in 63–64% of heads-up tournaments (target 65%; 88.7% over 100-hand matches). FL 100-hand matches only 58.7% (+9.9 ±9.2 bb/100). The app's strength text / measure.js ring numbers were not re-measured after `hardLimit`; online limit tables use the new Hard too.
- Improvement-pass look choices (plainest, Tim's call): manifest name "Texas Hold'em" / "Hold'em"; My stats top-right of setup, Daily game beside Play with friends; Undo in the HUD + Settings switch; Replay as a third button in the done row; Daily = NL tournament vs 5 computers, 50 BB; achievement names; tutorial wording. At 320 px the "Deal me in" button sits just below the fold on the setup screen.
- Tag placement after the QA fixes was screenshotted only for 3 tables (2-computer showdown, tournament win, 8 computers preflop), not every seat count at showdown.
- Sounds were never heard: no Web Audio in headless WebKit; the event -> sound mapping is checked by fx.test (spy on FX.play) and by eye in phone-view. Real iPhone sound, silent switch, and pacing by ear are untested. Online sounds come from the same render diff (4 online hands ran with fx loaded, zero errors) but were not listened to.
- Real-table look: fold-to-muck animation seen only in a filmstrip frame. (320 px plate and landscape felt overflow fixed in v1.4.1.)
- iPhone SE landscape (568x320) with 9 players all in is still tight (bets close together, a card corner under a plate); laptop bets near the pot can still look like a neighbour's; phone portrait keeps an empty ~55 px band above the buttons when it's not your raise (reserved so buttons don't jump).
- Visibility look choices (plainest, Tim's call): opponents' chip stacks hide on phone once their cards are turned up; your own stack hides at a 7+ player phone showdown; winner line moves to the side column on a sideways phone.
- Reviewer look items left for Tim: your cards over the rail, laptop bets ambiguous, dealer button far from its seat, stacks all look the same size, empty band above buttons, phone cards have no pips, plain setup form.
- Not run: duplicate names, online AFK/host leaving (shared online.js), storage full, 10+ min in the background on a real phone.
- docs/rules-check.md row 26 was added with a python script (rule slip; content checked by rules-doc.test).
- Online hands are not saved to Study (other players' cards are hidden, so the EV maths would be wrong).

## Edge pass — weird scenarios (2026-10-20)
46 scenarios (full table: manager's scratchpad `edge/texas-holdem/scenarios.md`). 22 failed first and are fixed, 18 passed already, 2 left, 4 argued only. Re-run on the live site at b568145: 15/15 behaviour checks pass; layout matrix same as local.
| Area | Fixed |
|---|---|
| Odd screens | 320 px plates off screen, landscape table past the felt, bets on the pot, header pushing Menu off, tab labels wrapping, result line on cards |
| Odd taps | double-tap Check / Next hand, online triple tap sending 3 moves |
| Odd devices | reload re-dealing every card, Back leaving the site, two tabs out of sync, laptop log not at latest line, emoji avatar glyph |
| Rules | equal-stack same-hand busts tie for the place (engine tests seen failing first) |
| Other | tournament results sheet closing itself after "Finish it", online log "Tim post" |

## Rejected / parked
- ~~Outs quiz, push/fold chart~~ — parked, new screens are Tim's call (docs/ideas.md).
