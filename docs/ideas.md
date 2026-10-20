# Ideas — data and theory that could make the Hold'em site better

Each idea is marked **Build** or **Skip** with the reason. Built ones say where they live.

| # | Idea | Call | Why / where |
|---|---|---|---|
| 1 | **Exact odds when possible, random deals otherwise** — enumerate every board when it's under 2.5M evaluations, else Monte Carlo | Build (done) | Odds tab. Exact on the flop and later, so the numbers match published tables. |
| 2 | **Outs, split by what they make** ("9 flush, 6 overcards") and % to hit by the next card / by the river | Build (done) | Odds tab + Play side panel. Board-only improvements aren't counted as outs. |
| 3 | **Pot odds vs win chance** — "need 25%, you have 38%" with a marker on the bar | Build (done) | Play HUD and Odds tab. The single most useful number while playing. |
| 4 | **Starting-hand chart** — 13×13 grid coloured by win % against 1–8 players (169 hand classes, 30k deals each) | Build (done) | Odds → Chart. Tap a square to load that hand. |
| 5 | **Decision EV in study mode** — chips each choice was worth, both "what you knew" and "with their cards" | Build (done) | Study → hand detail. |
| 6 | **"Lost to choices" vs "Luck"** — split results into decision quality and all-in luck (expected vs actual) | Build (done) | Study summary strip. Separates bad play from bad luck. |
| 7 | **Who-was-ahead graph** — everyone's win % at each street of a finished hand | Build (done) | Study → hand detail. |
| 8 | **Computers with measured strength** — bb/100 from long simulated sessions, with 95% ranges | Build (done) | Settings → "How strong?" (tools/measure.js). |
| 9 | **ICM fair deal** — split a tournament prize pool by chip stacks (Malmuth–Harville) | Build (done) | Home game → Settle up → Tournament. |
| 10 | **Fewest payments settle-up** — who pays whom, with the fewest transfers | Build (done) | Home game → Settle up → Cash. |
| 11 | **Chip colour counter** — count a stack by colour instead of adding by hand | Build (done) | Home game → Chips → chip button. |
| 12 | **Blind timer with average stack in big blinds** | Build (done) | Home game → Timer. Shows when the blinds are about to eat the table. |
| 13 | **Hint from the Hard computer with its reason** | Build (done) | Play → Hint. Same brain as the strongest computer. |
| 14 | Outs / pot-odds quiz (flash a spot, guess the %) | Skip for now | Good trainer, but a new screen; Tim decides new screens. Easy to add later. |
| 15 | Push/fold chart for short stacks (Nash ranges by stack depth) | Skip for now | Needs a solver run per stack size; the hint already plays short stacks. |
| 16 | GTO solver for postflop spots | Skip | Too heavy for a phone page; equity + pot odds cover what Tim asked for. |
| 17 | Opponent stats (VPIP / PFR per computer) | Skip | The computers don't adapt, so stats add little; might matter for online play later. |
| 18 | Hand-history import from poker sites | Skip | Other sites' formats change; out of scope. |
| 19 | Variance calculator ("how many hands until skill shows") | Skip for now | The 95% ranges in "How strong?" already show it. |
