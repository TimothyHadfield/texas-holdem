# Texas Hold'em — chat log

## 2026-10-19 — first build (builder agent from the games wave)
- **Asked:** odds calculator (exact + Monte Carlo, AA vs KK ≈ 81.9%), no-limit table vs 1–8 computers with measured strength, odds overlay, hint, study mode with EV, home-game companion. Phase 2: all common variants, rules-check doc with sources, ideas doc, original art, online seats, QA pass.
- **Built:** everything in progress.md Status. Engine fixes from rules research: fixed-limit cap (Robert's Rules cash, TDA 50 tournament), heads-up big-blind rule (TDA 36-C).
- **Verified:** `npm test` (engine 69, home 14, rules-doc 114, poker 55); each new rule test seen failing on a broken engine (wheel removed, burns removed, heads-up rule off, caps off). phone-view at 393 px and laptop on every tab, zero console errors, no overflow.
- **Open:** online seats, QA pass, live check.
