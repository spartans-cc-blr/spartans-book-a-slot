# Scorecard Raw-Data Capture — Closing Gaps vs. the Analytics Plan

**Spartans Hub · Added: September 2026 · Status: In progress, worked one item at a time**

---

## 1. Overview

A club-provided "Spartans Cricket Analytics — Data & Metrics Plan" document
lists every raw field the club eventually wants extracted from a CricHeroes
scorecard PDF, plus the metrics/indices that would sit on top of it. An
audit against the live `spartans-python` extraction pipeline (September
2026) found most of it already captured, but a real, well-defined set of
gaps — most following the exact same shape already fixed twice in
`features/partnerships.md` §11/§12 (opponent bowler credit, batting
style): **the raw text is already being parsed by `DismissalParser`/
`ScorecardConfig`, the result is just discarded before it reaches a
table.**

This doc tracks that gap-closing work as it's picked off item by item —
the club is going through the audit's findings one at a time, not
all-at-once, so this doc grows a new section per capture rather than
landing as one large change. See §3 for the full audit result and what's
still open.

**Deliberately data-only, same posture as `partnerships.md` §11/§12.**
Nothing in this doc builds a derived metric or a UI surface — every
section here is purely about getting a raw fact from the PDF into a
queryable column. Metrics/indices (the plan document's §2-§10, §9's
"Proposed Indices") are out of scope until there's a specific ask for one.

---

## 2. Audit — Plan vs. what's actually captured (September 2026)

Verified by reading `spartans-python`'s live extraction code
(`field_extractors.py`, `dismissal_parser.py`, `csv_writers.py`) against a
real sample scorecard (Hub match `14114256`, 5 Jan 2025 vs Shiney 11 —
also the match cited in `partnerships.md` §3's line-wrap incident write-up).

| Plan section | Status |
|---|---|
| Match — ID/Ground/Date/Team/Opponent/Toss/Score/Overs/Wickets/Result | ✅ captured |
| Match — Edition, Format (T20/T30), Ball type, Competition/League name | ✅ Not a scorecard-extraction gap — Format/Ball type/League(knockout) are already Hub-maintained admin data (`bookings.format`, `tournaments.ball_type`, `bookings.stage_type`), Edition is folded into the tournament's own `tournaments.name`. Closed without a capture — see §7 |
| Match — Winning margin/type (e.g. "by 2 wickets") | ✅ Not a scorecard-extraction gap — already correctly derived Hub-side from already-captured score/wicket/toss data (`computeMatchMargin()`), verified against the real PDF's own printed result. See §7 |
| Squad/Player — Player, Team, Batting position | ✅ (Spartans only) |
| Squad/Player — Captain | ⚠️ Spartans: Hub-side only (`players.is_captain`/`squad.is_captain`), by design — not a CricHeroes-extraction concern. Opponent: `match_stats.opponent_captain` (match-level name string) is now also cross-referenced onto a per-player `opponent_team_list.is_captain` flag — see §8 |
| Squad/Player — Wicketkeeper | ✅ Not needed — Spartans' WK is already known from the batting scorecard (`†` annotation) plus Hub squad management; the "how out" attribution to Caught Behind this annotation would otherwise be for is already correctly captured via `dismissal_method`/`dismissal_type` (verified). Closed without a capture — see §7 |
| Squad/Player — Batting hand | ✅ Both sides, every batter regardless of dismissal — see §6 |
| Batting — Runs/Balls/Minutes/4s/6s/SR/Not-out | ✅ fully captured |
| Batting — Bowler who dismissed the batter | ✅ Both sides, at the FOW grain — `fall_of_wickets.bowler_name` (Spartans' own wicket) and `opponent_fall_of_wickets.bowler_name` (opponent's wicket), see §5. `batting_stats.bowler_name` (a second copy, per-player) deliberately **not** added — see §5's redundancy note |
| Batting — Fielder | ✅ Same FOW-grain capture as Bowler above, see §5. Originally descoped (§3.1) as unneeded for any plan metric; captured anyway per an explicit later request to preserve raw data for future need |
| Bowling — Overs/Maidens/Runs/Wickets/Dots/4s/6s/Wides/No-balls/Economy | ✅ fully captured, no gaps |
| Fall of Wickets — Wicket #/Score/Batter/Over | ✅ both sides |
| Fall of Wickets — Bowler | ✅ both sides — see §5 |
| Fall of Wickets — Dismissal type | ✅ both sides — see §5 |
| Fielding — aggregate catches/stumpings/run-outs | ✅ (Spartans only, per-match totals) |
| Fielding — per-dismissal-event linkage (fielder ↔ specific batter/bowler) | ✅ via both FOW tables' new `bowler_name`/`fielder_name`/`dismissal_type` (§5) — no plan metric needs this (§3.1), captured as raw data anyway |
| **Extras** — byes/leg byes/wides/no-balls/total | ❌ **not captured at all** — see §4, the first item picked off this list |
| Toss — raw fields | ✅ captured; derived metrics already live Hub-side (Team Record) |

---

## 3. Working order

Picked off one at a time, per explicit direction — not built all at once.
Each capture gets its own dated section below.

| # | Item | Status |
|---|---|---|
| 1 | Extras (byes/leg byes/wides/no-balls/total conceded while Spartans bowl) | ✅ Done — see §4 |
| 2 | Wicketkeeper annotation | ✅ Closed, not needed — see §7 |
| 3 | Bowler who dismissed a Spartans batter (own `batting_stats`) | ✅ Superseded — see §5's redundancy note. Captured at the FOW grain instead of a duplicate `batting_stats` column |
| 4 | Bowler credit + dismissal type on Spartans' own `fall_of_wickets` | ✅ Done — see §5 |
| 5 | Dismissal type on `opponent_fall_of_wickets` | ✅ Done — see §5 |
| 6 | Match header: Format, Ball type, Edition, League name (split from `tournament_name`/`match_type`) | ✅ Closed, not needed — see §7 |
| 7 | Winning margin/type (raw text) | ✅ Verified correct, no capture needed — see §7 |
| 8 | Opponent captain flag on `opponent_team_list` (narrowed from "per-player Captain/WK flags on `team_list`" — Spartans stays Hub-side, see §7) | ✅ Done — see §8 |
| 9 | Batting hand for a not-out opponent batter | ✅ Done — see §6. Corrected below: this was never a Fall-of-Wickets-adjacent gap, just a missing persistence path — see §6's "Correction" note |

Item #3 originally read "Bowler/fielder who dismissed a Spartans batter" —
narrowed to bowler-only (§3.1), then closed out entirely once §5 shipped
fielder too, on the FOW tables rather than `batting_stats`. Item #9 (not
in the original 8-item list) was added once the fielder-descope
correction (§3.1) prompted a full re-read of the plan document, which
surfaced this genuinely still-open gap. Items #2/#6/#7 were closed by a
direct review of each item against what already exists (Hub-maintained
data, or an already-correct Hub-side derivation) — see §7. Item #8 was
narrowed the same review pass, from a generic "per-player flags on
`team_list`" ask to specifically an opponent-side captain flag, since
Spartans' captain/WK are Hub concerns, not CricHeroes-extraction ones.

---

## 3.1 Correction — fielder identity descoped, no metric needs it (September 2026)

The original audit (§2) framed "Fielder" (on `batting_stats`) and
"per-dismissal-event fielder linkage" (on `fielding_stats`/FOW) as gaps
symmetric with the bowler-credit ones — on the theory that since
`DismissalParser.parse_batting_dismissal()` already returns `['fielder']`
alongside `['bowler']` and `['method']`, and the bowler side was worth
capturing, the fielder side probably was too. That symmetry was wrong, and
was caught by a direct question rather than by re-reading the plan first:
*"I am unable to think of a reason why we need to have a fielder name
along with bowler name for opponent FOW. Does the plan indicate the need
for any metric?"*

Re-reading the plan document's own §5 (Fielding) confirms it doesn't. The
plan's raw-field list there is *"Extract from dismissal descriptions:
Fielder, Dismissal type, Bowler, Wicketkeeper, Batter dismissed"*, but
every metric it actually builds on top of that — *"Catches, Stumpings,
Run-outs, Caught & Bowled, Fielding Dismissal Involvement,
Dismissals/Match"* — is a per-match, per-player **aggregate**. None of
them needs to know *which specific wicket* a fielder's catch/run-out/
stumping belonged to, or who the bowler or batter was for that one event
— they only need a count. That's exactly what the existing
`fielding_stats` table (built from `DismissalParser.extract_fielder_dismissals()`)
already provides in full.

`bowler_name`, by contrast, has real justification and stays a genuine
gap: the original ask that motivated `partnerships.md` §11 ("which
Spartans bowler broke this opponent partnership") is a per-event linkage a
bare aggregate can't answer, and the plan's bowling "Wicket impact"-style
metrics need a bowler tied to a specific wicket, not just a season total.

**Net effect of this correction:** `['fielder']` stays discarded exactly
as it is today — no code change, since nothing was ever built for it. The
§2 audit table and Working Order #3 above are updated to reflect this as
an intentional scope decision, not an open item.

---

## 4. Extras — byes, leg byes, wides, no-balls, total (added September 2026)

### Why

Scoped explicitly to **extras Spartans conceded while bowling** — not
extras Spartans received while batting. Two of the four (wides, no-balls)
already existed at per-bowler granularity (`bowling_stats.wides`/
`no_balls`); byes and leg byes didn't exist anywhere (cricket doesn't
charge either to a specific bowler — they're extras added to the team
total with no individual attribution), and none of the four existed as a
**match-level aggregate**, nor did the standalone total-extras figure.

### What was added

- **`EXTRAS_PATTERN` / `EXTRAS_CODE_TO_FIELD`** (`spartans-python/utils/field_config.py`)
  — a regex matching a team's `"Extras: (b 8, wd 13, nb 1) 22"` summary
  line (breakdown group optional, for a genuinely zero-extras innings
  read as a bare `"Extras: 0"`), plus the `b`/`lb`/`wd`/`nb` → field-name
  map.
- **`ScorecardExtractor.extract_extras()`** (`field_extractors.py`) — new
  method, deliberately symmetric across both teams, same "extractor stays
  symmetric, the caller decides what to persist" division of
  responsibility `extract_fall_of_wickets()` already established. Returns
  `Dict[team_name, {'byes','leg_byes','wides','no_balls','total_extras'}]`.
  A team with no parseable `"Extras:"` line is simply absent from the
  dict — never a zero-filled fabrication.
- **`CSVWriterFactory.write_all()`** resolves `conceded_extras =
  match_data['extras'][opponent_team_name]` — the **opponent's own**
  innings extras, i.e. what Spartans conceded while bowling, the same
  `opponent_team_name` key already used for `opponent_fow`/
  `opponent_stats`. Passed into `MatchStatsWriter.write()`.
- **`match_stats.extras_byes` / `extras_leg_byes` / `extras_wides` /
  `extras_no_balls` / `extras_total`** — five new nullable `integer`
  columns on the analytics DB's `match_stats` table
  (`analytics-db/migrations/009_match_extras.sql`, applied live).
  `extras_wides`/`extras_no_balls` are deliberately named distinctly from
  (and in addition to) the existing per-bowler
  `bowling_stats.wides`/`no_balls` columns — this is a match-level
  aggregate on a different table, not a rename or a replacement.
  `extras_total` is the scorecard's own printed total, not a recomputed
  sum — the extractor cross-checks the two and logs a warning on mismatch
  (never fails the parse), but always trusts the PDF's stated figure.
- **`match_stats_cache.extras_*`** — the identical five columns mirrored
  onto the Hub DB (`supabase/migrations/082_match_stats_cache_extras.sql`,
  applied live). **Required an explicit `matchStatsSync.ts` change** —
  unlike the array-shaped tables (`batting`/`bowling`/`fall_of_wickets`/
  etc.), which ride into `match_stats_cache` automatically via the
  existing `select('*')` fetch because they're stored as whole `jsonb`
  arrays, `match_stats` itself is destructured field-by-field into named
  `match_stats_cache` columns (`team_total`, `team_wickets`, …) — a new
  column on `match_stats` does **not** propagate anywhere without also
  adding it to that destructuring, the same way `team_captain` needed an
  explicit line when it was added. `syncMatchStatsForBooking()` now reads
  `m.extras_byes` etc. (already available via the existing bare
  `select('*')` on `match_stats`) into the upsert.

### Real-PDF line-wrap incident, caught before shipping

The initial implementation assumed the breakdown and its trailing total
sat on one physical PDF text line (true for a synthetic single-line test,
and for a naive `pypdf` extraction of the sample scorecard). Running the
same PDF through the **actual production extractor**
(`PDFTextExtractor`, PyMuPDF/`fitz` — not `pypdf`) showed the real layout
splits them:

```
Extras: (b 8, wd 13, nb 1)
22
```

— a lone `"22"` on its own line, immediately after the breakdown line.
Confirmed on both innings of the sample PDF, and the adjacent `"Total:
Overs 30.0, Wickets 8"` / `"218 (CRR: 7.27)"` pair wraps the identical
way in the same document, suggesting this is a general layout quirk of
this PDF export rather than something specific to Extras.

**Fixed** the same way `_extract_fow_entries()`'s own score-hyphen/wicket-
number line-wrap sub-case was fixed (`partnerships.md` §3): join the
`"Extras:"` line with the line immediately after it before running the
regex, unconditionally. This is safe even when a layout genuinely does
put both on one line — `EXTRAS_PATTERN`'s trailing `(\d+)` only consumes
the digit run immediately after the closing paren and stops at the first
non-digit, so an already-complete single-line match is unaffected by
whatever text follows once joined.

### Verification

1. Regex-only test against the real extracted "Extras:" lines from both
   innings of the sample PDF, plus a zero-extras no-parens edge case.
2. `CSVWriterFactory.write_all()` smoke test with synthetic `match_data`
   carrying deliberately different extras on each side — confirmed
   `match_stats.csv` picks the **opponent's** figures (what Spartans
   conceded), never the Spartans-batting-side figures. A second run with
   no `'extras'` key at all confirmed a clean empty-string degrade
   (→ `NULL` on import), not a crash.
3. **Full production pipeline run against the real scorecard PDF** (Hub
   match `14114256`), using the actual `PDFTextExtractor`
   (PyMuPDF) → `MatchDetailsExtractor` → `ScorecardExtractor` →
   `CSVWriterFactory.write_all()` chain end-to-end — the row landing in
   `match_stats.csv` matches the scorecard's own printed opponent-innings
   line exactly: `extras_byes=8, extras_leg_byes=1, extras_wides=9,
   extras_no_balls=3, extras_total=21` (from `"Extras: (wd 9, nb 3, b 8,
   lb 1) 21"` on the Shiney 11 innings). No cross-check warning fired —
   both innings' breakdown sums matched their printed totals exactly
   (8+0+13+1=22, 8+1+9+3=21).
4. Regression-verified the two prior captures (`partnerships.md` §11/§12
   smoke tests) still pass unchanged, since this touched the same shared
   `field_extractors.py`/`csv_writers.py` files.

### Security (vibe-security)

Read-only PDF parsing, no new client-reachable input, no new write path
beyond the existing service-role-only sync pipeline. Both new tables'
columns follow the same RLS posture already in place (`match_stats`/
`match_stats_cache` — no anon/authenticated policies, service role only).

### File map

| File | Role |
|---|---|
| `analytics-db/migrations/009_match_extras.sql` | The 5 new `match_stats` columns |
| `supabase/migrations/082_match_stats_cache_extras.sql` | The 5 mirrored `match_stats_cache` columns |
| `spartans-python/utils/field_config.py` | `EXTRAS_PATTERN`, `EXTRAS_CODE_TO_FIELD` |
| `spartans-python/utils/field_extractors.py` | `ScorecardExtractor.extract_extras()` + helpers, the line-wrap join fix |
| `spartans-python/utils/csv_writers.py` | `MatchStatsWriter`'s `extras_*` columns; `CSVWriterFactory.write_all()`'s `conceded_extras` resolution |
| `spartans-python/scripts/import_to_supabase.py` | `COLUMN_TYPES['match_stats']` widened |
| `spartans-python/api.py`, `spartans-python/main.py` | `match_data['extras'] = scorecard.extract_extras()` wired in |
| `src/lib/matchStatsSync.ts` | Reads `m.extras_*` (already fetched via `select('*')`) into the `match_stats_cache` upsert |

### Pending

| Item | Notes |
|---|---|
| Extras Spartans received while batting | Not captured — deliberately out of scope for this pass (see "Why" above). `extract_extras()` already returns both sides symmetrically; a future pass would just need `CSVWriterFactory.write_all()` to also pick the Spartans-batting-side dict and a second set of columns. |
| Historical backfill | Every match synced before this shipped has `extras_*: NULL` on both tables — only a re-sync (manual "Sync Stats" or the next `backfill-scorecards` cron run) populates them, same posture as every prior column added to these tables. |
| No derivation or UI | Not built — same explicit scope as every other item in this doc. |

---

## 5. Fall of Wickets — dismissal type, bowler, fielder on both sides (added September 2026)

### Why

Per an explicit request to capture what's available from the scorecard
even without a current UI use — *"not to lose data for any future
needs"* — rather than the narrower, metric-justified scope §3.1's
correction argued for. This closes Working Order items #3/#4/#5 in one
pass, and goes one field further than the plan document's own Fall of
Wickets ask (`"Wicket number, Score, Batter dismissed, Over, Bowler,
Dismissal type"` — no Fielder) by also keeping Fielder, since it's the
same already-parsed value and the cost of keeping it is one more nullable
column.

No new PDF parsing. Both `fall_of_wickets` (Spartans' own innings) and
`opponent_fall_of_wickets` already receive each wicket's dismissed
batter's raw "how out" text (`batting.status`) indirectly — the opponent
writer already re-parsed it with `DismissalParser.parse_batting_dismissal()`
to get `bowler_name` (`partnerships.md` §11); the Spartans writer never
ran that lookup at all. Both now do, and both keep all three of the
parser's return values instead of one or two of them.

### What was added

- **`FallOfWicketsWriter.write()`** (`spartans-python/utils/csv_writers.py`)
  — signature widened to take `player_stats` (the same Spartans
  `player_statistics` dict `BattingStatsWriter` already reads), so it can
  look each wicket's `player_name` up and re-parse their `batting.status`.
  Three new columns: `dismissal_type`, `bowler_name`, `fielder_name`.
- **`OpponentFallOfWicketsWriter.write()`** — already had `opponent_stats`
  and already ran `DismissalParser.parse_batting_dismissal()` for
  `bowler_name`; now also keeps `['method']` as `dismissal_type` and
  `['fielder']` as `fielder_name` from that same call, instead of
  discarding them.
- **`CSVWriterFactory.write_all()`** — one-line change, passes the
  already-in-scope `spartans_stats` into `fall_of_wickets_writer.write()`.
- **`fall_of_wickets.dismissal_type` / `.bowler_name` / `.fielder_name`**
  and **`opponent_fall_of_wickets.dismissal_type` / `.fielder_name`** —
  five new nullable `text` columns across the two tables
  (`analytics-db/migrations/010_fow_dismissal_detail.sql`, applied live).
  `fielder_name` is the parser's raw, unsplit output — for a run out this
  can be a `"Thrower/Collector"` combined string, the same shape
  `DismissalParser.parse_fielders_from_runout()` already knows how to
  split further on the read side; this migration is raw capture only, no
  derivation.
- **No Hub-side change at all.** Unlike Extras (§4), which needed an
  explicit `matchStatsSync.ts` line because `match_stats` is destructured
  field-by-field into `match_stats_cache`, both FOW tables are already
  stored wholesale as `jsonb` arrays (`fall_of_wickets: fallOfWickets.data
  ?? []` / `opponent_fall_of_wickets: opponentFallOfWickets.data ?? []` in
  `syncMatchStatsForBooking()`, both fetched via a bare `select('*')`) — a
  new column on either table rides into `match_stats_cache` automatically,
  the same "zero TypeScript touched" story `partnerships.md` §12
  documents for `batting_style`.

### Redundancy note — `batting_stats.bowler_name`/`.fielder_name` deliberately not added

The original audit (§2, before this pass) framed "Bowler who dismissed the
batter" and "Fielder" as gaps on **`batting_stats`** (Working Order #3) —
a *second*, separate capture from the FOW one (#4/#5), since they're
different tables at different grains (one row per player vs. one row per
wicket).

Once `fall_of_wickets` carries `bowler_name`/`fielder_name`/`dismissal_type`
keyed by `(match_id, player_name)` — the identical key `batting_stats`
already uses — adding the same three facts a second time onto
`batting_stats` would be pure duplication with no new information: every
Spartans batter who was actually dismissed has exactly one row in each
table, joinable on that key, and a batter who wasn't dismissed (not-out,
or didn't bat) has no bowler/fielder to record in either table anyway. So
item #3 is treated as satisfied by #4, not built separately —
`BattingStatsWriter` is unchanged, still keeping only `dismissal_method`
per player.

### Verification

1. **Full production pipeline run against the real scorecard PDF** (Hub
   match `14114256`), using the real `PDFTextExtractor`/`api.py` page
   selection (pages 3 & 4 — see the note below on why a naive
   `get_scorecard_pages()`-based test script initially came up with an
   empty opponent side) → `ScorecardExtractor` → `CSVWriterFactory.write_all()`
   end-to-end. Both FOW tables populated correctly for all 8 Spartans and
   8 opponent wickets, with dismissal types, bowlers, and fielders that
   match the printed scorecard and read as cricket-sensible (every
   `bowled`/`lbw` row has no fielder; every `caught_behind` row credits
   the same wicketkeeper name across multiple wickets; `stumping` credits
   a keeper as fielder and a bowler; a `caught` row credits a specific,
   varying fielder).
2. **Regression** — `smoke_test_opponent_fow.py` (from the earlier
   opponent-bowler-credit pass) updated to assert the two new columns'
   values (was asserting the pre-this-pass column set, including a
   `fall_of_wickets.csv` "unchanged shape" check that's now intentionally
   stale) and re-run clean, plus `smoke_test_batting_style.py` and
   `smoke_test_extras.py` re-run unchanged as regression checks on the
   shared `csv_writers.py`/`import_to_supabase.py` files — all pass.
3. `python3 -m py_compile` on both touched files.

**Diagnostic aside, not a code fix:** the first verification attempt used
`main.py`'s `PDFLayoutConfig.get_scorecard_pages()` team-name lookup to
pick scorecard pages, which fell back to a stale default (`[2, 3]`) for
this match's modern team name and produced zero opponent-side FOW
entries. Confirmed this is a quirk of `main.py` (the legacy, no-longer-
live Google Drive batch script) rather than a live production bug — the
real production path, `api.py`, never calls `get_scorecard_pages()` at
all and hardcodes pages 3 & 4 directly. Re-running with `api.py`'s own
page selection produced the correct 8/8 wicket counts on both sides. Not
fixed here — out of scope for this pass, and `main.py` isn't the live
path — but worth knowing if `main.py` is ever revived.

### Security (vibe-security)

Read-only PDF parsing, no new client-reachable input, no new write path
beyond the existing service-role-only sync pipeline. Both tables' new
columns follow the same RLS posture already in place — no anon/
authenticated policies, service role only.

### File map

| File | Role |
|---|---|
| `analytics-db/migrations/010_fow_dismissal_detail.sql` | The 5 new columns across both FOW tables |
| `spartans-python/utils/csv_writers.py` | `FallOfWicketsWriter` now takes `player_stats` and re-parses each wicket's dismissal; `OpponentFallOfWicketsWriter` keeps `dismissal_type`/`fielder_name` alongside its existing `bowler_name`; `write_all()` passes `spartans_stats` through |
| `spartans-python/scripts/import_to_supabase.py` | `COLUMN_TYPES` widened for both `fall_of_wickets` and `opponent_fall_of_wickets` |

No `field_config.py`, `field_extractors.py`, `api.py`, or `main.py` changes
— `DismissalParser` and `extract_fall_of_wickets()` were already sufficient;
this pass only stopped two writers from discarding part of what they
already had in hand.

### Pending

| Item | Notes |
|---|---|
| Historical backfill | Every match synced before this shipped has these five columns `NULL` — only a re-sync populates them, same posture as every prior column added to these tables. |
| Batting hand for a not-out opponent batter (Working Order #9) | ✅ Done — see §6. Turned out not to need a FOW-grain fix at all. |
| No derivation or UI | Not built — same explicit scope as every other item in this doc. |

---

## 6. Batting hand — every opponent batter, not just dismissed ones (added September 2026)

### Correction — this was never a Fall of Wickets gap

§3's Working Order item #9 (and, before that, §5's own "Pending" row)
framed this as needing "a new opponent-side roster table... since
`opponent_fall_of_wickets` only ever has a row per wicket" — true as far
as it goes, but it implied the fix would somehow be FOW-adjacent. A direct
correction closed that gap in reasoning: *"Batting hand of both Spartans
and opponent should be available from the scorecard itself just after the
batsman's name. We don't get that from FOW."*

Checked directly against `_extract_batting_stats()`
(`spartans-python/utils/field_extractors.py`) — it was already right.
`batting_style` is read off a batter's **raw scorecard name** the moment
that name is parsed (`self.config.extract_batting_style(player_name_raw)`,
called before `strip_name_annotations()` throws the `"(RHB)"`/`"(LHB)"`
annotation away), for **whichever team is batting on that page** — this
method has never distinguished Spartans from the opponent, and it runs
regardless of whether the batter ends up dismissed or not-out. So the
value was already sitting in
`player_stats[opponent_team][player_name]['batting']['batting_style']`
for every opponent batter with a real batting-card row, dismissed or
not — it simply had nowhere to be written for a not-out one, since
`opponent_fall_of_wickets` (the only opponent-side table besides the
aggregate `bowling_stats`/`fielding_stats`) only ever gets a row per
wicket. The actual gap was a **missing persistence path**, not a missing
extraction — confirmed by reading the extractor before writing a single
line of the fix, rather than assuming the earlier framing was right.

### What was added

- **`OpponentTeamListWriter`** (`spartans-python/utils/csv_writers.py`) —
  new writer, mirrors `TeamListWriter` (Spartans' own Playing XI list —
  just `match_id`/`player_name`) but adds `batting_style`, and covers the
  opponent's full Playing XI rather than Spartans'. One row per opponent
  player regardless of whether they batted at all — a genuine did-not-bat
  tail-ender simply has an empty `batting_style`, same convention as
  everywhere else in this pipeline.
- **`CSVWriterFactory.write_all()`** — resolves `opponent_players` (the
  mirror of the existing `spartans_players` resolution — whichever of
  `match_data['team_players']`/`['opponent_players']` did **not** get
  picked as Spartans) and passes it, with the already-in-scope
  `opponent_stats`, into the new writer.
- **`opponent_team_list`** — new analytics-DB table
  (`analytics-db/migrations/011_opponent_team_list.sql`, applied live):
  `match_id, player_name, batting_style`, `PRIMARY KEY (match_id,
  player_name)`. No new PDF parsing — same "already parsed, just needed
  keeping" story as every other item in this doc.
- **`match_stats_cache.opponent_team_list`** — Hub-side jsonb mirror
  (`supabase/migrations/083_match_stats_cache_opponent_team_list.sql`,
  applied live). Unlike the FOW dismissal-detail pass (§5), this **is** a
  brand-new table rather than new columns on an already-fetched one, so it
  needed the full "new table" plumbing: `syncMatchStatsForBooking()`
  (`src/lib/matchStatsSync.ts`) now also fetches `opponent_team_list` and
  includes it in the `match_stats_cache` upsert, the same shape
  `opponent_fall_of_wickets` needed when *it* was first introduced
  (`partnerships.md` §11).

### Deliberately scoped to batting hand only

`opponent_stats[player]['batting']` already carries the opponent's full
individual batting card (runs, balls, minutes, fours, sixes, strike rate,
status) for every batter with a card row — the exact same dict
`OpponentFallOfWicketsWriter` and `BowlingStatsWriter`/
`FieldingStatsWriter` already read. `opponent_team_list` deliberately
persists only `batting_style` from it, not a full `opponent_batting_stats`
table — that wasn't asked for, and would be a much bigger, more useful
capture in its own right (a not-out opponent's individual runs/balls are
currently unrecoverable the same way their batting hand was) — worth its
own explicit ask if wanted, not folded in here as scope creep.

### Verification

1. **Full production pipeline run against the real scorecard PDF** (Hub
   match `14114256`), same `api.py`-page-selection approach as §5. The
   opponent's full 12-player Playing XI came back in
   `opponent_team_list.csv`, correctly including **both not-out
   batters** (`Srinivas C`, `Rakshith` — `batting_style: 'RHB'` for both,
   matching what was already visible in the in-memory
   `player_stats` dict before this pass, confirming the value was never
   missing, only unpersisted) and correctly leaving the two players who
   never got a batting-card row at all (`Nandagopal C`, `Amit B`) with an
   empty `batting_style`.
2. **Regression** — `smoke_test_batting_style.py` extended with a
   `Wendy` fixture (not-out, never in `opponent_fall_of_wickets` at all)
   asserting her `batting_style` now appears in `opponent_team_list.csv`
   alongside the dismissed opponent batters; `smoke_test_opponent_fow.py`
   re-run unchanged as a regression check on the same shared
   `CSVWriterFactory.write_all()` — all pass.
3. `python3 -m py_compile` on every touched Python file.

### Security (vibe-security)

Read-only PDF parsing, no new client-reachable input, no new write path
beyond the existing service-role-only sync pipeline. `opponent_team_list`
and its Hub-side mirror follow the same RLS posture as every other table
in this doc — no anon/authenticated policies, service role only.

### File map

| File | Role |
|---|---|
| `analytics-db/migrations/011_opponent_team_list.sql` | The new table |
| `supabase/migrations/083_match_stats_cache_opponent_team_list.sql` | Hub-side jsonb mirror on `match_stats_cache` |
| `spartans-python/utils/csv_writers.py` | `OpponentTeamListWriter`; `write_all()`'s `opponent_players` resolution and the new writer call |
| `spartans-python/scripts/import_to_supabase.py` | `TABLE_MAPPING`/`COLUMN_TYPES`/`import_all()`'s `import_order`/`clear_all_tables()` all widened for `opponent_team_list` |
| `spartans-python/api.py` | `summarize_csv_dir()`'s dry-run mapping widened (extraction/`match_data` wiring needed no change — `opponent_players` was already computed) |
| `spartans-python/main.py` | Drive upload filename list widened |
| `src/lib/matchStatsSync.ts` | Fetches `opponent_team_list` and includes it in the `match_stats_cache` upsert |

### Pending

| Item | Notes |
|---|---|
| Historical backfill | Every match synced before this shipped has no `opponent_team_list` rows at all — only a re-sync populates them. |
| Opponent's full individual batting card (runs/balls/etc.) for a not-out batter | Not captured — deliberately out of scope for this pass, see "Deliberately scoped to batting hand only" above. The data is already sitting in `opponent_stats` in memory; a future pass would just need a wider writer and table. |
| No derivation or UI | Not built — same explicit scope as every other item in this doc. |

---

## 7. Closed without a new capture — wicketkeeper annotation, match header fields, winning margin (September 2026)

A direct review of Working Order items #2, #6, and #7 found all three
already covered by data that exists elsewhere — either Hub-maintained
admin data, or a Hub-side derivation already verified correct — so none
needed a new scorecard capture. Documented here rather than silently
dropped, so a future pass doesn't re-open them without first checking
this section.

### #2 — Wicketkeeper annotation

Per the review: *"we have this from the batting scorecard already plus
at the squad in Hub we manage for Spartans"* — Spartans' WK is a Hub
concept (`squad.is_wk`, the match-specific designation set via Captains'
Corner — see `features/squad-selection.md` §3), not something that needs
re-deriving from the scorecard's own `"( WK )"` annotation. No capture
built.

**What the review actually asked to verify:** whether the `†` (wicketkeeper)
annotation inside a dismissal's raw "how out" text is correctly
attributed to **Caught Behind** specifically, distinct from a plain
Caught, for Spartans' own batsmen. Checked against
`DismissalParser.parse_batting_dismissal()` — it already branches on
`'c †'`/`'c†'` in the raw status string (e.g. `"c †Keeper b Bowler"`) and
returns `method: 'caught_behind'`, distinct from the plain `'caught'`
branch. `BattingStatsWriter.write()` has always written this `method`
into `batting_stats.dismissal_method` for every Spartans batter (predates
this whole doc's work), and §5's `fall_of_wickets.dismissal_type` (this
session) carries the identical value at the FOW grain too. **Both are
already correct — confirmed against the real sample PDF**, whose Shiney
11 innings has multiple `caught_behind` dismissals, all correctly
attributed to the same wicketkeeper as fielder across multiple wickets
(see §5's own Verification §1). No code change was needed; this item is
closed as already-satisfied, not newly built.

### #6 — Match header fields (Format, Ball type, Edition, League name)

Per the review: *"these are maintained at Hub side. Not required to be
extracted from Cricheroes."* Confirmed each sub-field already has a
Hub-maintained home, admin-set independently of the scorecard PDF:

| Plan sub-field | Hub home |
|---|---|
| Format (T20/T30) | `bookings.format` |
| Ball type | `tournaments.ball_type` (`'red'\|'white'\|'pink'`) |
| League vs. knockout | `bookings.stage_type` (`features/team-stats.md` §4) |
| Edition | Folded into the tournament's own `tournaments.name` (e.g. "Champions Trophy Ed-3") — not modelled as a separate structured field, by Hub's own naming convention |

Extracting these a second time from the scorecard's header line would
duplicate an existing source of truth rather than fill a gap — and could
disagree with it. No capture built.

### #7 — Winning margin/type

Per the review: *"already being reported at the Hub scorecard. Verify if
we are good there."* Confirmed correct. `src/lib/matchResultDisplay.ts`'s
`computeMatchMargin()`/`buildResultLine()` (see
`features/post-match-scorecard.md` §17) derive the margin purely from
data already captured and cached — `team_total`/`team_wickets`/
`opponent_total`/`opponent_wickets` plus toss (`deriveBattedFirst()`) —
never from a raw "by N runs/wickets" string. Verified against the real
sample PDF: for the Shiney 11 match, the raw extraction gives
`toss_won='Y'`/`toss_decision='bat'` (Spartans batted first), `team_total=218`,
`opp_total=221`, `opp_wickets='8'`, and `match_result='LOST'` (correctly
derived by `MatchStatsWriter._determine_match_result()` from the raw
`"Shiney 11 won by 2 wickets"` result line). Hub's `computeMatchMargin()`
on this data yields `{kind: 'wickets', value: 10 - 8 = 2}` →
`buildResultLine()` → **"LOST by 2 wickets"** — matching the scorecard's
own printed result exactly (Spartans lost, opponent chased it down with 2
wickets in hand). `src/lib/teamStatsCore.ts`'s `winMargin()` (feeds Team
Record's Records cards) uses the identical formula for the win-side case.
No capture built — the raw Result text staying discarded after WON/LOST
classification (per §2's audit) is fine, since nothing downstream needs
it.

### Security (vibe-security)

No code changed for this section — pure verification. N/A.

### File map

No files touched — verification only, against already-shipped code:
`spartans-python/utils/dismissal_parser.py`/`csv_writers.py` (§2, §7),
`src/lib/matchResultDisplay.ts`/`src/lib/teamStatsCore.ts` (§7).

---

## 8. Opponent captain flag on `opponent_team_list` (added September 2026)

### Why

Working Order #8 originally read "per-player Captain/WK boolean flags on
`team_list`" — a direct review narrowed this: Spartans' captain and WK
are already Hub concerns (`players.is_captain`/`squad.is_captain` for
captain, `squad.is_wk` for WK — both managed through Captains' Corner),
so a Spartans-side capture from CricHeroes would just be a second,
possibly-conflicting source of truth. The review's actual ask was
narrower and opponent-only: *"may be worth adding a captain name to the
opponent table we are maintaining"* — i.e. `opponent_team_list` (§6),
since Hub has no equivalent concept for an *opposing* team's captain at
all. No WK capture was asked for on the opponent side either, and none
was added.

`match_stats.opponent_captain` already existed as a match-level name
**string** (§2's audit table, unchanged from before this doc), extracted
by `MatchDetailsExtractor._extract_captains()` from the PDF's Match
Officials section — an entirely different section of the scorecard from
the Playing Squad list `opponent_team_list.player_name` comes from. No
new PDF parsing was needed; this closes the gap between two
already-extracted facts that had never been cross-referenced against
each other.

### What was added

- **`BaseCSVWriter._names_match(a, b)`** (`spartans-python/utils/csv_writers.py`)
  — a small static helper, same exact/casefold/alnum-stripped 3-pass
  fallback `_lookup_ci()` already uses for a dict-key lookup, but for two
  plain name strings (since there's no stats dict to look the captain
  name up *inside* here — just two independently-extracted strings to
  compare). **Real incident caught during verification, not hypothetical:**
  the sample PDF's own Match Officials section gives the opponent captain
  as `'Chethu Cs'`, but that same player's name in the Playing Squad list
  is `'Chethu CS'` — a bare `==` would have silently left the real captain
  unflagged. A casefold-normalized pass correctly matches them.
- **`OpponentTeamListWriter`** — `HEADERS` gained `is_captain`; `write()`
  gained an `opponent_captain: str = ''` parameter. For each row in
  `opponent_players`, `is_captain = bool(opponent_captain) and
  self._names_match(player_name, opponent_captain)` — `False` (never a
  guess) when the Match Officials section yielded no captain name at all,
  or matched no roster row.
- **`CSVWriterFactory.write_all()`** — resolves `opponent_captain` with the
  identical `is_team_spartans` flip already used for `opponent_players`
  (§6): `match_data['opp_captain']`/`['team_captain']` are keyed to
  `match_data['team']`/`['opponent']` (whichever the PDF happened to list
  first), not to which side is actually Spartans, so the same flip is
  needed here too. Passes the resolved value into
  `opponent_team_list_writer.write()`.
- **`opponent_team_list.is_captain`** — new `boolean not null default
  false` column (`analytics-db/migrations/012_opponent_team_list_captain.sql`,
  applied live).
- **`import_to_supabase.py`** — `COLUMN_TYPES['opponent_team_list']` gained
  `'is_captain': bool` (parsed from the writer's `'True'`/`'False'` string,
  same convention as `batted`/`did_bowl` elsewhere in this pipeline).
- **No Hub-side change at all.** `opponent_team_list` is already fetched
  via a bare `select('*')` and cached wholesale as a `jsonb` array in
  `match_stats_cache.opponent_team_list` (§6) — a new column on that table
  rides in automatically, the same "zero TypeScript touched" story §5/§6
  already document.

### Verification

1. **Full production pipeline run against the real scorecard PDF** (Hub
   match `14114256`) — `opponent_team_list.csv` correctly flags exactly one
   row, `'Chethu CS'` (`is_captain='True'`), matching `match_data['opp_captain']
   = 'Chethu Cs'` via the casefold pass despite the capitalisation
   difference; every other opponent player correctly reads `'False'`.
2. **Synthetic check of the `is_team_spartans=False` branch** — a match
   where `match_data['team']` is the *opponent* (not Spartans), to prove
   `write_all()`'s `opponent_captain` flip resolves correctly in both
   directions, not just the common case the real PDF happens to exercise.
   Confirmed the real opponent's captain (`'Rival Skipper'`, under
   `match_data['team_captain']` in this scenario) is the one flagged, not
   Spartans' own captain.
3. **Regression** — `smoke_test_batting_style.py` (already exercising
   `opponent_team_list.csv`, §6) extended with an `opp_captain: 'YARA'`
   fixture (deliberately differently-cased from the roster's `'Yara'`,
   mirroring the real `'Chethu Cs'`/`'Chethu CS'` incident) and
   `is_captain` assertions; `smoke_test_opponent_fow.py`/
   `smoke_test_extras.py` re-run unchanged as regression checks on the
   same shared `csv_writers.py` — all pass.
4. `python3 -m py_compile` on both touched Python files.

### Security (vibe-security)

Read-only PDF parsing, no new client-reachable input, no new write path
beyond the existing service-role-only sync pipeline. `opponent_team_list.is_captain`
follows the same RLS posture as every other column in this doc — no
anon/authenticated policies, service role only.

### File map

| File | Role |
|---|---|
| `analytics-db/migrations/012_opponent_team_list_captain.sql` | The new column |
| `spartans-python/utils/csv_writers.py` | `BaseCSVWriter._names_match()`; `OpponentTeamListWriter`'s `is_captain` column; `write_all()`'s `opponent_captain` resolution |
| `spartans-python/scripts/import_to_supabase.py` | `COLUMN_TYPES['opponent_team_list']` widened |

No `field_config.py`, `field_extractors.py`, `api.py`, `main.py`, or Hub
(`src/`) changes — `match_stats.opponent_captain`/`opponent_team_list`
were both already fully wired; this pass only stopped the two from being
compared against each other.

### Pending

| Item | Notes |
|---|---|
| Historical backfill | Every match synced before this shipped has `is_captain=false` (the column default) for every opponent row — only a re-sync recomputes it. |
| Opponent WK flag | Not asked for — see "Why" above; Spartans' own WK stays Hub-side (`squad.is_wk`), and the opponent side wasn't part of this review's ask. |
| No derivation or UI | Not built — same explicit scope as every other item in this doc. |

---

*Maintained by: Spartans CC BLR*
