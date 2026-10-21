# Match Planning — `/captains-corner/match-planning`

**Spartans Hub · Added: October 2026**

---

## 1. Overview

A pre-match page for captains. Pick an upcoming game and it shows how we did
in past matches and how each player who has marked **Y / O / E** for the game
did, through three independent lenses (tabs in the order Opponent, Tournament, Ground; `?lens=`, default `opponent`):

| Lens | History is every past non-practice synced match… |
|---|---|
| **Opponent** | against the same opponent (master `opponent_id`, else normalised spelling) |
| **Ground** | at the booking's ground (`bookings.ground_id`, falling back to the tournament's ground) |
| **Tournament** | in the booking's tournament |

The lenses do not combine; each is its own view of the same upcoming game and
available players. (Combining, e.g. opponent *at* this ground, is possible later
by intersecting the filters.) The Opponent lens keeps the old wording; Ground
and Tournament list each match's opponent and show "opposition" batters/bowlers.

Built on ball-by-ball commentary (`commentary-upload.md`, `ball-by-ball-tabs.md`),
so only past meetings that have commentary uploaded can be broken down.
Meetings without it still count in the "met N times, won/lost" line.

**Access:** `isCaptain || isGC || isAdmin` (hard redirect otherwise, same gate
as `/captains-corner`). Read-only, no write path, no migration.

**Nav:** 🧭 Match Planning in **Captains' Corner ▾** (desktop) and the
Captains' Corner section of the mobile More sheet (`activePage="captains-planning"`).

---

## 2. What it shows

- **Header** — the opponent, date/slot/format/tournament, record, and how many
  meetings have ball-by-ball data. A dropdown (`MatchPlanningPicker`, client component) switches between the next 15
  upcoming confirmed games that have an opponent set (`?booking=<id>`,
  defaults to the soonest).
- **What stood out** — rule-based pointers (§4).
- **Last 5 meetings / matches** — W/L/T pills (newest first) from all synced matches in the view (not only those
  with commentary), plus a line and link to Team Record for the full performance (§11).
- **Phase tables** — our batting and our bowling by Powerplay / Middle / Death,
  summed over all meetings (runs, balls, RPO, wickets, dot %). Phases use the
  club's per-format definition (`PHASE_PLANS` in `ballByBall.ts`).
- **Their batters to watch** — top 5 by runs across meetings, with innings,
  strike rate and times out.
- **How wickets fell** — wickets lost/taken by type, and which of their
  bowlers took our wickets.
- **Commentary missing** — for the matches in the current lens that have no
  ball-by-ball data, a table of match date (links to the match), match ID and
  CricHeroes link (`bookings.cricheroes_url`, "no link on booking" when unset),
  plus the opponent in the Ground/Tournament lenses. It tells captains the
  analysis would be fuller once a wrangler uploads those commentaries. Shown
  even when no match has commentary at all.
- **Available players** — one card per Y/O/E player with history in the view, showing only the pointer
  callouts (§12) and a link to the detail. Players with no ball-by-ball history are listed by name.

---

## 3. Data

`src/lib/matchPlanningData.ts` (server-only) `getPlanningContext(bookingId, lens)`:

1. Upcoming confirmed bookings with an `opponent_name` (picker + selection). A game played today
   leaves the picker as soon as it is completed — ended, or scorecard synced (`isCompletedMatch()`,
   shared with `/fixtures` and the admin Matches tab, see `admin-matches-view.md` §2.1) — and a
   `?booking=` link to such a game falls back to the next upcoming one.
2. History: `getTeamMatches()` filtered by the chosen lens (Opponent uses master
   `opponent_id` **or** normalised spelling, the same rule as the Captains'
   Corner → Team Record link), practice games excluded.
3. Ball rows for those `match_id`s from the analytics view
   `ball_by_ball_linked`, paged with `fetchAllRows()` (PostgREST caps a
   response at 1000 rows, and several matches exceed that).
4. `availability` rows with `response IN ('Y','O','E')` for the booking, then the
   players in a second query (expelled dropped). **Do not embed `players(...)`
   in the availability select:** `availability` has two FKs to `players`
   (`player_id`, `updated_by`), PostgREST rejects the ambiguous embed, and the
   page then showed nobody available. Errors are logged, not swallowed.

`src/lib/matchPlanning.ts` (pure, client-safe, `matchPlanning.test.ts`)
does the aggregation by reusing `phaseSplit()`, `summariseBatters()` and
`summariseBowlers()` from `ballByBall.ts`.

**Batting position** is the batter's order of first appearance at the crease in
that innings (ball-by-ball has no separate position column), so a batter who
walks in at the same time as an opener's retirement may differ from the
scorecard number. **Player identity** uses the view's `*_player_id` columns,
which are resolved only for Spartans players; opponents are matched by name.

---

## 4. Pointers are rules, not opinion

Every line quotes the numbers it came from, and thresholds are constants in
`matchPlanning.ts`:

| Pointer | Fires when |
|---|---|
| Slowest batting phase | Phase has ≥30 balls and runs ≥1 an over below our overall rate |
| Wickets clustered | ≥6 wickets lost and ≥45% in one phase |
| Dot balls | ≥120 balls and ≥45% dots |
| Leakiest bowling phase | Phase has ≥30 balls and ≥1 an over above our overall economy |
| Where we hurt them | ≥6 wickets taken and ≥45% in one phase |
| Repeated dismissal type | ≥6 dismissals and ≥50% the same type |
| Their bowler | Took ≥3 of our wickets across meetings |
| Their key batter | ≥40 runs across meetings |
| Player: phase spread | Both phases ≥10 balls and SRs ≥30 apart |
| Player: nemesis | Dismissed by the same bowler ≥2 times |
| Player: small sample | <20 balls batting / <24 balls bowling |

One meeting only gets an explicit "treat these as hints" line. The page says the
pointers are rule-based. If a captain wants softer language or different
thresholds, change the constants and the table above.

---

## 5. Security

| Check | Status |
|---|---|
| Page gate `isCaptain \|\| isGC \|\| isAdmin` server-side before any data fetch | ✅ |
| Read-only; no new API route, table or migration | ✅ |
| Analytics DB read server-side only (`ANALYTICS_SUPABASE_KEY`) | ✅ |
| Only match stats and availability responses already visible to captains in Captains' Corner; no wallet or contact data | ✅ |

---

## 6. File map

| File | Role |
|---|---|
| `src/app/captains-corner/match-planning/page.tsx` | The page |
| `src/components/captains/MatchPlanningPicker.tsx` | Upcoming-game dropdown |
| `src/lib/matchPlanningData.ts` | Server fetch (§3) |
| `src/lib/matchPlanning.ts` (+ `.test.ts`) | Pure aggregation and pointers |
| `src/components/ui/SiteNav.tsx`, `src/components/ui/MobileTabBar.tsx` | Nav entries, `captains-planning` added to the highlight list |

## 7. Not built (ideas)

- Batter-vs-bowler matchups (which of their bowlers troubled which of our batters). The data supports it.
- Bowling-vs-their-batting-hand, and where opponents score (shot/direction).
- Suggested batting order / bowling plan from the above.
- Fielding and extras conceded per meeting.
- Falling back to scorecard-level stats for meetings with no commentary.

---

*Maintained by: Spartans CC BLR*

## 8. Display of overs and phase figures (October 2026)

Phase lines no longer show a bare economy in brackets (it read as overs or balls). Bowling by phase
is now `Powerplay 0/23 in 2.0 ov (econ 11.5)`, using `formatOvers()` (6 balls an over, so 15 balls is
2.3 ov), and batting by phase is `Powerplay 33 off 21`. The overall bowling line and the "most
economical / most expensive" pointer also say "econ".

## 9. Opposition hints only on the Opponent tab (October 2026)

On the Ground and Tournament tabs the "opposition" is many different sides, so pointers about specific
opposition players would not apply to the next opponent. Those views no longer show the "Opposition
batters who did best" panel, the opposition wicket-takers line, or the "opposition batter to watch" and
"plan for them" (repeat bowler) pointers (`scoutTeam(..., sameOpponent)`). Our own batting/bowling
phases, how wickets fell, the match list (with each match's opponent) and the player cards stay.

## 10. "What stood out" revisions (October 2026)

- **Team-level "we were caught N times" pointer removed.** Caught is the norm everywhere (about two in three
  dismissals), so a team share says nothing, and shot selection is individual. Team level now flags only
  bowled + lbw ≥35% of ≥6 dismissals, and ≥3 run-outs (≥10%). The per-player line treats "caught" as a pattern
  only when ≥4 dismissals and ≥80% (other ways still ≥60%).
- **More bowling pointers** (from our bowlers across the matches in view; `TeamScout.ourBowlers`): dot-ball share
  (≥120 balls; ≥45% good, ≤35% loose), wides + no-balls (≥8 and ≥5 a match), the top wicket-taker (≥24 balls,
  ≥3 wickets, with economy and overs), and a regular who went ≥2 an over above our overall economy.
- Opposition batter/bowler pointers stay Opponent-tab only (§9).

Replaced rows in §4's table: "Repeated dismissal type" → "Bowled/lbw share" and "Run-outs"; new: "Dot balls (bowling)",
"Extras", "Top wicket-taker", "Costly bowler".

## 11. Last-5 form and the Team Record link (October 2026)

The long "Every match" list was replaced by a compact **Last 5** form strip (`FormPills`, `recentForm()` over the
whole `ctx.history`), with the line "For our entire performance at this ground / in this tournament / against X,
open Team Record →". The link goes to `/team-stats` all time (`year=all`; practice games stay excluded there too):
`ground=<id>` or `tournament=<id>` (both split by opponent), or `opponent=id:<opponent id>` on the Opponent tab.
Team Record already filters by all three and lets you expand to the matches. (Past Matches cannot filter by
opponent, so it is not used.) Individual match links remain in the Commentary-missing table and the player cards.

## 12. Player cards: callouts and a link only (October 2026)

Cards no longer show batting/bowling figures, positions, phase lines or innings logs; only the rule-based
callouts ("Nothing stands out in this view" when none fire). Each card links to the detail for the current view:
Ground tab → `/players/<id>/stats?ground=<groundId>` (the player stats page reads `?ground=` and pre-selects its
Ground filter, validated against the grounds list); Tournament tab → `/leaderboard?category=mvp&tournament=<id>&year=all`
(Detailed → MVP for that tournament); Opponent tab → `/players/<id>/stats` (no opponent filter exists there).

## 13. Tournament MVP link moved (October 2026)

On the Tournament tab the "Tournament MVP table →" link (`/leaderboard?category=mvp&tournament=<id>&year=all`) now sits once, next to "open Team Record →" in the Last-5 card, instead of under every player card. Tournament-tab player cards show callouts only.

## 14. Upload link in the Commentary-missing table (October 2026)

For wranglers and admins (`isWrangler || isAdmin`; captains and GC don't see it, since `/wrangler/commentary` is wrangler/admin only) the "Commentary missing" table has an extra **Commentary** column with **Upload →**. It links to `/wrangler/commentary?booking=<bookingId>`, which opens with that game already selected. The column appears in all three lenses, so the Ground and Tournament tabs get it too.

## 15. Wicket-moment callouts on player cards (October 2026)

Bowlers with no phase spread or economy story (e.g. a tournament-lens player who simply took wickets) used to get "Nothing stands out". `playerInsights()` now also runs `wicketMomentInsights()` over a per-bowler list of `WicketEvent`s (`wicketEvents()` in `matchPlanning.ts`, built from the opposition innings of each commentary match):

- **Burst** — most wickets by the bowler in one innings within the same or next over: "Struck 2 times in two overs vs X (6 Sep)" / "in one over". Needs ≥2.
- **Breakthrough** — the wicket that ended the biggest stand, from `score_after` between wickets: "Broke a 41-run stand (30 balls) in over 7 vs X". Fires for stands ≥25 runs (`BIG_STAND_RUNS`).
- **Chase-turning wicket** — when Spartans batted first (`ScoutMatchInput.battedFirst`, from `TeamMatch`), the opposition chase is run through `chaseSeries()`/`rateCrossings()`; the wicket in the over where their current rate first fell below the required rate gets "it turned the chase (CRR a against RRR b needed)". Takes priority over a plain big stand and needs only a ≥10-run stand (`TURNING_STAND_RUNS`).

Run-outs and retirements are excluded (`isBowlerWicket`). These callouts show regardless of the small-bowling-sample note and on all three lenses. Source is ball-by-ball only, so matches without commentary don't contribute. Tests in `matchPlanning.test.ts`.

## 16. Who drives each phase (October 2026)

A card between the phase tables and "Their batters to watch" compares every Spartans player's batting and bowling in each phase (Powerplay / Middle / Death) with the **rest of the team** in the same phase, so a captain can pick batters and bowlers for the right part of the innings. Logic is pure and unit-tested in `src/lib/phaseContribution.ts` (`phaseContribution.test.ts`); UI is `src/components/captains/PhaseContributors.tsx`, a server component using native `<details>`. No migration, no new route; it runs over the ball rows already fetched.

- **Baseline is the rest of the team** (whole team minus the player), so a bowler who bowled most of a phase isn't compared with himself. Fewer than 24 balls in the rest of the team, or fewer than 12 by the player, gives "small sample".
- **Verdict is on runs an over**, standardised by the per-ball spread of runs in that phase: `z = (player RPO − rest RPO) / SE`, where `SE = 6·sd·√(1/n_player + 1/n_rest)`. ▲ above par at z ≥ 1 in our favour, ▼ below at z ≤ −1, ● on par between. Higher RPO is good for batting, lower economy for bowling. Batting runs are off the bat per ball faced and bowling runs are charged to the bowler, so the figures differ slightly from the headline tables (which include extras).
- **Dot% gets its own gap and flag** (green/red, in points) using a binomial standard error on the pooled rate; it informs but does not decide the verdict. Dismissals (batting, retirements excluded) and bowler wickets are shown as counts.
- **Pick list per phase** (available players only, best three each way) sits above two collapsed tables, one per discipline, with a whole-team row at the top. The default is available players; "Show everyone" (`?who=all`) lists every Spartans player with ball-by-ball data.
- **Batting position caveat is printed on the card**: ball-by-ball has no position column, and a batter's phase depends on when they walked in. The table shows the usual position (order of first appearance, most used) next to each name, and the text frames the result as evidence of who scores in a phase, not a rule.
- The lens tabs and the game picker don't carry `who` over; it resets to available players.
