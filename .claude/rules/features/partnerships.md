# Batting Partnerships — Feature Summary

**Spartans Hub · Added: September 2026 · Status: All 6 phases shipped, plus unbroken-partnership support (§4.2)**

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

**Unbroken (undefeated) partnerships (added September 2026).** Fall of
Wickets only ever records a wicket *falling* — it has no entry for "the
innings just ended." Two real cases fall through the walk above with no
partnership emitted at all unless the caller also supplies the innings'
final score/overs: a team that lost **zero** wickets (the crease-pointer
loop never runs, so the entire opening stand goes unrecorded), and any
innings that ends **not-all-out mid-stand** (overs run out, or a chase is
completed, while two batters are still at the crease). `computePartnerships()`
now takes an optional `FinalScore { total, overs }` third argument and, when
supplied, emits one closing partnership with `outPlayer: null` whenever the
crease still holds two never-separated batters once Fall of Wickets is
exhausted — see §4.2.

**Status as of this doc:** the extraction, storage, Hub-sync, derivation,
and UI layers (Phases 1–6) are all built and, as of 6 Sep 2026, proven
end-to-end against real production syncs, not just simulated data. Phases
1–3 were validated against 6 real innings across 3 different match PDFs;
Phase 5's derivation was additionally validated against the real, live
analytics-DB rows for an already-synced match (§4.1). The full Phase 1–6
chain — CricHeroes PDF fetch → parse → analytics DB → Hub sync → bar chart
— was then proven live via the `backfill-scorecards` cron (triggered
manually once, since the twice-daily schedule hadn't fired yet that day)
against three real matches in the same session: match `26908096`
("Extreme Cricket Summer Cup") synced with its expected 7 Fall of Wickets
rows plus an unbroken 8th closing partnership; match `22730364` (a
re-sync of an older match, predating this feature) synced with 5 rows
plus an unbroken closing partnership between the two real not-out
batters, cross-checked against their `batting_stats.dismissal_method`
independently of the derivation logic. See §4.2 for the unbroken-stand
mechanics these two matches confirmed, and §6.6 for a subsequent UI fix
(first-name-only labels, no `(out)` marker) made after seeing the chart
render against this real data for the first time.

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

Parses the PDF's raw "Fall of Wickets" line, which has real gotchas
found while building this (and, in one case, operating) it against
actual scorecards:

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
- **The wrap can also land exactly between the score's hyphen and the
  wicket number itself** — a sub-case the original line-join fix above
  didn't cover; see the incident write-up right after the code block
  below for the real match that caught it and the fix.

```python
FALL_OF_WICKET_PATTERN = re.compile(r'(\d+)-\s*(\d+)\s*\((.+?),\s*([\d.]+)\s*ov\)')
```

Each entry becomes `{'wicket_number': int, 'team_score': int, 'over':
float, 'player_name': str}`. `player_name` is run through the same
`ScorecardConfig.strip_name_annotations()` the batting table itself uses
— this is what lets a name like `"Khanush (SR)"` in the Fall of Wickets
text normalize to the identical `"Khanush"` that `batting_stats.
player_name` already stores for that player, so a later reader can join
the two by a plain string match.

### Incident — line-wrap landing between the score's hyphen and the wicket number (fixed September 2026)

**Reported symptom:** a not-out batter (Muthukumar R) never showed up
anywhere in the Partnerships chart for Hub match `14114256` (5 Jan 2025
vs Shiney 11) — not just missing the unbroken tag, absent from the chart
entirely, even though `batting_stats` clearly showed him `not_out`.

**Root cause:** the real PDF's Fall of Wickets line for this innings
wraps mid-entry, right between the score's hyphen and the wicket number:

```
...143-6 (Santosh, 21.5 ov), 187-
7 (Abhishek Prajapati, 25.3 ov), 188-8 (Manohar B Reddy, 26 ov)
```

`_extract_fow_entries()`'s existing line-join (documented above) strips
and joins each physical line with a single space, which turned this into
`"...187- 7 (Abhishek Prajapati, 25.3 ov), 188-8 (...)"`. The pre-fix
`FALL_OF_WICKET_PATTERN`, `r'(\d+)-(\d+)\s*\(...'`, required the wicket
number to sit immediately against the hyphen with no gap — so this one
entry (wicket 7, Abhishek Prajapati) silently failed to match and was
dropped, while every other entry (which happened to wrap somewhere the
existing fix already handled, or not wrap at all) parsed fine. The
analytics DB and Hub's `match_stats_cache` both ended up with only 7 Fall
of Wickets rows against a real `team_wickets` of 8.

This didn't just hide one row — it broke the whole downstream derivation.
`computePartnerships()`'s crease-pointer walk (§4) advanced one step
short of where it should have, which (a) silently merged two real
wickets (7 and 8) into one wrong "45-run, Abhishek Prajapati & Manohar B
Reddy" partnership, and (b) never brought Muthukumar R into the crease at
all, so the completeness check added in §4.3
(`fow.length === finalScore.wickets`, 7 ≠ 8) correctly refused to
synthesize the unbroken closing stand between Suyash Pancholi and
Muthukumar R — the derivation logic did exactly what it was designed to
do once handed genuinely incomplete data; the incomplete data was the bug.

**Fix:** `FALL_OF_WICKET_PATTERN` widened from a bare `-` to `-\s*`
between the score and the wicket number, so it tolerates the inserted
join-space without weakening the match in the ordinary no-wrap case
(zero whitespace still matches fine). Verified against the real joined
text from this match (all 8 wickets now parse correctly, in the right
order) and against a regression check that the change doesn't alter
matches on an unaffected, non-wrapped Fall of Wickets string from the
same PDF (the opponent's own innings). See `field_config.py`'s comment on
`FALL_OF_WICKET_PATTERN` for the in-code version of this note.

**Data correction, applied directly (no re-sync needed):** the real
wicket 7 (187 runs, over 25.3, Abhishek Prajapati — read off the actual
CricHeroes PDF) was inserted directly into both the analytics DB's
`fall_of_wickets` table and the Hub's already-synced
`match_stats_cache.fall_of_wickets` jsonb array for this one booking
(`fb9d6518-e38f-470a-b372-350e778c8d97`), same "database-side patch, not
a re-sync loop" convention `features/post-match-scorecard.md` §15
documents for an equivalent stale-cache fix. With `fow.length` now `8`,
matching `team_wickets`, the chart correctly derives all 9 partnerships —
including the previously-missing unbroken `30*` stand between Suyash
Pancholi and Muthukumar R. No other booking was touched as part of this
fix — see §9 for the open question of how many other historical matches
this same line-wrap sub-case may have silently affected.

### Incident — a re-parse split one batter into two duplicate rows under different names (Hub `match_id 18985509`, fixed September 2026)

**Reported symptom:** the Partnerships chart was entirely absent on the
26 Oct 2025 match vs Disrupters CC (Hub booking
`a56d4c22-252c-4337-bd60-e11b7ea57faf`, `match_id 18985509`) — this is the
same "G-One" match already flagged, unresolved, in §9's "3 synced matches
drop out of every partnership view" row.

**Root cause:** the analytics DB carried **two** rows in `batting_stats`
for batting position 4 in this match — `"G-One"` (`created_at`
2026-09-15, `player_id: null`) and `"Jeewan Singh Jalal"` (`created_at`
2026-07-29, `player_id: null`) — with byte-identical stats (9 runs off 8
balls, 1 four, caught). The same duplication existed across
`bowling_stats`, `fielding_stats`, and `team_list` too, all with the exact
same pair of timestamps: this one match was fully re-parsed on 2026-09-15
(the same run that backfilled its `fall_of_wickets` rows), and that
re-parse's batting/bowling/fielding/team-list extraction produced a
different name spelling for this one real batter than the original July
sync had — the composite key on every one of these tables is `(match_id,
player_name)`, so the re-parse's upsert **inserted a new row** rather than
updating the existing one. Tellingly, the *same* re-parse run's own
`fall_of_wickets` extraction still named this batter `"Jeewan Singh
Jalal"` — the two extraction paths disagreed on this one player's name
within the same PDF, within the same parse.

This broke `computePartnerships()`'s crease-pointer walk (§4) exactly the
way the integrity guard is designed to: with two rows tied at
`batting_order: 4`, the stable sort placed `"G-One"` ahead of `"Jeewan
Singh Jalal"` in the batting order array, so the walk brought `"G-One"`
into the crease after wicket 2 — then wicket 3's Fall of Wickets entry
named `"Jeewan Singh Jalal"` as dismissed, which matched neither crease
occupant, and `computePartnerships()` correctly returned `null` rather
than guess.

**Fix — a database-side patch, not a re-sync loop**, same convention as
the incident above: the four spurious `"G-One"` rows (one each in
`batting_stats`, `bowling_stats`, `fielding_stats`, `team_list`) were
deleted directly from the analytics DB, keeping the original `"Jeewan
Singh Jalal"` rows — the name Fall of Wickets already references. The
Hub's already-synced `match_stats_cache` for this booking was patched the
same way, stripping the matching `"G-One"` element out of its `batting`/
`bowling`/`fielding`/`team_list` jsonb arrays (no re-sync needed). With the
duplicate gone, the batting order resolves cleanly to `Shabarinath →
Siva → Uday → Jeewan Singh Jalal → Harsha Konka → Darshan Shetty`, and the
crease-pointer walk now produces all 5 partnerships for this innings
(4 from Fall of Wickets plus one unbroken closing stand between Darshan
Shetty and Harsha Konka), summing correctly to the team's 184 all out.

**Scope check:** a follow-up audit
(`SELECT match_id, batting_order, count(*) FROM batting_stats WHERE
batting_order > 0 GROUP BY match_id, batting_order HAVING count(*) > 1`)
found no other match currently carrying this same duplicate-batting-
position pattern — this incident was isolated to `18985509`. The other
two matches §9 already names ("Dharmarajan S" vs "DS Sakketha";
"Kushal Vidya") are a different-shaped mismatch (an unresolved name
disagreement, not a duplicate row pair) and were not touched by this fix.

### Incident — CricHeroes' own Fall of Wickets text had a duplicate wicket number and a phantom repeated name (Hub `match_id 25465218`, fixed September 2026)

**Reported symptom:** for the 4 Jul 2026 match vs Bangalore Bolsters
(Hub booking `20bb06ef-2025-48f1-ad29-fe26dbc589a4`), the Partnerships
chart showed a 148-run stand for wicket 4 between Anurag Tiwari and Siva
Kumar — but the real scorecard shows a 20-run stand there, followed by a
separate 128-run stand for wicket 5 between Tushar Shankar and Siva that
wasn't shown at all. Unlike every other incident in this section, this one
produced **wrong numbers, not a hidden chart** — `computePartnerships()`'s
integrity guard never fired, because every name it checked against the
crease was technically present.

**Root cause — verified directly against the real CricHeroes PDF**, not
inferred: the scorecard's own "Fall of Wickets" line reads

```
76-1 (Loki, 6.3 ov), 76-2 (Shivashankara GS, 6.4 ov), 98-3 (Saurav Kalsoor, 8.4 ov),
118-3 (Anurag T, 10.3 ov), 246-4 (Siva, 24.2 ov), 261-5 (Tushar Shankar, 26.2 ov),
262-6 (Anurag T, 27 ov), 262-7 (Darshan Shetty, 27.1 ov), 266-8 (Ramesh Shanmugamoorthy, 28 ov),
282-9 (Preetam Patil, 30 ov)
```

Two independent errors in CricHeroes' own text, both upstream of anything
`spartans-python` or the Hub does: **wicket number `3` is used twice**
(`98-3` for Saurav Kalsoor and `118-3` for Anurag T — the real wicket 4
onward should all be one higher than printed), and **"Anurag T" is named
a second time** at `262-6`, even though the batting card shows him
dismissed only once (32 off 19, stumped). Since `fall_of_wickets`' primary
key is `(match_id, wicket_number)`, the sync silently kept the first
`wicket_number: 3` row (Saurav Kalsoor) and dropped the second (`118-3`,
Anurag T's real dismissal) as a conflicting insert — but the phantom
second "Anurag T" entry, correctly labeled `wicket_number: 6` in the raw
text (a number nothing else was using), inserted without any conflict at
all. Net effect: Anurag T's true, earlier dismissal at 118 vanished, while
a repeated, non-existent one at 262 took a real wicket-number slot —
and because the resulting row *count* still happened to equal `team_wickets`
(9 either way), this wasn't the kind of gap the existing "row count falls
short" fingerprint (used to audit the line-wrap incident above) would ever
catch.

**Fix — read directly off the real PDF, not guessed**, same
"database-side patch" convention as both incidents above: every
`fall_of_wickets` row for this match was deleted and reinserted from the
verified PDF text, in both the analytics DB and the Hub's
`match_stats_cache`, with the corrected sequence:

| Wicket | Score | Over | Player |
|---|---|---|---|
| 1 | 76 | 6.3 | Loki |
| 2 | 76 | 6.4 | Shivashankara GS |
| 3 | 98 | 8.4 | Saurav Kalsoor |
| 4 | 118 | 10.3 | Anurag T |
| 5 | 246 | 24.2 | Siva |
| 6 | 261 | 26.2 | Tushar Shankar |
| 7 | 262 | 27.1 | Darshan Shetty |
| 8 | 266 | 28 | Ramesh Shanmugamoorthy |
| 9 | 282 | 30 | Preetam Patil |

The corrected 9 rows resolve cleanly through the crease-pointer walk and
sum to the team's real 282 all out, correctly producing the 20-run
Anurag T/Siva stand and the 128-run Tushar/Siva stand the real scorecard
shows. `team_wickets` (9) still equals `fow.length` (9), so §4.3's
completeness check is unaffected; the crease ends at length 1 (Manohar B
Reddy stranded not out, no partner left in a 10-man lineup), so no
unbroken closing partnership is synthesized — also correct.

**Scope check — with a sharper fingerprint than the row-count one used
above.** Since this bug can hide behind a row count that still equals
`team_wickets` (as it did here), the useful signal is a player name
appearing **more than once within one match's own `fall_of_wickets`
array** — `SELECT match_id, elem->>'player_name', count(*) FROM
match_stats_cache, jsonb_array_elements(fall_of_wickets) elem GROUP BY
match_id, elem->>'player_name' HAVING count(*) > 1` — which found nothing
else club-wide after this fix, confirming this incident was isolated to
`25465218`. Neither this query nor the row-count-shortfall one used for
the line-wrap incident is a complete audit on its own; a future check for
this bug class should run both.

---

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
    out_idx = crease.index(entry.player_name)     # which slot just fell
    if next_in < len(batting_order):
        crease[out_idx] = batting_order[next_in]; next_in += 1  # incoming batter fills the vacated slot
    else:
        crease.pop(out_idx)                       # no one left — last wicket of the innings
    prev_score = entry.team_score
```

**Slot-stable ordering (fixed shortly after the first real production
render, September 2026).** The incoming batter fills the *vacated* slot,
not always the second one — an earlier version did `crease.remove(...)`
then unconditionally `crease.append(...)`, which silently shifted the
surviving batter into the other slot whenever the dismissed player had
been in slot 0, making them appear to swap sides between one partnership
and the next for no reason a reader could see. Keeping the survivor's slot
stable means the same name visually persists in the same position across
consecutive rows on the UI (§6.6), and only the incoming name changes —
this is what let a real user (viewing the bar chart, not this table) spot
the bug in the first place: a name that should have "carried over" between
two adjacent bars was flipping sides instead.

**Worked example** (FCC-Rockers, 166 all out — see the sample PDF this
was validated against): batting order 1 Sunil Reddy, 2 Karthik V, 3 Ravi
Thakur, 4 Priyaranjan, 5 Khanush (SR), 6 Mohan Chimbili, 7 Kaushik, 8
Madhusudhan, 9 Rajeevan, 10 RITURAJ SINHA, 11 Manoj..

| Wicket | Score | Partnership | Between | Out |
|---|---|---|---|---|
| 1 | 8 | 8 | Sunil Reddy & Karthik V | Karthik V |
| 2 | 72 | 64 | Sunil Reddy & Ravi Thakur | Sunil Reddy |
| 3 | 85 | 13 | Priyaranjan & Ravi Thakur | Ravi Thakur |
| 4 | 110 | 25 | Priyaranjan & Khanush (SR) | Priyaranjan |
| 5 | 117 | 7 | Mohan Chimbili & Khanush (SR) | Khanush (SR) |
| 6 | 140 | 23 | Mohan Chimbili & Kaushik | Mohan Chimbili |
| 7 | 157 | 17 | Madhusudhan & Kaushik | Madhusudhan |
| 8 | 160 | 3 | Rajeevan & Kaushik | Rajeevan |
| 9 | 165 | 5 | RITURAJ SINHA & Kaushik | RITURAJ SINHA |
| 10 | 166 | 1 | Manoj.. & Kaushik | Manoj.. |

Kaushik — never named as "out" in any entry — is the batting table's own
"not out" batter, a clean cross-check that the derivation is correct. Note
he holds the same (second) slot in every row from wicket 6 onward — the
slot-stability fix above is what keeps him there instead of drifting
between columns as new partners rotate through the other slot.

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

## 4.2 Unbroken partnerships — `FinalScore` (added September 2026)

**The gap:** the crease-pointer walk (§4) only ever advances on a Fall of
Wickets entry, so it has no way to close out a stand that the innings
ended without breaking. Two real shapes hit this:

- **Zero wickets lost.** `fallOfWickets` is empty, so the loop body never
  runs at all — the entire opening stand (a real, often large partnership)
  produced zero output.
- **Not-all-out, mid-stand.** Overs run out, or a chase is completed,
  while two batters are still at the crease. Every wicket that *did* fall
  is correctly reported, but the final, often match-deciding stand between
  whoever was in when the last wicket fell and their partner is silently
  dropped — the walk just ends when Fall of Wickets is exhausted, with no
  signal that two players were still out there.

**The fix:** `computePartnerships()` takes an optional third argument,
`finalScore: FinalScore | null` (`{ total, overs }` — the innings' final
score and over count). `Partnership.outPlayer` is now `PartnershipPlayer |
null` (`null` = this stand was never separated). After the Fall of Wickets
loop, if the crease still holds exactly two players *and* `finalScore.total
> prevScore` (the running score reached after the last processed wicket,
or `0` if none fell), one closing partnership is emitted with
`outPlayer: null`, `runs: finalScore.total - prevScore`, and
`overTo: finalScore.overs`. The `total > prevScore` guard is what
distinguishes a genuine unbroken stand from an innings that finished
exactly on the last recorded wicket (crease would still be length 2 there
too, since a new batter is brought in for every fallen wicket except the
very last) — without it this would double-count the last wicket's own
partnership as a second, phantom, zero/negative-run entry.

Without `finalScore` (the parameter is optional, `undefined`/`null` both
skip this branch entirely), behaviour is byte-for-byte unchanged from
Phase 5 — every existing caller that hasn't been updated keeps working
exactly as before.

> **Updated below (§4.3):** the "one closing partnership" condition above
> is accurate for this fix as originally shipped, but was found to be
> unsafe against real historical data the same week — see §4.3 for the
> completeness check since added on top of it (`finalScore.wickets`).

**Validated against three cases, all via a standalone Node script mirroring
the exact TypeScript logic (not just type-checked):**
1. **Real match `26908096`** (the "Extreme Cricket Summer Cup" match — see
   §5 below) with `finalScore { total: 87, overs: 17.3 }` — correctly adds
   an 8th partnership beyond the 7 Fall-of-Wickets-derived ones: `2*` runs
   between Suyash Pancholi and Manoj Borse, the pair left at the crease
   when the chase was completed.
2. **Synthetic zero-wickets case** (`219/0`, no Fall of Wickets rows at
   all) with `finalScore { total: 219, overs: 20.0 }` — correctly returns
   exactly one partnership: a `219*` unbroken opening stand between the
   two openers. Without `finalScore`, the same input still correctly
   returns `[]` (nothing computable, not an error).
3. **The FCC-Rockers all-out-166 match** (§4's worked example — a genuine
   last-man-standing finish) with `finalScore { total: 166, overs: 20.0 }`
   — correctly still returns exactly the same 10 partnerships, with **no**
   phantom 11th entry. After the 10th wicket falls, the crease has length
   1 (no batter left in `order` to bring in), so the `crease.length === 2`
   guard alone prevents a spurious closing partnership on a genuinely
   complete all-out innings — the `total > prevScore` check is a second,
   independent safeguard for the id-length-2-but-nothing-left-to-add case.

`tsc --noEmit` passes clean with the new `finalScore` parameter and the
now-nullable `outPlayer` threaded through every consumer.

---

## 4.3 Completeness check — don't fabricate a partnership for a match with
no Fall of Wickets data at all (fixed the same week)

**The bug §4.2 introduced:** `fallOfWickets` is empty for two completely
different reasons, and §4.2's fix couldn't tell them apart. A team that
genuinely lost zero wickets has `fallOfWickets: []` — but so does *every*
match synced before this feature shipped (6 Sep 2026) or not re-synced
since, regardless of how many wickets actually fell, since Fall of Wickets
extraction simply didn't exist yet for those syncs. Once §4.2 started
synthesizing a closing partnership whenever `crease.length === 2 &&
finalScore.total > prevScore`, any historical match with real wickets but
no FOW rows satisfied that condition too (`crease` untouched at `[order[0],
order[1]]`, `prevScore` still `0`) — and the chart rendered one fabricated
"partnership" spanning the *entire* team total, labelled wicket 1, as if
the two openers had batted the whole innings unbroken. Confirmed live: a
138-all-out innings (10 wickets, zero synced FOW rows) was rendering as a
`138*` opening stand between two players who, per the real scorecard, were
both long since out.

**The fix:** `FinalScore` gained a third field, `wickets: number | null` —
the scorecard's own summary wicket count (`match_stats_cache.team_wickets`,
independent of `fall_of_wickets` and present on every synced match, both
before and after this feature). The unbroken-partnership synthesis now
also requires `finalScore.wickets != null && fow.length ===
finalScore.wickets` — i.e., the number of Fall of Wickets rows actually
matches how many wickets really fell, so the crease genuinely reflects who
was left not-out rather than "we just don't have the breakdown." A
`wickets` value that's missing entirely (`null`) fails safe the same way —
a genuine zero-wicket innings always has `wickets === 0`, never `null`, so
there's no real case this excludes that should have been included.

This only gates the *synthesis* step, not the main Fall-of-Wickets loop —
a match with some real FOW rows already synced still shows exactly those
partnerships regardless of this check (the loop only ever reports data
that's actually present). In practice this distinction is moot for this
codebase today: extraction is all-or-nothing per match (§3's single joined
text block, parsed as one unit), so a genuinely *partial* FOW set — some
real rows synced, but fewer than the true wicket count — isn't a case this
pipeline currently produces. The `<` comparison (via `===`, not just
truthiness) is still the right general check rather than a narrower
`fow.length === 0` special-case, since it costs nothing extra and
correctly covers that hypothetical case too, should a future parsing
regression ever produce one.

> **Correction (September 2026, see §3's incident write-up):** "extraction
> is all-or-nothing per match" above turned out to be wrong in one real
> case — match `14114256`'s Fall of Wickets was genuinely *partial* (7 of
> 8 real wickets), silently produced by a line-wrap sub-case the original
> extractor regex didn't handle. This is exactly the hypothetical the `<`
> comparison above was already written to cover "should a future parsing
> regression ever produce one" — and it did. The completeness check held
> correctly even then: it refused to synthesize a wrong unbroken
> partnership from the incomplete 7-row set, which is what first
> surfaced the missing row as a reported symptom rather than a second,
> silently wrong fabrication. No change to this check was needed; only
> the upstream extraction bug that produced the partial data needed
> fixing.

**Validated:** re-ran the exact three §4.2 scenarios (real match
`26908096`, synthetic `219/0`, FCC-Rockers all-out-166) against the
updated logic — all three unaffected, since each already had
`fow.length === finalScore.wickets` (7=7, 0=0, 10=10 respectively). Added
a fourth case, the actual reported bug: a synthetic 138-all-out innings
(`wickets: 10`) with zero Fall of Wickets rows now correctly returns `[]`
instead of a fabricated `138*` partnership. Cross-checked directly against
the live analytics DB: `team_wickets` equals the Fall of Wickets row count
for both `26908096` (7=7) and `22730364` (5=5), confirming the check holds
for real synced data, not just the synthetic cases. Also confirmed via a
direct query that this is a real, widespread gap in the historical
backlog, not a one-off — e.g. match `23783143` (138 all out) has 10
wickets and zero Fall of Wickets rows, exactly the bug shape. Closing this
gap is one motivation for backfilling Fall of Wickets across the
historical backlog (a pending item — see §9): until a match is re-synced,
its Partnerships chart now stays correctly hidden rather than showing
fabricated data.

**`teamWickets` threaded through both consumers** the same way
`teamTotal`/`teamOvers` already were — `match.stats?.team_wickets` in
`MatchHistoryClient.tsx`, `stats.team_wickets` in the standalone page (both
already fetched for the existing result-strip display, so no new query in
either case).

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

## 6.5 Real-sync proof — Hub side (Phase 4) — confirmed 6 Sep 2026

The manual validation above proved the analytics-DB half of the pipeline
end-to-end for a genuinely new match. It deliberately did **not** touch
Hub's `scorecard_uploads`/`match_stats_cache` for that booking — the plan
was to let the twice-daily `backfill-scorecards` cron (see
`features/post-match-scorecard.md` §8) pick this booking up naturally,
once both the `spartans-python` FOW code (pushed to `main`, confirmed
live on Render as of 5 Sep 2026) and this Hub-side sync code were in
place. Confirmed the next day: the scheduled run hadn't fired yet by the
time this was checked (GitHub Actions' scheduler delay — see
`limitations.md`), so the workflow was triggered manually
(`workflow_dispatch`) instead of waiting. Since the booking's own
`scorecard_uploads` row didn't exist yet, the cron had no way to know
analytics-DB rows already existed for it — it ran its normal first-time
path (re-fetched the PDF from CricHeroes, re-parsed, upserted) and simply
overwrote the manually-inserted rows with identical freshly-parsed data,
then completed the part left undone here: flipping
`scorecard_uploads.status` to `synced` and populating
`match_stats_cache.fall_of_wickets` for real (7 rows, matching the
manually-verified count exactly). This was the first live,
fully-automated proof of Phases 1–4 together, and — since `team_total`/
`team_overs` for this chase-completed match are 87/17.3 — also the first
live proof of §4.2's unbroken-partnership logic: the resulting chart shows
8 partnerships, the 8th an unbroken `2*` stand rather than a Fall of
Wickets entry. A second booking (`22730364`, an older match re-synced the
same run) confirmed the same logic independently: its unbroken closing
stand's two players matched exactly the two batters `batting_stats`
itself marks `not_out` for that match.

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
over from the raw FOW convention is the over the partnership *ended*
(`overTo`), printed next to the runs value — but see the ball-count fix
below for how it's actually rendered. "Score" (cumulative team total) was
considered and deliberately dropped — it's recoverable by summing the
runs values top-to-bottom and is shown elsewhere on the card already; the
interesting fact here is stand size, not running total.

**Shown as a ball *span*, not `X.Y ov` (fixed shortly after the previous UI
pass, September 2026).** Two separate fixes, made together once real data
was on screen:
- CricHeroes' own overs.balls notation (`9.2` = 9 overs and 2 balls, never
  a true decimal) reads fine on a full scorecard but was awkward compressed
  onto a narrow partnership bar next to a runs value. `oversToBalls()` (a
  local helper, same file) converts an over value into a plain ball
  count — no unit suffix in the UI (a bare number reads as balls by
  default in this context; the label was judged to only add clutter).
  Parses the value as a **string**, not float subtraction
  (`over - Math.floor(over)`): `over` can arrive from Supabase as a
  numeric-typed string, and subtracting the whole part in floating point
  reintroduces exactly the precision error this is meant to avoid
  (`9.2 - 9` → `0.19999999999999982` in JS, not `0.2`).
- **The first cut converted `overTo` alone** — the cumulative ball count
  since the start of the innings (10, 64, 74, 77, …), which only ever
  increases row over row. That's the wrong number next to a `runs` value
  that's already partnership-specific, not cumulative — a reader could
  reasonably read "61 (64)" as "61 runs off 64 balls," which isn't what
  that partnership actually took. Fixed to
  `oversToBalls(overTo) - oversToBalls(overFrom)` — the ball *span* of
  that one partnership specifically, consistent with `runs` right next to
  it. Verified against real data (`22730364`'s five Fall of Wickets entries
  plus its unbroken closing stand): the six spans sum to exactly 180 balls
  (30 overs × 6), confirming they partition the whole innings with no gap
  or overlap.

Each bar shows: wicket number (left label), both partnership players
overlaid on the bar (both render as `PlayerNameLink`s — the larger name is
not distinguished), and runs + ball span **outside the bar**, in a
fixed-width (`w-20`) right-aligned column — not overlaid on the bar itself
(fixed shortly after the ball-span change, September 2026: a short bar
from a quick dismissal was squeezing that text down to almost nothing,
and a fixed external column keeps every row's value right-aligned to the
same edge regardless of bar length). An unbroken partnership (§4.2) gets
the standard cricket `*` suffix on its runs value (`87*`), matching the
not-out convention already used on the Batting table above it. Hidden
entirely (not shown empty) when `computePartnerships()` returns `[]` or
`null` — same "hidden, not empty" convention as the Fielding table.

**Player-name layout inside the bar — split-justified, tried and reverted
(September 2026).** Briefly tried splitting the label into three
independent flex children — first player left-aligned, `&` centered
between them (via both name spans sharing equal `flex-1` weight), second
player right-aligned — instead of one right-aligned block. Reverted the
same day: with a short first name (e.g. "Kushal", "Loki"), equal `flex-1`
sizing still stretched that name's own column edge-to-edge toward the
center, leaving a wide dead gap between the name and `&` — the opposite
of tighter. Back to the single right-aligned `Name1 & Name2` span, which
naturally leaves any leftover space on the left rather than stretching
individual names apart to fill it.

**First name only, no `(out)` marker (fixed shortly after the first real
production render, September 2026).** The initial ship rendered each
player's full name plus a trailing `(out)` tag on whichever one was
dismissed — against real data this immediately proved too cramped: a name
like "Shivashankara GS" paired with a second name in the same bar,
sometimes with `(out)` added on top, routinely truncated to
`"Shivashankara G…"` with nothing else fitting. Fixed two ways:
- **`firstName()`** (a local one-line helper, same convention
  `PerformerShareButton.tsx` already uses for its WhatsApp greeting — "Hi
  Kushal," not "Hi Kushal Vidya,") shortens only the visible label passed
  to `PlayerNameLink`'s `name` prop. The link target (`playerId`) and the
  `findCricHeroesUrl()` lookup both still use the full `player_name` —
  identity resolution is completely unaffected, only the on-screen text
  shortens.
- **The `(out)` marker was dropped entirely**, for both players in every
  row — not just shortened. It was judged redundant rather than trimmed
  for space: the very next row down already carries the survivor forward
  (e.g. row 2 ends "… & Siva", row 3 begins "Sudarshan Bhat & Keshav" —
  Siva's absence from row 3 already tells the reader Siva was the one
  dismissed), so which name in a row was the one given out is already
  readable from the sequence itself, without a per-row label.

**`teamTotal`/`teamOvers` props (added September 2026)** — `ScorecardTables`
now accepts these two (both `number | null | undefined`, from
`match_stats_cache.team_total`/`team_overs`, already fetched for the
result-strip display elsewhere on the card) and builds the `FinalScore`
`computePartnerships()` needs from them when both are present; omitted
(both consumers still pass them, see below) it degrades to the pre-§4.2
behaviour with no unbroken closing partnership ever shown.

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
  `FullScorecard` type and passed down as a new prop. Now also passes
  `teamTotal={match.stats?.team_total}` / `teamOvers={match.stats?.team_overs}`
  (§4.2) — both fields were already present on `match.stats`, fetched for
  the existing result-strip display; no new query.
- The standalone `/matches/history/[bookingId]/page.tsx` — its
  server-side `match_stats_cache` select was deliberately left without
  `fall_of_wickets` in Phase 4 (nothing rendered it yet); added here now
  that something does. Now also passes `teamTotal={stats.team_total}` /
  `teamOvers={stats.team_overs}` — same already-fetched fields, no new
  query.

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
| `src/lib/partnerships.ts` | `computePartnerships()` — the crease-pointer algorithm (§4), pure function; optional `finalScore` param emits an unbroken closing partnership (§4.2), gated on FOW completeness via `finalScore.wickets` (§4.3) |
| `src/components/matches/ScorecardTables.tsx` | Partnerships bar chart (§6.6) — between Batting and Bowling, same bar treatment as `BattingPositionLeaders.tsx`, first-name-only labels via a local `firstName()` helper, `*` suffix on an unbroken partnership's runs value, no `(out)` marker, `oversToBalls()` renders `overTo` as a ball count; `teamTotal`/`teamOvers`/`teamWickets` props feed `finalScore` |
| `src/components/matches/MatchHistoryClient.tsx` | `FullScorecard` type + prop threading for `fall_of_wickets`; passes `teamTotal`/`teamOvers`/`teamWickets` from `match.stats` |
| `src/app/matches/history/[bookingId]/page.tsx` | `match_stats_cache` select widened to include `fall_of_wickets`; passed down to `ScorecardTables` along with `teamTotal`/`teamOvers`/`teamWickets` |

---

## 9. Pending

| Item | Notes |
|---|---|
| First real end-to-end cron proof | See §6.5 — the manual Phase 3 validation and this feature's own Phase 4/6 code are both in place, but no match has yet gone through the automated `backfill-scorecards` cron with the FOW-aware pipeline live end-to-end. Worth a follow-up note here once that's been observed. |
| Highest partnership by runs/wickets on the Honour Board (`/leaderboard`) | ✅ Shipped September 2026 as Detailed → Partnerships — see §10. |
| 3 synced matches drop out of every partnership view | Found while validating §10 against live data (49 matches): `computePartnerships()`'s integrity guard returns `null` for matches where a Fall of Wickets name doesn't match either batter at the crease ("Dharmarajan S" vs "DS Sakketha"; "G-One"; "Kushal Vidya"). Likely a scorecard-name mismatch between the FOW text and the batting card, or a wrong batting_order. Those matches show no per-match chart either — a pre-existing data issue, not introduced by §10. **"G-One" (`match_id 18985509`) diagnosed and fixed September 2026** — see §3's "a re-parse split one batter into two duplicate rows" incident; it was a duplicate `(match_id, player_name)` row pair from a re-parse, not a name mismatch. "Dharmarajan S" vs "DS Sakketha" and "Kushal Vidya" are still open — worth checking whether either is the same duplicate-row shape or a genuine unresolved alias. |
| Other historical matches possibly affected by the score-hyphen/wicket-number line-wrap bug (§3's incident) | Only match `14114256` has been confirmed and manually corrected so far — the fix to `FALL_OF_WICKET_PATTERN` prevents this specific sub-case going forward (and on any future re-sync), but no audit has been run across the rest of the historical backlog for a `fall_of_wickets` row count that falls short of `team_wickets` by exactly one, which is the fingerprint this bug leaves behind. Worth a targeted query if this is suspected elsewhere. |

---

## 10. Club-wide partnership leaders — `/leaderboard` → Detailed → Partnerships (added September 2026)

A fifth Detailed sub-tab, after Field. Three bar charts, same bar treatment
as §6.6 (both names inside the bar, runs + balls in a fixed column at the
end of the bar, `*` for unbroken):

1. **Top 10 partnerships** for any wicket — ranked runs desc, fewer balls
   breaking a tie, then the most recent match. Caption: wicket, opponent,
   date, linking to `/matches/history/[bookingId]`.
2. **Highest partnership for each wicket** (1st–10th) — the #1 of chart 1's
   ordering for each wicket number. A wicket with no data is simply absent.
3. **Top 5 batting pairs** by aggregate runs across every innings in the
   filter, whichever wicket — pair identity is order-independent (A & B =
   B & A). Tie on runs → fewer innings first. Caption: innings count and
   best single stand.

**Full names, not first names** (unlike §6.6) — club-wide, two players
sharing a first name are ambiguous in a way they never are within one
scorecard.

### Filters — Tournament and Ground reused unchanged

The tab uses the same `getScopedMatchIds()` scope as every other Detailed
tab, so the existing **Year / Tournament / Ground / Format** controls apply
with no new code — "best stands in the BlendIn Challengers" or "at
Macushala" work as-is. Practice games are excluded (same default). Not
applied here: Defending/Chasing (still MVP-only) and the Pitch Type tabs
(Bat/Bowl only) — both easy follow-ons if wanted.

### Data — `getPartnershipLeaders()` (`src/lib/playerStats.ts`)

Reads `fall_of_wickets` + `match_stats` (team total/overs/wickets) for the
scoped matches from the analytics DB, then `batting_stats` only for the
matches that can yield anything (FOW rows present, or a genuine 0-wicket
innings). Analytics DB rather than `match_stats_cache` because
`batting_stats.player_id` there is always the live reconciled identity (a
cached copy can lag a reconciliation — `post-match-scorecard.md` §15). Every
multi-row read uses `fetchAllRows()` (`leaderboard.md` §8.1). Each match
goes through the same `computePartnerships()` as the per-match chart — the
§4.3 completeness guard and the integrity `null` both apply, so a match with
no synced FOW contributes nothing.

Unreconciled batters are **kept**, not dropped (unlike `getLeaderboard()`):
dropping one would erase their partner's stand too. They show under their
scorecard name, unlinked, and pair up by normalised name.

Ranking lives in the pure, client-safe `aggregatePartnershipLeaders()`
(`src/lib/partnershipLeaders.ts`, unit-tested in
`partnershipLeaders.test.ts`). Validated against the live analytics DB (49
matches with FOW) — top stand 219* for the 1st wicket; 3 matches dropped by
the integrity guard (see §9).

`page.tsx` skips the `getLeaderboard()` fetch on this tab (nothing uses it).
Glossary: `buildPartnershipsGlossary()` (`leaderboardGlossary.ts`).

### File map

| File | Role |
|---|---|
| `src/lib/partnershipLeaders.ts` (+ `.test.ts`) | `aggregatePartnershipLeaders()` — top N, best per wicket, top pairs |
| `src/lib/playerStats.ts` | `getPartnershipLeaders()` — scoped analytics fetch + name resolution |
| `src/components/leaderboard/PartnershipLeaders.tsx` | `PartnershipLeadersView` — the three bar charts |
| `src/components/leaderboard/LeaderboardFilters.tsx` | `DetailedCategory` (adds `'partnerships'`), fifth Detailed pill |
| `src/app/leaderboard/page.tsx` | `category=partnerships` branch |
| `src/lib/leaderboardGlossary.ts` | `buildPartnershipsGlossary()` |
| `src/types/index.ts` | `PartnershipRecord`, `PartnershipPairAggregate`, `PartnershipLeaders`, `PartnershipLeaderPlayer` |

---

*Maintained by: Spartans CC BLR*
