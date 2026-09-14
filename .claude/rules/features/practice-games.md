# Practice Games — Per-Booking Flag & New-Booking Defaults

**Spartans Hub · Added: September 2026**

---

## 1. Overview

Two related admin-booking-form changes, shipped together:

1. **`stage_type` now defaults to League on a new booking**, instead of
   defaulting to "Not set." The vast majority of games are league fixtures
   — see `features/team-stats.md` §4 — so a new booking no longer needs an
   explicit choice to get the common case right. "Not set" stays available
   in the toggle for the rare case an admin genuinely wants to leave it
   unclassified at creation time; the Team Record split already treats
   "Not set" as league anyway (`stage_type IS NULL` → league), so this is
   purely a friendlier default, not a behaviour change to what "Not set"
   means once saved.
2. **`bookings.is_practice`** — a new per-booking practice-game flag,
   **additive** to the existing `tournaments.is_practice` flag (the
   "Practice games" umbrella tournament — see `features/leaderboard.md`
   §10). A single game under *any* real tournament can now be marked
   practice individually, without needing to be rebooked under that
   umbrella tournament.

---

## 2. Why additive, not a replacement

Before this, "is this a real match" was decided entirely at the tournament
level — `tournaments.is_practice`, checked in ~10 different places across
stats, fees, milestones, and nudges (see §4's file map). That's the right
model for the club's actual practice sessions (which never belong to a real
tournament), but it had no answer for a one-off scrimmage or warm-up game
played *under* a real tournament — the admin either had to miscategorise it
as a genuine tournament fixture (polluting that tournament's real record)
or rebook it under "Practice games" (losing its real tournament
association entirely).

`bookings.is_practice` closes that gap without touching the existing
tournament-level model at all. **A match counts as practice when EITHER
its own booking-level flag or its tournament's flag is true** —
`isPracticeMatch(bookingIsPractice, tournamentIsPractice)` in
`src/types/index.ts` is the one-line shared helper (used directly where
convenient; several call sites instead inline the equivalent
`!!booking.is_practice || !!tournament?.is_practice`, since they were
already assembling the OR from two already-fetched values and importing
the helper would have meant a new import for no real gain). Nothing about
the "Practice games" umbrella tournament changed — every existing
practice-tournament booking behaves exactly as it always has.

---

## 3. Database — migration `078_bookings_is_practice.sql`

```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;
```

`NOT NULL DEFAULT false` — every existing booking is unaffected until an
admin explicitly ticks the new checkbox on a booking. No RLS change needed
(this column is read/written through the same service-role-only path every
other `bookings` column already uses).

---

## 4. Where it's wired in (every call site that used to read only
`tournaments.is_practice`)

| File | What changed |
|---|---|
| `src/lib/playerStats.ts` — `getScopedMatchIds()` | The single chokepoint behind `getLeaderboard()`, `getPerformances()`, `getPlayerCareerStats()`/`getPlayerSeasonStats()`/`getPlayerMatchHistory()`, `getLeaderboardsByTournament()`, and `getTopScorersByBattingPosition()`. `baseQuery()` now also selects `is_practice`; `withoutPractice()` filters out a booking whose own flag is set, gated by the same `excludePractice` predicate (an explicit `tournamentId` filter or the `includePractice` opt-in reveals a booking-flagged practice game exactly the same way it already reveals a practice-tournament one). |
| `src/lib/teamStats.ts` — `getTeamMatches()` | `TeamMatch.isPractice` is now `!!tournament?.is_practice \|\| !!b.is_practice`. Feeds Team Record's practice-game exclusion (`teamStatsCore.ts`'s `applyFilters()`) with zero changes needed there — it already just reads `m.isPractice`. |
| `src/lib/matchStatsSync.ts` — `syncMatchStatsForBooking()` | The `isPractice` local (fed into `detectAndLogMatchPerformances()` and `chargeMembershipFeeIfDue()`) now also selects and ORs in `bookings.is_practice`, not just the joined tournament's flag. |
| `src/lib/monthlyRecognition.ts` — `getMonthSyncStatus()` | The "real fixtures this month" filter now excludes a booking with its own `is_practice` set, alongside the existing tournament-level exclusion. |
| `src/lib/nudgeLeaderboard.ts` — `attachGroundTournamentInfo()` | Resolves `tournament_is_practice` (the field name is unchanged to avoid a wider rename, but it now carries the combined booking-OR-tournament signal) from both the booking's own `is_practice` and its tournament's. Both `getBookingLeaders()`'s practice-tournament exclusion (§3a of `features/availability-nudge.md`) and the field's other reader in `availabilityNudge.ts` inherit this automatically, since both already consume `tournament_is_practice` as populated by this function. |
| `src/app/tournament-planner/page.tsx` | The informal-format/practice filter feeding `normalizedBookings` now also excludes a booking with its own `is_practice` set. `emptyTournaments` (zero-booking tournament display) is unaffected — that's a tournament-level concept with no booking to check yet. |
| `src/app/captains-corner/page.tsx` + `src/components/captains/CaptainsCornerGrid.tsx` | The Form-guidance-suppression flag ("practice games go with whoever's available") now uses `isPracticeMatch(booking.is_practice, booking.tournament?.is_practice)`. |

**Deliberately unaffected** (same as `tournaments.is_practice` already
was): `getPlayerBookingContextStats()` and `getRecentForm()` (Captains'
Corner's own "Form" panel / recent-form strip) intentionally still include
practice matches for their ground-based rationale — see
`features/leaderboard.md` §10's "Deliberately unaffected" note. Neither of
these ever read `tournaments.is_practice` for exclusion in the first
place, so there was nothing to make additive here.

---

## 5. Admin UI — `PracticeToggle`

`src/components/admin/PracticeToggle.tsx` — a plain checkbox ("🎯 Practice
Game"), styled to match `StageTypeToggle` and rendered directly below it in
the "Match Details" section on both `/admin/bookings/new` and
`/admin/bookings/[id]`. Defaults unchecked (`false`) on a new booking —
unlike the `stage_type` default change (§1), there's no "this is what most
bookings should be" case for practice, so no default flip was warranted
here.

- **New booking** (`src/app/admin/bookings/new/page.tsx`) — `isPractice`
  state, sent as `is_practice` in the `POST /api/bookings` body; reset to
  `false` alongside every other Match Details field when the admin toggles
  between Confirm Booking / Reserve Slot mode.
- **Edit booking** (`src/app/admin/bookings/[id]/page.tsx`) — hydrated from
  the loaded booking's own `is_practice` on page load, sent as `is_practice`
  in every `PATCH /api/bookings/[id]` save (`handleSave()`), disabled
  alongside every other editable field while `feesMode` (reached via the
  "Apply Match Fee" dashboard shortcut, where the booking itself is
  read-only).

---

## 6. API

| Route | Method | Change |
|---|---|---|
| `/api/bookings` | POST | Accepts `is_practice` (validated `typeof === 'boolean'` when present, 400 otherwise); inserted as `is_practice ?? false`. |
| `/api/bookings/[id]` | PATCH | Accepts `is_practice` the same way (validated when the key is present in the request); passed straight through in the existing `{ ...safeUpdates }` spread into `.update()` — no other change needed, since this route already applies whatever fields the client sends. |

Both admin-only, same auth as every other field on these routes — no new
access surface.

---

## 7. Security (vibe-security)

| Check | Status |
|---|---|
| Both write paths (`POST`/`PATCH /api/bookings*`) remain admin-only, unchanged | ✅ |
| `is_practice` type-validated server-side (`typeof === 'boolean'`) before insert/update, same posture as `stage_type`'s existing enum check | ✅ |
| No RLS change — reads/writes go through the same service-role-only path every other `bookings` column already uses | ✅ |
| Never widens what a non-admin can see or do — this flag only *narrows* which matches count in stats/fee/nudge aggregates, and only for admin-set bookings | ✅ |

---

## 8. File Map

| File | Role |
|---|---|
| `supabase/migrations/078_bookings_is_practice.sql` | The column |
| `src/types/index.ts` | `Booking.is_practice`, `isPracticeMatch()` helper |
| `src/components/admin/PracticeToggle.tsx` | The checkbox |
| `src/app/admin/bookings/new/page.tsx` | New-booking form — `isPractice` state, `stage_type` default flipped to `'league'` (§1) |
| `src/app/admin/bookings/[id]/page.tsx` | Edit-booking form — `isPractice` state, hydration, save |
| `src/app/api/bookings/route.ts` | POST — accepts/validates/inserts `is_practice` |
| `src/app/api/bookings/[id]/route.ts` | PATCH — accepts/validates `is_practice` |
| `src/lib/playerStats.ts` | `getScopedMatchIds()` — the shared chokepoint (§4) |
| `src/lib/teamStats.ts` | `getTeamMatches()` — `TeamMatch.isPractice` |
| `src/lib/matchStatsSync.ts` | `syncMatchStatsForBooking()` — feeds milestone/performance detection and the quarterly membership fee |
| `src/lib/monthlyRecognition.ts` | `getMonthSyncStatus()` |
| `src/lib/nudgeLeaderboard.ts` | `attachGroundTournamentInfo()` — feeds the availability-nudge `leaderboard_leader` theme |
| `src/app/tournament-planner/page.tsx` | Booking filter feeding `normalizedBookings` |
| `src/app/captains-corner/page.tsx` + `src/components/captains/CaptainsCornerGrid.tsx` | Form-guidance suppression |

---

## 9. Explicitly Out of Scope

- No bulk "mark all games under this tournament as practice" action — this
  is a per-booking flag, set one game at a time.
- No display badge on `/fixtures`, `/matches/history`, or the announcement
  text calling out a booking-level practice flag — same as the tournament-
  level flag, this only ever affects which aggregates a match counts
  toward, not how the match itself is presented to players. (Team Record's
  own split table already shows a "practice" tag per row when
  `isPractice` is true — `TeamSplitTable.tsx` — which now reflects the
  combined signal for free.)
- No migration of existing practice-tournament bookings to also carry
  `bookings.is_practice = true` — unnecessary, since the OR means they're
  already correctly excluded via the tournament flag alone.

---

*Maintained by: Spartans CC BLR*
