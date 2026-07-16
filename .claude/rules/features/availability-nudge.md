# Availability Nudge Notifications — Feature Summary

**Spartans Hub · Added: July 2026**

---

## 1. Overview

Personalised push reminders sent **Sunday 8:45pm through Wednesday 8:45pm IST**, nudging players to mark availability for `nextLockWeekend` — the Sat/Sun pair the upcoming Thursday 8am lock-availability cron will freeze. Each nudge is derived entirely from the individual player's own historical response pattern, never from how full or empty a slot looks, so it can't bias a player toward or away from any particular slot.

Also functions as a re-engagement channel: submitting any availability response already auto-reactivates an `inactive` player (existing behavior, see `player-availability.md`), so an inactive player receiving a nudge and responding is a genuine second front door back into the club, not just a stats feature.

**Design constraint driving every decision below:** no raw counts, no scarcity language ("filling fast," "only a few spots"), no comparison to other players' responses. Nudges are self-referential — a player's own history vs. their own current-week gap — and the explicit date is always named ("Sun 19 Jul, 7:15 AM") rather than "this weekend," to avoid confusion with a just-concluded match on Sunday evenings.

---

## 2. File Map

| File | Role |
|---|---|
| `src/app/api/cron/availability-nudge/route.ts` | Cron entry point — `CRON_SECRET` bearer auth, orchestrates the daily run, writes to `availability_nudge_log`, sends pushes |
| `src/lib/availabilityNudge.ts` | Core logic — `nextLockWeekend` date calc, historical frequency (`buildPlayerHistories`), priority-list theme selection (`pickNudgeCandidate`), copy generation (`buildNudgeCopy`, `buildDeadlineCopy`), weekly history lookups (`getThemesUsedThisWeek`, `getReferencedBookingIdsThisWeek`, batched as `getWeeklyNudgeHistoryForPlayers`) |
| `src/app/page.tsx` | Read-only rendering of the same day's nudge as a dashboard card, next to the existing Pending Availability count |
| `supabase/migrations/029_availability_nudge_log.sql` | `availability_nudge_log` table — idempotency guard (`UNIQUE(player_id, nudge_date)`) and per-day audit trail |
| `supabase/migrations/030_availability_nudge_log_delivery_status.sql` | Adds `status` (`pending`/`sent`/`failed`) and `error_message` — per-player delivery outcome, not just attempt |
| `vercel.json` | Cron schedule entry: `"15 15 * * 0-3"` (15:15 UTC = 20:45 IST, Sun–Wed) |
| `src/lib/webpush.ts` | Shared push-send utility, reused as-is (no changes for this feature) |

---

## 3. Theme Selection — Priority List (Fix 7)

> Sun/Mon/Tue no longer use a fixed day→theme mapping. The original design locked Sunday to `habitual`, Monday to `same_format_new_slot`, Tuesday to `tournament_eligibility` — confirmed via manual simulation against real player history, this went silent (no nudge at all) on any day where a player's gap didn't happen to match that specific day's condition. Two of four sample players went silent on 1–2 of the three weekday attempts. Replaced by a priority list tried fresh every day.

**Active players with ≥6 qualifying past responses** — `pickNudgeCandidate()` tries each theme below in order, skipping any theme already used on this player earlier in the current Sun–Wed cycle, and stops at the first one with a matching, unanswered `nextLockWeekend` booking:

| Priority | Theme | Condition |
|---|---|---|
| 1 | `habitual` | Booking matches their most-frequent historical `(day_of_week, slot_time)` pair |
| 2 | `same_format_new_slot` | Booking's format matches their most-frequent format *(see note below on naming)* |
| 3 | `tournament_eligibility` | Zero past responses logged for this booking's tournament |
| 4 | `gap_reminder` | Unconditional — matches any remaining gap booking |

`gap_reminder` is what guarantees a nudge every day an unresolved gap exists: it has no condition beyond "a gap exists," so the loop can only return nothing if every theme *including* `gap_reminder` has already been used on this player this week.

When a theme matches more than one gap booking (e.g. two bookings both satisfy `tournament_eligibility`), the pick prefers one not yet referenced by an earlier nudge this week — this spreads coverage across a player's gaps instead of repeatedly naming the same booking under different themes. It's a soft preference: falls back to a previously-referenced booking once every match has already been mentioned once.

**Inactive, or active with <6 responses** — unaffected by the priority list, on its own simpler track: first nudge of the week → `reactivation_1`; any subsequent day → `reactivation_2`. "First vs. subsequent" is derived from whether any theme has been used on this player this week yet, not from the day of week, so it works no matter which day their first nudge actually lands on.

**Wednesday** — unchanged from the above: `deadline` always overrides everything, unconditionally, and covers *every* remaining gap booking (not just one — see `buildDeadlineCopy()`), naming one date directly, both dates if two, or a deduplicated list if more. Carries forward the same booking referenced earlier in the week where possible, purely for the log row / push deep-link.

**Historical frequency** is derived from `availability` rows where `response IN ('Y', 'O', 'E')` — all three represent genuine willingness to play that specific slot/format/day; the weekend/day scope in O/E's definition constrains *how many* games get played, not whether the marked slot reflects a real preference. `L` (deliberate unavailability) and blank/no-response are excluded. Minimum sample size of 6 qualifying responses before a pattern counts as "their usual" — below that, the player is treated as no-history.

> **Naming note:** `same_format_new_slot` is functionally "same format, unfamiliar slot" — a separate, not-yet-built "discovery" theme (nudging a player to try a genuinely *different* format) is intentionally out of scope for this feature and should not reuse a conflicting theme name if/when it's added later (that theme should use `format_stretch`, which is deliberately left free).

---

## 4. Scope Guards

- Only `bookings.status = 'confirmed'` and `availability_locked = false` are considered
- Only `players.status IN ('active', 'inactive')` — `expelled` players are excluded
- A player is skipped entirely for a given booking if they already have **any** response (`Y`/`O`/`E`/`L`) against it — `L` counts as a complete answer, not a gap
- Max one notification per player per day, enforced by `UNIQUE(player_id, nudge_date)` on `availability_nudge_log` — the log row is inserted *before* the push is sent (status `'pending'`, claiming the daily slot), so a retried cron invocation skips re-attempting rather than double-notifying. The row is then updated to `status = 'sent'` or `'failed'` (with `error_message`) once the push actually resolves — a `'failed'` row still counts against the daily cap (no same-day retry), but is now visible in the table instead of masquerading as a success.
- The route distinguishes *why* a log insert failed: a `23505` (unique-violation) error is the expected, benign idempotency hit — that player was already nudged today — and is counted as `already_nudged` in the response. Anything else is counted as `skipped` and triggers a GC push alert (`⚠️ Availability Nudge — Skipped`), since a genuine log-write failure (e.g. a schema drift between the code and the live DB — see the July 2026 incident in Section 6) otherwise leaves `sent`/`failed` both at 0, which reads identically to "nobody needed nudging today."
- Outside the Sun–Wed window (i.e. `getDay() > 3`), the route is a no-op, not an error

---

## 5. Security

- Cron auth via `CRON_SECRET` bearer token, identical pattern to `/api/cron/lock-availability`
- `createServiceClient()` (service-role key) only — no client-callable variant of this logic exists
- `nextLockWeekend`, player list, and booking list are derived entirely server-side; no client-supplied date range, player ID, or booking ID is ever accepted
- RLS enabled on `availability_nudge_log` with no anon/authenticated policies — service-role only, consistent with the rest of the platform
- Push payloads never include another player's name, response, or count

---

## 6. Known Limitations / Verified Behavior

> ⏳ **Pending confirmation** — this section will be filled in after observing a full live Sun–Wed cycle. Update once confirmed:
> - [ ] Dates render correctly across the cycle (no off-by-one on `nextLockWeekend` calc)
> - [ ] Wednesday deadline nudge correctly carries forward the earlier-week booking reference, and correctly lists every remaining gap when there's more than one
> - [ ] `availability_nudge_log` dedupe holds under a manual re-trigger
> - [ ] Failure-alerting fix has actually fired a test alert successfully, not just been merged
> - [x] `030_availability_nudge_log_delivery_status.sql` migration is applied and rows correctly show `status = 'sent'` vs `'failed'` — see the July 2026 incident below; confirmed applied 8 Jul 2026
> - [ ] Priority-list selection (Fix 7) actually closes the silent-day gap observed in manual simulation — confirm via a live cycle that active players with a real gap get nudged every day, not just on days matching their "expected" theme

**Product decision recorded:** an `inactive` player always gets generic reactivation copy regardless of history depth (Fix 3, Option A) — see the comment above `noHistory` in `pickNudgeCandidate()`. Deliberate, not an oversight.

**Incident — 8 Jul 2026, migration 030 not applied to production:** the Sun 8pm cron ran successfully (HTTP 200, no thrown error, ~6s) but sent zero nudges. Root cause: migration `029_availability_nudge_log.sql` had been applied to the live Supabase project but `030_availability_nudge_log_delivery_status.sql` had not, so the live table was still missing `status`/`error_message`. Every candidate's `.insert({ ..., status: 'pending' })` failed with an unrecognized-column error, which the route (pre-fix) treated identically to "already nudged today" — no push was attempted, no row was written, and the response body (`sent: 0, failed: 0`) was indistinguishable from a legitimately quiet day. Caught only by manually inspecting the Vercel function trace and cross-checking `availability_nudge_log` row counts against `list_migrations`.
Fixed by: (1) applying migration 030 to the live project, and (2) the route now separates `already_nudged` (benign `23505` unique-violation — the real idempotency case) from `skipped` (any other insert failure), and fires a GC push alert whenever `skipped > 0`, since nobody actively reads a cron's JSON response body. Take-away: **a merged migration file is not the same as an applied migration** — this project's Supabase migrations are applied manually (see `list_migrations` vs. the files in `supabase/migrations/`), so a merged PR touching schema needs a manual apply step confirmed separately, not assumed from the merge itself.

**Incident — confirmed 2026-07-16, Vercel cron intermittently not firing:**
while investigating the same-day `lock-availability` and
`backfill-scorecards` failures (see `pending-backlog.md` S-8), the same
class of problem was found here too, just partial rather than total —
`availability_nudge_log` shows real `sent` activity on 8, 12, 13, and 15
Jul (149–160 players nudged each of those days), but **14 Jul (a Tuesday,
inside the Sun–Wed window) has zero log rows at all** — not a single
`sent`, `failed`, or `already_nudged` entry, meaning Vercel simply never
invoked the route that day. This is a distinct failure from the
already-tracked "silent day" gap above (Fix 7, still pending live
confirmation) — that one is about the *theme-selection logic* skipping a
specific player on a specific day; this one is the *entire cron*
skipping every player on a specific day. Fixed the same way as the other
crons: a GitHub Actions workflow
(`.github/workflows/cron-availability-nudge.yml`) now calls this route on
the same `15 15 * * 0-3` schedule as a reliable second trigger, safe to run
alongside the existing `vercel.json` entry since the route's own
`UNIQUE(player_id, nudge_date)` guard on `availability_nudge_log` means a
same-day double-fire just lands as `already_nudged` on the second pass.

**Resolved as of this writing** (formerly listed here as pending):
- Failure alerting on cron error via the shared `notifyGCs()` helper (now in `src/lib/webpush.ts`, used by both this cron and `lock-availability`)
- Theme rename `format_stretch` → `same_format_new_slot`, freeing `format_stretch` for the future discovery theme
- Batched prior-nudge and weekly-history lookups — one round-trip per roster-wide query instead of one per player
- Per-player delivery outcome tracked via `status`/`error_message` on `availability_nudge_log`, updated after the push actually resolves
- Wednesday's deadline nudge covers every remaining gap booking, not just one (Fix 6)
- Fixed day→theme mapping replaced with the priority list described in Section 3 (Fix 7) — closes the "silent day" gap where a player's real gap didn't match that day's single expected condition
- `skipped` vs `already_nudged` distinction in the log-insert failure path, with a GC alert on genuine skips — see incident above

---

## 7. Explicitly Out of Scope

- The Thursday lock cron itself, the `Y/O/E/L` response model, and the captain-proxy flow are unchanged
- No public/captain-facing display of nudge open/click-through rates
- No captain-affinity-aware nudging (accounting for a player's loyalty to a specific match captain when suggesting an unfamiliar slot) — discussed as a future direction, not implemented
- The "discovery" themes (try a different format / try a genuinely novel slot) are not implemented — only the gap-closing Sun–Wed cadence above exists today
