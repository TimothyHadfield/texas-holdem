# Texas Hold'em — project rules

Static site (GitHub Pages, no build step). Repo `TimothyHadfield/texas-holdem`, live https://timothyhadfield.github.io/texas-holdem/

- Read `progress.md` first. Tim's global rules and `Code Projects/CLAUDE.md` apply.
- Engine is pure: `newGame / apply(state, action) / view(state, seat) / legal(state)` in `js/engine.js`. Never put UI or randomness outside the seeded deck into it; online play depends on that.
- Tests: `npm test` (node only, ~1 min). `docs/rules-check.md` is checked by `tests/rules-doc.test.js`: add a rule there with its test name and two sources.
- Bump `?v=` on every script/style tag in `index.html` and the version in `js/app.js` on each release (iPhone caches hard).
- Computer strength numbers come from `node tools/measure.js` — never guess them.
- Hub colours only (see `css/style.css :root`). Labels 1–3 words; explanations behind "?".
