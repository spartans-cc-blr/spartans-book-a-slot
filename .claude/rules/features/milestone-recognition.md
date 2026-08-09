# Milestone Recognition — Feature Summary

**Spartans Hub · Added: August 2026**

---

## 1. Overview

A club-wide recognition modal that celebrates two different kinds of
achievement, detected the moment a match scorecard syncs into the Hub:

- **Season milestones** — a player's runs / wickets / fielding-dismissals
  *total for the calendar year* crossing a fixed threshold.
- **Single-match performance highlights** (added August 2026) — a standout
  performance *in the one match that just synced*: a century or
  half-century, a five- or three-wicket haul, or five-plus fielding
  dismissals.

Both are a broadcast, not a targeted notification: every signed-in,
non-expelled player sees the modal on their next page load, regardless of
whether they achieved anything, uploaded the scorecard, or had nothing to
do with either — "recognition from the club to all players," per the
product decision this was built against.

**Season milestone thresholds:**

| Metric | Values |
|---|---|
| Runs | 500 / 750 / 1000 |
| Wickets | 50 / 75 / 100 |
| Fielding dismissals (catches + run outs + stumpings) | 50 / 75 / 100 |

All three reset every calendar year — a player's total is their season
total (see `features/leaderboard.md` for the same year-scoping convention
used by the leaderboard's milestone cards), not a career total.

**Single-match performance thresholds:**

| Performance | Band |
|---|---|
| Runs in an innings | 50–99 → half-century, 100+ → century |
| Wickets in a spell | 3–4 → three-wicket haul, 5+ → five-wicket haul |
| Fielding dismissals in a match (catches + run outs + stumpings) | 5+ |

Runs and wickets bands are mutually exclusive per innings — the higher band
wins (a 120-run innings is credited a century, not also a half-century),
mirroring `getPerformances()`'s centuries/halfCenturies split in
`src/lib/playerStats.ts`. Unlike season milestones, these are **not
deduped per year** — a player can be recognised for the same
performance_type (e.g. two separate centuries) across different matches in
one season; each match's performance is its own achievement.

---

## 2. Why detection lives inside `syncMatchStatsForBooking()`

Scorecards reach the Hub via two independent paths (see
`features/post-match-scorecard.md`): a human clicking Upload or "Sync
Stats" (captain/VC/wrangler/admin), and an unattended twice-daily cron that
fetches and syncs scorecards directly from CricHeroes with no user present
at all. In practice most scorecards sync via the automated path, not manual
clicks.

Both paths funnel through the same `syncMatchStatsForBooking()`
(`src/lib/matchStatsSync.ts`) — the single point where analytics-DB stats
actually land in Hub-consumable form (`match_stats_cache`). Hooking
milestone detection there, rather than into either caller separately,
means both paths are covered automatically with no duplicated logic — this
was a deliberate design choice, not an oversight, after confirming (see
`features/post-match-scorecard.md` §8) that the cron path is the dominant
one in real usage.

Detection is **best-effort and non-blocking**: any error is caught and
logged, never thrown — a bug in milestone detection must never fail the
scorecard sync it's attached to (same posture as the audit-log writes
elsewhere in this app, e.g. `availability_audit`).

---

## 3. Detection logic — `src/lib/milestones.ts`

`detectAndLogMilestones(bookingId, year, playerIds)`:

1. For each player who appeared in the just-synced match (any resolved
   `player_id` across `batting`/`bowling`/`fielding`/`team_list` — not
   limited to the `squad` table, since not every booking has squad rows;
   see `features/post-match-scorecard.md` §15's known gap on that),
   re-derives their full season total via the existing
   `getPlayerSeasonStats(playerId, year)` (`src/lib/playerStats.ts`) — the
   same function the leaderboard and personal stats page already use.
   Practice games are excluded from this total by default, same as
   everywhere else that function is used (`features/leaderboard.md` §10).
2. For every threshold at or below the player's current total, upserts a
   row into `milestone_achievements` with
   `ON CONFLICT (player_id, milestone_type, milestone_value, year) DO NOTHING`.

**Deliberately re-derives the total rather than diffing before/after this
one match.** Simpler, and correct even the very first time detection runs
against a player already well past a threshold from earlier matches this
year — every not-yet-logged threshold is recorded at once, not just
whichever one this particular sync happened to cross. A re-sync
(reconciliation, a stale-cache fix — see `features/post-match-scorecard.md`
§15's incident writeups on stale `match_stats_cache`) safely re-derives the
same total and inserts nothing new, since the thresholds already crossed
are already logged.

`year` is the calendar year of the match's own `game_date`, not "today" —
correct even when an old match is synced or re-synced long after the fact.

### Single-match performances — `detectAndLogMatchPerformances(bookingId, batting, bowling, fielding)`

Reads directly off the batting/bowling/fielding rows already fetched for
**this one match** inside `syncMatchStatsForBooking()` — no extra round
trip, no season aggregation, since "did this match qualify" is fully
answered by that match's own rows:

- Batting: rows with `batted = true`; `runs >= 100` → `century`, else
  `runs >= 50` → `half_century`.
- Bowling: rows with `did_bowl = true`; `wickets >= 5` → `five_wicket_haul`,
  else `wickets >= 3` → `three_wicket_haul`.
- Fielding: `catches + caught_behind + run_outs + stumpings >= 5` →
  `five_dismissals`.

Upserts into `match_performance_achievements` with
`ON CONFLICT (player_id, booking_id, performance_type) DO NOTHING` — a
re-sync of the same match can't double-log the same performance.

**Skipped entirely for practice-tournament bookings** (`tournaments.is_practice`
— see `features/leaderboard.md` §10), same "real stats only" posture as
every other performance/stats surface in this app. Season milestones don't
need this same explicit check — they already inherit the exclusion via
`getPlayerSeasonStats()`'s own default scoping.

---

## 4. Database — `supabase/migrations/059_milestone_achievements.sql` and `060_match_performance_achievements.sql`

### `milestone_achievements`

| Column | Notes |
|---|---|
| `player_id` | FK → players |
| `booking_id` | FK → bookings, `ON DELETE SET NULL` — the achievement survives if the triggering booking is later deleted |
| `milestone_type` | `runs` \| `wickets` \| `dismissals` |
| `milestone_value` | the threshold crossed (500, 50, etc.) |
| `year` | calendar year the total applies to |
| `achieved_at` | when detection first logged it — not necessarily when the underlying match was played |

**`UNIQUE(player_id, milestone_type, milestone_value, year)`** is the
idempotency guard — a re-sync can never double-log an already-recorded
milestone. RLS enabled, no anon/authenticated policies — service role
only, same blanket-deny pattern as every other table in this app.

### `players.milestones_seen_at`

New nullable-in-spirit-but-`NOT NULL DEFAULT now()` timestamp column — the
per-player "seen" cursor for the broadcast modal (see §5). Defaults to
`now()` at migration time so this can never retroactively flood every
existing player with a backlog if it ever runs after achievements already
exist. Shared by both achievement types below — one cursor, one modal.

### `match_performance_achievements`

| Column | Notes |
|---|---|
| `player_id` | FK → players |
| `booking_id` | FK → bookings, `ON DELETE SET NULL` |
| `performance_type` | `century` \| `half_century` \| `five_wicket_haul` \| `three_wicket_haul` \| `five_dismissals` |
| `value` | the exact runs/wickets/dismissals achieved, for display ("127 runs", not just "a century") |
| `achieved_at` | when detection first logged it |

**`UNIQUE(player_id, booking_id, performance_type)`** — deduped per match,
not per year (contrast with `milestone_achievements` above). RLS enabled,
no anon/authenticated policies — service role only.

---

## 5. Broadcast — API routes and the modal

**`GET /api/milestones/unseen`** — any signed-in, non-expelled member.
Merges two sources — `milestone_achievements` (season) and
`match_performance_achievements` (single-match) — returning every row from
either with `achieved_at` after this player's own `milestones_seen_at`
cursor, joined to the achiever's name/photo/CricHeroes URL and the
triggering booking's opponent/date, sorted together and capped at 20 rows
total. Rate-limited (`RATE_LIMITS.publicRead`, keyed by `player_id`).

**`POST /api/milestones/mark-seen`** — advances the signed-in player's own
`milestones_seen_at` to now, regardless of which achievement type(s) the
modal was showing (one shared cursor for both sources). `player_id` and
the timestamp are both always server-derived, never taken from the request
body — same "never trust the client" posture as every other player-scoped
write in this app (push subscribe, player-availability). Rate-limited
(`RATE_LIMITS.playerWrite`).

**`MilestoneCelebrationModal`** (`src/components/milestones/MilestoneCelebrationModal.tsx`)
— client component, mounted once inside `SiteNav` (rendered on every
authenticated page) rather than a specific page, so it fires regardless of
which page a player lands on first after signing in. On mount, if the
session is authenticated, fetches `/api/milestones/unseen`; if any rows
come back, opens a `Dialog` listing each achievement — season and
single-match rows rendered with their own icon/copy (a discriminated
`kind: 'season' | 'match'` union), player name CricHeroes-linked via
`PlayerNameLink` when resolvable, plus match context. Dismissing (the "Got
it" button, the ✕, Escape, or an overlay click — all routed through
`Dialog`'s existing `onClose`) calls `POST /api/milestones/mark-seen` and
closes.

**Match-kind rows are deliberately not framed as "milestones"** — a
100/50/5-wicket/3-wicket/5-dismissal performance is a standout on that one
day, not a threshold crossed over a season, so calling it a "milestone" the
same way as a 500-run season total misrepresents it. Each `kind: 'match'`
row instead carries its own **"🏅 Performer of the Match"** tag above the
description, plus a closing congratulatory line ("👏 Let's celebrate this
performance!"). `dialogTitle()` picks the dialog's own header to match what
it's actually showing: `🎉 Milestone Recognition` when every row is a
season milestone, `🏅 Performer of the Match` when every row is a
single-match performance, and a neutral `🎉 Club Recognition` when a batch
happens to mix both (e.g. a sync that both crosses a season total and
produces a fifty in the same match).

Each player sees each achievement exactly once, no matter when they next
open the Hub — including one detected by the unattended cron path, which
has no user present at detection time to show anything to.

---

## 6. Security (vibe-security)

| Check | Status |
|---|---|
| Detection runs entirely server-side, inside the existing sync pipeline — never client-triggered | ✅ |
| `milestone_achievements` / `match_performance_achievements` RLS enabled, no anon/authenticated policies — service role only | ✅ |
| `GET /unseen` requires a signed-in, non-expelled session; broadcasts achievement data (not sensitive) but never wallet/personal fields | ✅ |
| `POST /mark-seen` — `player_id` and timestamp always server-derived from session, never the request body | ✅ |
| Both new routes rate-limited | ✅ |
| A milestone-detection failure can never fail the scorecard sync it's attached to | ✅ |

---

## 7. File Map

| File | Role |
|---|---|
| `supabase/migrations/059_milestone_achievements.sql` | `milestone_achievements` table + `players.milestones_seen_at` |
| `supabase/migrations/060_match_performance_achievements.sql` | `match_performance_achievements` table |
| `src/lib/milestones.ts` | `MILESTONE_THRESHOLDS`, `detectAndLogMilestones()` (season) + `detectAndLogMatchPerformances()` (single-match) |
| `src/lib/matchStatsSync.ts` | Calls both detection functions (in parallel) as the last step of `syncMatchStatsForBooking()`; skips match-performance detection for practice-tournament bookings |
| `src/app/api/milestones/unseen/route.ts` | GET — broadcast feed, merges both achievement tables |
| `src/app/api/milestones/mark-seen/route.ts` | POST — advances the player's own seen-cursor |
| `src/components/milestones/MilestoneCelebrationModal.tsx` | The modal itself |
| `src/components/ui/SiteNav.tsx` | Mounts the modal once, gated on `isLoggedIn && !isExpelled` |

---

## 8. Baseline Backfill (applied 2026-08-07)

Migration `059_milestone_achievements.sql` was applied to the live project
via Supabase MCP the same day this feature shipped. Since detection only
ever runs when a scorecard is (re-)synced, and most of 2026's matches were
already synced before this feature existed, going live with an empty table
would have meant the *next* sync of any already-past-threshold player's
match — even a routine reconciliation re-sync — surfacing their season
total as a brand-new "just crossed" event to the whole club, months late.

To avoid that, a one-time baseline pass queried the analytics DB directly
(mirroring `getPlayerSeasonStats()`'s own aggregation: `batted`/`did_bowl`
row filters, confirmed non-practice-tournament bookings only, year 2026)
and inserted a row for every threshold already crossed as of 2026-08-07,
**with `achieved_at` set to the Unix epoch instead of `now()`** — since
every player's `milestones_seen_at` cursor defaults to `now()` (always
later than epoch, including for any player who joins after this point,
because that's the column's own `DEFAULT`), none of these baseline rows
can ever appear as "unseen." Only a milestone crossed by a sync that
happens *after* this point will ever trigger the modal.

17 rows were seeded this way:

| Player | Runs | Wickets |
|---|---|---|
| Siva Kumar | 500, 750, 1000 | |
| Harsha Konka | 500, 750, 1000 | |
| Saurav Kalsoor | 500, 750 | |
| Shabarinath Iyer | 500, 750 | |
| Rahul Priyadarshi | 500 | |
| DS Sakketha | 500 | 50 |
| Gunasagar | 500 | |
| Anurag Tiwari | 500 | |
| Udaya Shankar | 500 | |
| Ramesh Shanmugamoorthy | | 50 |

No player had crossed 50 fielding dismissals for 2026 as of this date, so
no dismissal rows were seeded. This was a one-off data fix run directly
against the live DB, not a checked-in migration — schema-only changes stay
in `supabase/migrations/`, consistent with this app's existing convention
of one-off backfills (e.g. `features/post-match-scorecard.md` §15) being
documented here rather than encoded as a script.

---

## 8.1 Baseline Backfill — Match Performances (applied 2026-08-08)

Same reasoning as §8, applied to `match_performance_achievements` when
single-match highlights shipped a day later: without a backfill, the next
reconciliation re-sync of any already-synced historical match containing a
century/fifty/wicket-haul would surface it as a brand-new celebration,
months late. Unlike §8 (year-scoped, so only 2026 bookings needed
checking), this backfill isn't year-scoped — a century is a century
regardless of which season it was scored in — so **every** confirmed,
non-practice, already-`match_id`-tagged booking across the Hub's full
history was checked (113 match_ids), not just this year's.

Queried the analytics DB directly for every `(match_id, player_id)` pair
crossing a band (mirroring `detectAndLogMatchPerformances()`'s own
`batted`/`did_bowl` filters and mutually-exclusive banding), resolved each
`match_id` to its confirmed Hub `booking_id` (careful to exclude a
cancelled/rescheduled-away booking sharing the same `match_id` — the same
`status = 'confirmed'` guard `getScopedMatchIds()` and `getPerformances()`
already document needing, and a real instance of it was hit here: match
`22868730` had both a `cancelled` and a `confirmed` booking row sharing one
`match_id`), and inserted **135 rows** with `achieved_at` pinned to the
Unix epoch — same technique as §8, confirmed against every player's
`milestones_seen_at` cursor (all still `> epoch`) before and after.

Breakdown: 71 half-centuries, 53 three-wicket hauls, 6 five-wicket hauls, 5
centuries. Zero five-dismissal matches — no fielder has ever recorded 5+
dismissals in a single match in the Hub's synced history to date.

---

## 9. Explicitly Out of Scope

- No push notification — the club's explicit choice was a modal shown on
  next page load, not an async push (unlike squad announcements — see
  `features/push-notifications.md`).
- No admin UI to review or manually award a milestone — purely automatic,
  derived from synced scorecard stats.
- No milestone for a metric other than runs/wickets/dismissals (e.g. no
  "matches played" or MVP-points milestone) — not requested.
- No re-opening of an already-dismissed achievement — once a player's
  `milestones_seen_at` cursor passes an achievement's `achieved_at`, it's
  gone for that player permanently (matches the "seen" framing; there's no
  history page for past recognitions today).

---

*Maintained by: Spartans CC BLR*
