# Batting Partnerships — Feature Summary

**Spartans Hub · Added: September 2026 · Status: All 6 phases shipped**

---

## 1. Overview

A batting partnership is "how many runs did two batters add together while
both were at the crease." Nothing in the Hub or the analytics DB tracked
this before — `batting_stats` only ever carries one row per player per
match (their own individual figures), with no notion of who else was
batting alongside them at any point in the innings.

This feature reconstructs partnerships from two facts that, together,
are sufficient to derive them with no additional data:

1. **Batting order** — already captured (`batting_stats.batting_order`,
   see `features/player-stats-batting-position.md`).
2. **Fall of Wickets** — the scorecard PDF's own "Fall of Wickets" section
   (team score + over + dismissed player, in wicket order), previously
   never parsed at all. New as of this feature.

Given both, a partnership is reconstructed with a simple crease-pointer
walk: seed the two lowest `batting_order` players as "at the crease,"
walk each Fall of Wickets entry in order, credit the runs since the
previous entry to whichever two players are currently paired, remove
whichever one the entry names as dismissed, and bring in the next
batter by `batting_order`. See §4 for the full algorithm and a worked
example.

**Status as of this doc:** the extraction, storage, Hub-sync, derivation,
and UI layers (Phases 1–6) are all built. Phases 1–3 are validated against
6 real innings across 3 different match PDFs; Phase 5's derivation is
additionally validated against the real, live analytics-DB rows for an
already-synced match (§4.1). Phase 4's Hub-side sync additions are a
small, mechanical mirror of four already-proven patterns in the same
function (see §9) and haven't yet been exercised by a real sync — the
next automated `backfill-scorecards` cron run against the live "Extreme
Cricket Summer Cup" match (§5) will be the first real proof of the sync
path end-to-end, and will also be the first time the Phase 6 UI (§6.6)
has real data to render for a match synced after this feature shipped.
Update this section once that run has been observed.

---

## 2. Why Fall of Wickets can only ever cover the Spartans innings

`spartans-python`'s `CSVWriterFactory.write_all()` has always been
Spartans-only — `batting_stats`/`bowling_stats`/`fielding_stats`/
`team_list` never store a row for the opponent's own lineup, regardless
of which side is batting on a given page. The opponent's batting figures
are read into memory only as context for Spartans' own bowling MVP
calculation, then discarded.

Fall of Wickets extraction deliberately mirrors this rather than
introducing a new, inconsistent scope: `ScorecardExtractor.
extract_fall_of_wickets()` itself is symmetric (returns both teams'
entries, same shape as the pre-existing `extract_team_lists()`), but
`CSVWriterFactory.write_all()` — the one place that already decides which
side to persist — picks only the Spartans side's list before handing it
to the writer. The opponent's Fall of Wickets is parsed transiently and
never stored, same as their batting stats always have been. This isn't a
limitation specific to this feature — nothing else in this database has
ever tracked an opponent's individual performance, and a partnership
between two opponent batters (who have no Hub `player_id` to attach to
anyway) wouldn't be usable by anything downstream.

---

## 3. Extraction — `spartans-python`

### `ScorecardExtractor.extract_fall_of_wickets()` (`utils/field_extractors.py`)

Parses the PDF's raw "Fall of Wickets" line, which has two real gotchas
found while building this against actual scorecards:

- **Entries wrap across physical PDF text lines mid-entry** — e.g. one
  line can end at `"140-6 (Mohan Chimbili,"` with the next line
  continuing `"16.1 ov), 157-7 (..."`. Handled the same way the pre-existing
  "To Bat" list's own line-wrap problem is handled: every line between the
  `"Fall of Wickets"` marker and the bowling table's `"No"` header is
  joined with a single space before parsing, not parsed line-by-line.
- **A player's own display name can contain parentheses** — e.g.
  `"Khanush (SR)"`, a CricHeroes house/disambiguation suffix. The entry
  regex (`FALL_OF_WICKET_PATTERN` in `utils/field_config.py`) is anchored
  on the very specific `", <over> ov)"` closing sequence rather than a
  naive comma split, so it doesn't get confused by an embedded `(SR)`.

```python
FALL_OF_WICKET_PATTERN = re.compile(r'(\d+)-(\d+)\s*\((.+?),\s*([\d.]+)\s*ov\)')
```

Each entry becomes `{'wicket_number': int, 'team_score': int, 'over':
float, 'player_name': str}`. `player_name` is run through the same
`ScorecardConfig.strip_name_annotations()` the batting table itself uses
— this is what lets a name like `"Khanush (SR)"` in the Fall of Wickets
text normalize to the identical `"Khanush"` that `batting_stats.
player_name` already stores for that player, so a later reader can join
the two by a plain string match.

### Shared name-normalization helper

`ScorecardConfig.strip_name_annotations()` (`utils/field_config.py`) is a
single implementation extracted out of four previously-duplicated inline
copies of the same parenthetical-stripping regex (batting lineup
extraction, the "yet to bat" list, batting stats, bowling stats). This
refactor was verified byte-for-byte equivalent against the pre-refactor
code across 3 real match PDFs before being shipped, since it touches the
same code path every real scorecard sync already depends on — not just
new code for this feature.

### Validation performed

Ran end-to-end against 6 real innings (3 different tournaments/grounds/
opponents, both battting-first and batting-second arrangements, partnership
sizes from single digits up to 145 runs):

- Every Fall of Wickets "out" name matches exactly one `batting_stats` row
  for that match (after normalization).
- No name is both "out" in Fall of Wickets and marked not-out in the
  batting table.
- No batter is left unaccounted for (batted, but neither out-per-FOW nor
  not-out).
- The crease-pointer partnership algorithm (§4) produces zero mismatches
  on any of the 6 innings tested, and correctly stops early on a side that
  finished not-all-out rather than assuming a full 10 wickets fell.

---

## 4. Partnership derivation algorithm

Implemented in `src/lib/partnerships.ts` (`computePartnerships()`) — see
§4.1 for the real-data validation this ran through.

```
crease = [batting_order[0], batting_order[1]]   # the two openers
next_in = 2
prev_score = 0
for entry in fall_of_wickets (ordered by wicket_number):
    partnership_runs = entry.team_score - prev_score
    partners = tuple(crease)                     # who added these runs
    crease.remove(entry.player_name)              # the one who got out
    if next_in < len(batting_order):
        crease.append(batting_order[next_in]); next_in += 1
    prev_score = entry.team_score
```

**Worked example** (FCC-Rockers, 166 all out — see the sample PDF this
was validated against): batting order 1 Sunil Reddy, 2 Karthik V, 3 Ravi
Thakur, 4 Priyaranjan, 5 Khanush (SR), 6 Mohan Chimbili, 7 Kaushik, 8
Madhusudhan, 9 Rajeevan, 10 RITURAJ SINHA, 11 Manoj..

| Wicket | Score | Partnership | Between | Out |
|---|---|---|---|---|
| 1 | 8 | 8 | Sunil Reddy & Karthik V | Karthik V |
| 2 | 72 | 64 | Sunil Reddy & Ravi Thakur | Sunil Reddy |
| 3 | 85 | 13 | Ravi Thakur & Priyaranjan | Ravi Thakur |
| 4 | 110 | 25 | Priyaranjan & Khanush (SR) | Priyaranjan |
| 5 | 117 | 7 | Khanush (SR) & Mohan Chimbili | Khanush (SR) |
| 6 | 140 | 23 | Mohan Chimbili & Kaushik | Mohan Chimbili |
| 7 | 157 | 17 | Kaushik & Madhusudhan | Madhusudhan |
| 8 | 160 | 3 | Kaushik & Rajeevan | Rajeevan |
| 9 | 165 | 5 | Kaushik & RITURAJ SINHA | RITURAJ SINHA |
| 10 | 166 | 1 | Kaushik & Manoj.. | Manoj.. |

Kaushik — never named as "out" in any entry — is the batting table's own
"not out" batter, a clean cross-check that the derivation is correct.

---

## 4.1 Implementation and validation (Phase 5)

`computePartnerships(batting, fallOfWickets)` in `src/lib/partnerships.ts`
is a pure function — no DB access of its own. Deliberately does **not**
reuse `matchTopPerformers.ts`'s `resolveSquadMatch()` pattern: that
function exists because a top-performer row's `player_id` can be null
pre-reconciliation, so it falls back to a squad name match. Here, both a
partnership's two players and a Fall of Wickets entry's dismissed name
resolve against the exact same `batting` array passed in — there's no
second, independent source to fall back to, and `batting_stats.player_id`
is already the authoritative, already-reconciled identity for that
scorecard name (see `features/player-identity-resolution.md`). A null
`player_id` here just means this player hasn't been reconciled yet, same
as anywhere else that reads `batting_stats` directly.

**Two return values carry distinct meaning, not just "empty vs not":**
- `[]` — nothing to show yet, not an error: no Fall of Wickets rows for
  this match, or fewer than two batters with a real `batting_order` (a
  booking whose scorecard predates this feature, or hasn't been
  re-synced since — see §5's "Nullable on nothing" note).
- `null` — a genuine data-integrity signal: a Fall of Wickets entry names
  someone who isn't one of the two current crease occupants. Against
  correct data this should never happen (see §3's cross-checks), so it's
  surfaced (`console.error`, prefixed `[partnerships]`) and the whole
  match's derivation is dropped rather than silently guessing a wrong
  pairing.

**Validated two ways before being considered done:**
1. Against a deliberately corrupted input (an unresolvable name) —
   correctly returns `null` and logs the mismatch instead of producing a
   partial or wrong partnership list. Also checked both `[]` cases (empty
   Fall of Wickets; fewer than two real batters).
2. Against the real, live analytics-DB rows for the "Extreme Cricket
   Summer Cup" match synced in Phase 3 (`match_id 26908096` — fetched
   fresh via SQL, not the locally-cached test fixtures from earlier
   phases) — reproduced the exact same 7-partnership breakdown, including
   correctly ignoring the three `did_not_bat` placeholder rows (which sort
   *before* the real batting order in a plain `ORDER BY batting_order`
   fetch, since their `batting_order` is `0`) rather than mistaking one
   for an opener.

Not yet wired into any API route or UI component (Phase 6) — this is
derivation logic only, called by nothing in the running app yet.

---

## 5. Database

### Analytics DB — `fall_of_wickets` (migration `005_fall_of_wickets.sql`)

```sql
CREATE TABLE fall_of_wickets (
  match_id      text    NOT NULL REFERENCES match_stats(match_id),
  wicket_number integer NOT NULL,
  team_score    integer NOT NULL,
  over          numeric NOT NULL,
  player_name   text    NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, wicket_number)
);
```

RLS enabled, no anon/authenticated policies — service role only, same
blanket-deny pattern as `match_stats`/`batting_stats`/`bowling_stats`/
`fielding_stats`/`team_list`.

**No `player_id` column** — unlike the other four analytics tables, this
one is never independently reconciled via `player_name_aliases`/
`match_name_overrides` (see `features/player-identity-resolution.md`).
Every wicket named here already has its own row in `batting_stats` for the
same `match_id` (a player can't fall without having batted), so a reader
resolves `player_name` → Hub `player_id` by joining to that
already-reconciled `batting_stats` row instead of through a second,
independent identity-resolution path. This also means a fall_of_wickets
row can never go stale the way a stored `player_id` snapshot could (see
`features/post-match-scorecard.md` §15's stale-cache incidents) — the join
always resolves against whatever `batting_stats.player_id` currently is.

**Nullable on nothing** — every existing match simply has zero rows here
until it's re-synced, same "code merged ≠ history re-run" posture as
`004_bowling_order.sql`.

### Hub DB — `match_stats_cache.fall_of_wickets` (migration `071_match_stats_cache_fall_of_wickets.sql`)

Nullable `jsonb` column, same one-column-per-analytics-table pattern
`044_match_stats_cache.sql` already established for `batting`/`bowling`/
`fielding`/`team_list`. Additive, no backfill — an existing booking's
cache row simply has `NULL` here until its next re-sync, same posture as
the analytics DB's own `bowling_order` rollout.

---

## 6. `spartans-python` CSV / Supabase wiring (Phase 2)

- `utils/csv_writers.py` — new `FallOfWicketsWriter`, headers `match_id,
  wicket_number, team_score, over, player_name`. Wired into
  `CSVWriterFactory` (`__init__` + `write_all()`), picking
  `match_data['fall_of_wickets'][spartans_team]` the same way
  `spartans_players`/`spartans_stats` are already picked.
- `scripts/import_to_supabase.py` — `fall_of_wickets.csv` added to
  `TABLE_MAPPING`/`COLUMN_TYPES`/`import_all()`'s import order. New
  `CONFLICT_KEYS` map, since this table's upsert target is `(match_id,
  wicket_number)` — every other table here defaults to `(match_id,
  player_name)`, which doesn't apply to Fall of Wickets' actual unique key.
- `api.py` (`summarize_csv_dir()`) / `main.py` (Drive-upload file list) —
  both updated so the new CSV surfaces in dry-run summaries and gets
  uploaded alongside the others.

**Real-match validation (5 Sep 2026):** rather than waiting for the next
scheduled cron, this match's own PDF (Extreme Cricket Summer Cup Season 1,
Spartans CC Bengaluru vs Kalinga Cricket Club, `match_id 26908096`, played
the morning of 6 Sep 2026) was run through the exact production pipeline
by hand and upserted directly into the live analytics DB — `match_stats`,
`team_list`, `batting_stats`, `bowling_stats`, `fielding_stats` (12 rows
each) and `fall_of_wickets` (7 rows) all landed correctly. One real gotcha
caught in the process: the extractor's own filename-derived `match_id`
(`'Scorecard_26908096'`) is *not* what production actually uses — both
`api.py`'s `/fetch-and-parse-scorecard` and the manual upload route always
override it with the Hub's own `bookings.match_id` before writing anything
(`match_id_override`), and the manual validation had to replicate that
override explicitly to land on the correct key. `scorecard_uploads` and
`match_stats_cache` were deliberately left untouched for this booking —
see the Hub-sync note below.

---

## 6.5 Real-sync proof still pending — Hub side (Phase 4)

The manual validation above proves the analytics-DB half of the pipeline
end-to-end for a genuinely new match. It deliberately did **not** touch
Hub's `scorecard_uploads`/`match_stats_cache` for that booking — the plan
is to let the twice-daily `backfill-scorecards` cron (see
`features/post-match-scorecard.md` §8) pick this booking up naturally,
now that both the `spartans-python` FOW code (pushed to `main`, confirmed
live on Render as of 5 Sep 2026) and this Hub-side sync code are in place.
Since the booking's own `scorecard_uploads` row doesn't exist yet, the
cron has no way to know analytics-DB rows already exist for it — it will
run its normal first-time path (re-fetch the PDF from CricHeroes, re-parse,
upsert) and simply overwrite the manually-inserted rows with identical
freshly-parsed data, then complete the part left undone here: flipping
`scorecard_uploads.status` to `synced` and populating
`match_stats_cache.fall_of_wickets` for real. This will be the first live,
fully-automated proof of Phases 1–4 together. Update this section once
that run has been observed.

---

## 6.6 UI (Phase 6)

A "Partnerships" **horizontal bar chart** in `ScorecardTables.tsx`,
positioned between Batting and Bowling — not appended after Fielding like
the fielding table was. Partnerships describe how the batting innings
unfolded, so they read as part of the batting story; since `batting` and
`fall_of_wickets` are both always scoped to the same (Spartans) innings
(§2), there's no ambiguity about which side's partnerships are shown — it
always lines up 1:1 with the Batting table directly above it.

**Bar chart, not a table** (changed shortly after the initial ship) — one
row per wicket, in wicket order, bar length proportional to that stand's
runs against the innings' biggest partnership. Reuses
`BattingPositionLeaders.tsx`'s exact bar treatment (the leaderboard's own
single-series magnitude-per-category chart — `bg-ink-4` track, `bg-gold/40`
fill, labels overlaid directly on the bar rather than hidden behind
hover) rather than inventing a new visual language, and for the same
reason that component has no separate "top" highlight: bar length already
encodes rank, so a second gold-text highlight on top of it (the original
table version's `isTop` treatment) would be redundant. Labels stay
always-visible text on the bar, not hover-only tooltips — consistent with
this app's daylight-first/no-hover-dependency UI principle (`ui-theme.md`;
outdoor mobile users, and hover doesn't work on touch anyway). Floored at
6% width so a 0-run partnership still renders a visible bar.

**Deliberately one merged view, not a separate raw Fall-of-Wickets list.**
Every classic FOW fact (cumulative score, over, who got out) is already
recoverable from a partnership row, so a second list underneath would just
show the same wickets again in a less useful format. The one value carried
over from the raw FOW convention is **"Over"** — the over the partnership
*ended* (`overTo`), matching the over value CricHeroes' own FOW line
shows, printed next to the runs value; `overFrom` is computed by
`computePartnerships()` but not surfaced here (available if a future view
needs the span). "Score" (cumulative team total) was considered and
deliberately dropped — it's recoverable by summing the runs values
top-to-bottom and is shown elsewhere on the card already; the interesting
fact here is stand size, not running total.

Each bar shows: wicket number (left label), both partnership players
overlaid on the bar (both render as `PlayerNameLink`s — the larger name is
not distinguished), and runs + over overlaid on the right. The dismissed
player gets a trailing `(out)` marker (muted text, not color-only, same
`ui-theme.md` principle as above). Hidden entirely (not shown empty) when
`computePartnerships()` returns `[]` or `null` — same "hidden, not empty"
convention as the Fielding table.

**Player identity — deliberately bypasses this file's own `findPlayerId()`
helper.** Every other table here resolves a Hub `player_id` via
`findPlayerId(row, name, squad)`, which returns `null` outright if `squad`
hasn't loaded yet (a real race in `MatchHistoryClient.tsx`: the scorecard
and squad-detail fetches run in parallel, and squad can still be
`undefined` when scorecard data is already in). That's harmless for the
other tables, whose own `row.player_id` is usually still null
pre-reconciliation anyway. It would be a real regression for partnerships,
whose `PartnershipPlayer.playerId` already comes straight from
`batting_stats.player_id` — the authoritative, already-reconciled identity
(§4.1) — so it's used directly as `PlayerNameLink`'s `playerId` prop, with
`findCricHeroesUrl()` (which degrades gracefully without squad) kept only
as the external-link fallback when there's no `playerId` at all.

**Threaded through both consumers:**
- `MatchHistoryClient.tsx` — `fall_of_wickets` was already flowing through
  the scorecard fetch since Phase 4; just needed adding to the
  `FullScorecard` type and passed down as a new prop.
- The standalone `/matches/history/[bookingId]/page.tsx` — its
  server-side `match_stats_cache` select was deliberately left without
  `fall_of_wickets` in Phase 4 (nothing rendered it yet); added here now
  that something does.

---

## 7. Security (vibe-security)

| Check | Status |
|---|---|
| `fall_of_wickets` RLS enabled, no anon/authenticated policies | ✅ |
| No `player_id`/identity data written from anything but the existing, already-audited `batting_stats` join path | ✅ (join happens at read time in `computePartnerships()`, see §4.1) |
| `computePartnerships()` is a pure function — no DB access, no new write path | ✅ |
| `ScorecardTables.tsx`'s Partnerships table reuses the existing scorecard route's auth — no new access surface, no new data exposed beyond what `batting`/`fall_of_wickets` already carry | ✅ |
| Extraction is read-only against the PDF; no new write path introduced anywhere in the Hub | ✅ |
| Spartans-only scope maintained — no opponent data newly persisted | ✅ |
| Existing production parsing (`batting_stats`/`bowling_stats`/`team_list` extraction) verified byte-for-byte unchanged before shipping the shared name-normalization refactor | ✅ |
| `GET /api/matches/history/[bookingId]/scorecard`'s new `fall_of_wickets` field reuses the existing route's auth (any signed-in, non-expelled member) — no new access surface, matches every other field already returned there | ✅ |
| `match_stats_cache.fall_of_wickets` written only by `syncMatchStatsForBooking()`, same service-role-only path as every other column on that row | ✅ |

---

## 8. File Map

| File | Role |
|---|---|
| `analytics-db/migrations/005_fall_of_wickets.sql` | The new table (§5) |
| `spartans-python/utils/field_config.py` | `FALL_OF_WICKET_PATTERN`, `ScorecardConfig.strip_name_annotations()` |
| `spartans-python/utils/field_extractors.py` | `ScorecardExtractor.extract_fall_of_wickets()` and its helpers |
| `spartans-python/utils/csv_writers.py` | `FallOfWicketsWriter` |
| `spartans-python/scripts/import_to_supabase.py` | `fall_of_wickets.csv` → `fall_of_wickets` table mapping, `CONFLICT_KEYS` |
| `spartans-python/api.py`, `spartans-python/main.py` | `match_data['fall_of_wickets']` populated; dry-run summary + Drive upload lists updated |
| `supabase/migrations/071_match_stats_cache_fall_of_wickets.sql` | Hub-side cache column (§5) |
| `src/lib/matchStatsSync.ts` | `syncMatchStatsForBooking()` now also fetches `fall_of_wickets` (ordered by `wicket_number`) and writes it into `match_stats_cache` |
| `src/app/api/matches/history/[bookingId]/scorecard/route.ts` | Now also returns `fall_of_wickets` alongside batting/bowling/fielding/team_list |
| `src/lib/partnerships.ts` | `computePartnerships()` — the crease-pointer algorithm (§4), pure function |
| `src/components/matches/ScorecardTables.tsx` | Partnerships bar chart (§6.6) — between Batting and Bowling, same bar treatment as `BattingPositionLeaders.tsx`, `(out)` marker on the dismissed player |
| `src/components/matches/MatchHistoryClient.tsx` | `FullScorecard` type + prop threading for `fall_of_wickets` |
| `src/app/matches/history/[bookingId]/page.tsx` | `match_stats_cache` select widened to include `fall_of_wickets`; passed down to `ScorecardTables` |

---

## 9. Pending

| Item | Notes |
|---|---|
| First real end-to-end cron proof | See §6.5 — the manual Phase 3 validation and this feature's own Phase 4/6 code are both in place, but no match has yet gone through the automated `backfill-scorecards` cron with the FOW-aware pipeline live end-to-end. Worth a follow-up note here once that's been observed. |

---

*Maintained by: Spartans CC BLR*
