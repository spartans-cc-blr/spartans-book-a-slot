# Milestone Recognition — Feature Summary

**Spartans Hub · Added: August 2026**

---

## 1. Overview

A club-wide recognition modal that celebrates a player crossing a fixed
runs / wickets / fielding-dismissals threshold for the current calendar
year, detected the moment a match scorecard syncs into the Hub. This is a
broadcast, not a targeted notification: every signed-in, non-expelled
player sees the modal on their next page load, regardless of whether they
achieved the milestone, uploaded the scorecard, or had nothing to do with
either — "recognition from the club to all players," per the product
decision this was built against.

**Thresholds:**

| Metric | Values |
|---|---|
| Runs | 500 / 750 / 1000 |
| Wickets | 50 / 75 / 100 |
| Fielding dismissals (catches + run outs + stumpings) | 50 / 75 / 100 |

All three reset every calendar year — a player's total is their season
total (see `features/leaderboard.md` for the same year-scoping convention
used by the leaderboard's milestone cards), not a career total.

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

---

## 4. Database — `supabase/migrations/059_milestone_achievements.sql`

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
exist.

---

## 5. Broadcast — API routes and the modal

**`GET /api/milestones/unseen`** — any signed-in, non-expelled member.
Returns every `milestone_achievements` row with `achieved_at` after this
player's own `milestones_seen_at` cursor, joined to the achiever's name/
photo/CricHeroes URL and the triggering booking's opponent/date, capped at
20 rows. Rate-limited (`RATE_LIMITS.publicRead`, keyed by `player_id`).

**`POST /api/milestones/mark-seen`** — advances the signed-in player's own
`milestones_seen_at` to now. `player_id` and the timestamp are both always
server-derived, never taken from the request body — same "never trust the
client" posture as every other player-scoped write in this app (push
subscribe, player-availability). Rate-limited
(`RATE_LIMITS.playerWrite`).

**`MilestoneCelebrationModal`** (`src/components/milestones/MilestoneCelebrationModal.tsx`)
— client component, mounted once inside `SiteNav` (rendered on every
authenticated page) rather than a specific page, so it fires regardless of
which page a player lands on first after signing in. On mount, if the
session is authenticated, fetches `/api/milestones/unseen`; if any rows
come back, opens a `Dialog` listing each achievement (icon + player name,
CricHeroes-linked via `PlayerNameLink` when resolvable + match context).
Dismissing (the "Got it" button, the ✕, Escape, or an overlay click — all
routed through `Dialog`'s existing `onClose`) calls
`POST /api/milestones/mark-seen` and closes.

Each player sees each achievement exactly once, no matter when they next
open the Hub — including one detected by the unattended cron path, which
has no user present at detection time to show anything to.

---

## 6. Security (vibe-security)

| Check | Status |
|---|---|
| Detection runs entirely server-side, inside the existing sync pipeline — never client-triggered | ✅ |
| `milestone_achievements` RLS enabled, no anon/authenticated policies — service role only | ✅ |
| `GET /unseen` requires a signed-in, non-expelled session; broadcasts achievement data (not sensitive) but never wallet/personal fields | ✅ |
| `POST /mark-seen` — `player_id` and timestamp always server-derived from session, never the request body | ✅ |
| Both new routes rate-limited | ✅ |
| A milestone-detection failure can never fail the scorecard sync it's attached to | ✅ |

---

## 7. File Map

| File | Role |
|---|---|
| `supabase/migrations/059_milestone_achievements.sql` | `milestone_achievements` table + `players.milestones_seen_at` |
| `src/lib/milestones.ts` | `MILESTONE_THRESHOLDS`, `detectAndLogMilestones()` |
| `src/lib/matchStatsSync.ts` | Calls `detectAndLogMilestones()` as the last step of `syncMatchStatsForBooking()` |
| `src/app/api/milestones/unseen/route.ts` | GET — broadcast feed for the modal |
| `src/app/api/milestones/mark-seen/route.ts` | POST — advances the player's own seen-cursor |
| `src/components/milestones/MilestoneCelebrationModal.tsx` | The modal itself |
| `src/components/ui/SiteNav.tsx` | Mounts the modal once, gated on `isLoggedIn && !isExpelled` |

---

## 8. Explicitly Out of Scope

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
