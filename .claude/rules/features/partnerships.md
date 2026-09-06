# Batting Partnerships — Feature Summary

**Spartans Hub · Added: September 2026 · Status: In progress (Phases 1–3 done)**

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

**Status as of this doc:** the extraction and storage layers (Phases 1–3
below) are built and validated against 6 real innings across 3 different
match PDFs — no derivation or UI exists yet (Phases 4–6, not started).
This doc will be updated as those land.

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

Not yet implemented on the Hub side (Phase 5) — documented here since it's
already been validated standalone against real data:

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

### Hub DB

No changes yet — `match_stats_cache` doesn't carry Fall of Wickets data
until Phase 4 (Hub-side sync) lands.

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

---

## 7. Security (vibe-security)

| Check | Status |
|---|---|
| `fall_of_wickets` RLS enabled, no anon/authenticated policies | ✅ |
| No `player_id`/identity data written from anything but the existing, already-audited `batting_stats` join path | ✅ (join happens at read time, not yet built — Phase 5) |
| Extraction is read-only against the PDF; no new write path introduced anywhere in the Hub | ✅ |
| Spartans-only scope maintained — no opponent data newly persisted | ✅ |
| Existing production parsing (`batting_stats`/`bowling_stats`/`team_list` extraction) verified byte-for-byte unchanged before shipping the shared name-normalization refactor | ✅ |

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

---

## 9. Pending (not yet built)

| Phase | Item |
|---|---|
| 4 | Hub sync — `src/lib/matchStatsSync.ts` pulls `fall_of_wickets` into `match_stats_cache` (new jsonb column, Hub migration) |
| 5 | Hub derivation — `src/lib/partnerships.ts`, the crease-pointer algorithm (§4) implemented against real `batting_stats`/`fall_of_wickets` data, with an assertion (not silent fallback) when a name doesn't resolve |
| 6 | UI — a Partnerships table on the match scorecard (`ScorecardTables.tsx` or a new sibling component), hidden entirely for a match with no Fall of Wickets data yet |

---

*Maintained by: Spartans CC BLR*
