# Rules check — Texas Hold'em

Every rule the engine (`js/engine.js`) plays by, the two sources it was checked against, and the test that
proves it. `tests/rules-doc.test.js` reads this file: every name in the **Test** column must exist in a test
file, the rule count must match, and every number in **Counts** is checked against the real engine.
Checked 2026-10-19.

## Sources

| Key | Source |
|---|---|
| TDA | Poker Tournament Directors Association, 2024 Rules — https://www.pokertda.com/view-poker-tda-rules/ |
| RR | Robert's Rules of Poker (Bob Ciaffone), version 10 — https://www.pagat.com/docs/RobsPkrRulesHome.pdf |
| WP | Wikipedia, "Texas hold 'em" and "Betting in poker" — https://en.wikipedia.org/wiki/Texas_hold_%27em , https://en.wikipedia.org/wiki/Betting_in_poker |
| PG | Pagat, "Texas Hold'em" — https://www.pagat.com/poker/variants/texasholdem.html |
| DC | Deuces Cracked glossary, "Cap" (bet + three raises; usually lifted heads-up) — https://www.deucescracked.com/learn/poker-glossary/cap |
| WSOP | WSOP tournament rules (big-blind ante, button) — https://www.wsop.com/tournaments/rules/ |

## Counts

| Count | Value |
|---|---|
| Cards in the deck | 52 |
| Hole cards per player | 2 |
| Community cards | 5 |
| Flop cards | 3 |
| Burn cards per hand (before flop, turn, river) | 3 |
| Betting rounds | 4 |
| Hand categories | 9 |
| Distinct 5-card hands | 2598960 |
| Starting-hand classes | 169 |
| Most players at the table | 9 |
| Bets in a fixed-limit round before the cap | 4 |

## Rules

| # | Rule | Sources | Test |
|---|---|---|---|
| 1 | Small blind is the first player left of the button, big blind the next | TDA, RR, WP | `small blind left of button` |
| 2 | Preflop, the first to act is left of the big blind | RR, WP | `first to act preflop is left of the big blind` |
| 3 | The big blind gets the option to raise when everyone just calls | RR, WP | `big blind gets the option` |
| 4 | After the flop, the first live player left of the button acts first | RR, WP | `first to act after the flop is left of the button` |
| 5 | Flop is 3 cards, then turn and river 1 each, a card burned before each | RR, PG | `three flop cards` |
| 6 | Button moves one seat left every hand | RR, WP | `button moves one seat left` |
| 7 | Heads-up: the button posts the small blind and acts first preflop | TDA 34, RR | `heads-up: the button acts first preflop` |
| 8 | Heads-up: the big blind acts first after the flop | TDA 34, RR | `heads-up: the big blind acts first after the flop` |
| 9 | Going heads-up, nobody posts the big blind twice in a row | TDA 36-C, RR | `after going heads-up the last big blind does not post it again` |
| 10 | No limit: a raise must be at least the size of the last bet or raise | TDA 43, RR | `re-raise must be at least the last raise (70+50)` |
| 11 | Pot limit: the most you can raise to is the bet + the pot after calling | RR, WP | `pot-limit: re-pot is to 24` |
| 12 | Fixed limit: small bet preflop and on the flop, big bet (2x) on turn and river | RR, WP | `limit turn bet is the big bet (2 x 20)` |
| 13 | Fixed limit cash: one bet and three raises, no cap when only two players start the round | RR, DC | `limit cash heads-up: no cap` |
| 14 | A capped round stays capped if it becomes heads-up | RR, one source (rooms differ) | `limit: capped round stays capped when it becomes heads-up` |
| 15 | Fixed limit tournament: the cap holds heads-up until only two players are left in the event | TDA 50, one source (rooms differ) | `limit tournament: cap holds heads-up while 3 are left in the event` |
| 16 | An all-in for less than a full raise does not reopen betting for players who already acted | TDA 47, RR | `short all-in did not reopen the raising for the raiser` |
| 17 | Side pots: each all-in player can win only what they matched from each opponent | RR, WP | `KK takes the side pot` |
| 18 | Uncalled chips go back to the bettor | TDA, RR | `QQ keeps everything above 300 (uncalled chips come back)` |
| 19 | Split pot: the odd chip goes to the first winner left of the button | TDA 20, RR | `odd chip to the first winner left of the button` |
| 20 | If everyone folds, the last player wins without showing | RR, WP | `nobody shows when everyone folds` |
| 21 | Antes do not count toward the bet you must call | RR, WP | `antes don't count toward the bet to call` |
| 22 | Big-blind ante: the big blind pays one ante for the whole table, blind first if short | TDA 2024, WSOP | `big blind ante: big blind pays blind + one ante` |
| 23 | Best five of seven cards; the ace plays high or low (A-2-3-4-5 straight) | PG, WP | `wheel is the lowest straight` |
| 24 | Hand ranks: straight flush > quads > full house > flush > straight > trips > two pair > pair > high card | PG, WP | `flush beats straight` |
| 25 | Tournament: blinds rise by level; the last player with chips wins | TDA, WSOP | `tournament finishes` |

## Simplifications and house choices (said honestly)

- **Moving button.** The engine moves the button one live seat each hand. TDA uses a *dead button* when a
  player busts; home games and most apps use the simpler moving button. Rule 9 still holds.
- **Big-blind ante order.** TDA 2024 says blind first, then ante, when the big blind is short. TDA 2019 said
  ante first. We follow 2024.
- **Showdown.** Every hand still live at showdown is shown face up (no mucking a losing hand). The study
  mode needs the cards, and online play shows them too. Real rooms let a loser muck.
- **Pot limit small blind.** Some rooms let the small blind complete and raise as if the blind were a full
  bet; we use the standard "call then pot" maths for everyone.
- **No string bets, timing or etiquette rules**: the app only offers legal buttons, so these can't happen.
