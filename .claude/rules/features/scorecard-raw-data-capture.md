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
| Match — Edition, Format (T20/T30), Ball type, Competition/League name | ❌ not captured as separate fields — the header line `"CHAMPIONS TOURNEY ED-3 (T30 - WHITE BALL) (Super League)"` is read only to classify `match_type` into League/Final/Semi Final/Practice; Format/Ball type/League name are read into a throwaway string and discarded |
| Match — Winning margin/type (e.g. "by 2 wickets") | ❌ the raw Result text is read into memory only to classify WON/LOST by keyword, then discarded — never persisted |
| Squad/Player — Player, Team, Batting position | ✅ (Spartans only) |
| Squad/Player — Captain | ⚠️ available as a single match-level name string (`match_stats.team_captain`/`opponent_captain`), not a per-player boolean |
| Squad/Player — Wicketkeeper | ❌ not captured anywhere, at any level. The raw `"( WK )"`/`"(wk)"` annotation is sitting in the text, same shape `extract_batting_style()` already reads |
| Squad/Player — Batting hand | ✅ Spartans + dismissed opponent batters (`partnerships.md` §12). ❌ still missing for a not-out opponent batter |
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
| 2 | Wicketkeeper annotation | ⏳ Not started |
| 3 | Bowler who dismissed a Spartans batter (own `batting_stats`) | ✅ Superseded — see §5's redundancy note. Captured at the FOW grain instead of a duplicate `batting_stats` column |
| 4 | Bowler credit + dismissal type on Spartans' own `fall_of_wickets` | ✅ Done — see §5 |
| 5 | Dismissal type on `opponent_fall_of_wickets` | ✅ Done — see §5 |
| 6 | Match header: Format, Ball type, Edition, League name (split from `tournament_name`/`match_type`) | ⏳ Not started |
| 7 | Winning margin/type (raw text) | ⏳ Not started |
| 8 | Per-player Captain/WK boolean flags on `team_list` (vs. today's match-level name string) | ⏳ Not started |
| 9 | Batting hand for a not-out opponent batter | ⏳ Not started — needs a new opponent-side roster table (`opponent_team_list`), since `opponent_fall_of_wickets` only ever has a row per *wicket*; a batter never dismissed has no row anywhere to carry it. See `partnerships.md` §12's "Not captured" note |

Item #3 originally read "Bowler/fielder who dismissed a Spartans batter" —
narrowed to bowler-only (§3.1), then closed out entirely once §5 shipped
fielder too, on the FOW tables rather than `batting_stats`. Item #9 (not
in the original 8-item list) was added once the fielder-descope
correction (§3.1) prompted a full re-read of the plan document, which
surfaced this genuinely still-open gap.

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
| Batting hand for a not-out opponent batter (Working Order #9) | Still open — a genuinely separate gap needing a new table, not something this pass's FOW-grain approach can reach (see §3, item #9). |
| No derivation or UI | Not built — same explicit scope as every other item in this doc. |

---

*Maintained by: Spartans CC BLR*
