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
