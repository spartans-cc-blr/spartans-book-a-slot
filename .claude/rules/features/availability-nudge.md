# Availability Nudge Notifications — Feature Summary

**Spartans Hub · Added: July 2026**

---

## 1. Overview

Personalised push reminders sent **Sunday 8pm through Wednesday 8pm IST**, nudging players to mark availability for `nextLockWeekend` — the Sat/Sun pair the upcoming Thursday 8am lock-availability cron will freeze. Each nudge is derived entirely from the individual player's own historical response pattern, never from how full or empty a slot looks, so it can't bias a player toward or away from any particular slot.

Also functions as a re-engagement channel: submitting any availability response already auto-reactivates an `inactive` player (existing behavior, see `player-availability.md`), so an inactive player receiving a nudge and responding is a genuine second front door back into the club, not just a stats feature.

**Design constraint driving every decision below:** no raw counts, no scarcity language ("filling fast," "only a few spots"), no comparison to other players' responses. Nudges are self-referential — a player's own history vs. their own current-week gap — and the explicit date is always named ("Sun 19 Jul, 7:15 AM") rather than "this weekend," to avoid confusion with a just-concluded match on Sunday evenings.

---

## 2. File Map

| File | Role |
|---|---|
| `src/app/api/cron/availability-nudge/route.ts` | Cron entry point — `CRON_SECRET` bearer auth, orchestrates the daily run, writes to `availability_nudge_log`, sends pushes |
| `src/lib/availabilityNudge.ts` | Core logic — `nextLockWeekend` date calc, historical frequency (`buildPlayerHistories`), theme selection (`pickNudgeCandidate`), copy generation (`buildNudgeCopy`) |
| `src/app/page.tsx` | Read-only rendering of the same day's nudge as a dashboard card, next to the existing Pending Availability count |
| `supabase/migrations/029_availability_nudge_log.sql` | `availability_nudge_log` table — idempotency guard (`UNIQUE(player_id, nudge_date)`) and per-day audit trail |
| `vercel.json` | Cron schedule entry: `"30 14 * * 0-3"` (14:30 UTC = 20:00 IST, Sun–Wed) |
| `src/lib/webpush.ts` | Shared push-send utility, reused as-is (no changes for this feature) |

---

## 3. Trigger Table

| Day (8pm IST) | Audience | Condition | Theme |
|---|---|---|---|
| Sun | Active, ≥6 qualifying past responses | Booking matches their most-frequent historical `(day_of_week, slot_time)` pair, unanswered | `habitual` |
| Sun | Inactive, or active with <6 responses | Any qualifying booking, unanswered | `reactivation_1` |
| Mon | Active, has history | Same format as their most-frequent format, different slot than Sunday's pick | `same_format_new_slot` *(see note below on naming)* |
| Mon | Inactive / no history | Still unanswered | `reactivation_2` (softer, second touch) |
| Tue | Active, has history | Zero past responses logged for this booking's tournament | `tournament_eligibility` |
| Tue | Inactive / no history | Still unanswered | `reactivation_2` (tournament-eligibility copy is not shown to no-history players) |
| Wed | All (active + inactive) | Still unanswered, lock is tomorrow 8am | `deadline` — always fires regardless of history, carries forward the same booking referenced earlier in the week where possible |

**Historical frequency** is derived from `availability` rows where `response IN ('Y', 'O', 'E')` — all three represent genuine willingness to play that specific slot/format/day; the weekend/day scope in O/E's definition constrains *how many* games get played, not whether the marked slot reflects a real preference. `L` (deliberate unavailability) and blank/no-response are excluded. Minimum sample size of 6 qualifying responses before a pattern counts as "their usual" — below that, the player is treated as no-history.

> **Naming note:** the Monday theme is functionally "same format, unfamiliar slot" — a separate, not-yet-built "discovery" theme (nudging a player to try a genuinely *different* format) is intentionally out of scope for this feature and should not reuse a conflicting theme name if/when it's added later.

---

## 4. Scope Guards

- Only `bookings.status = 'confirmed'` and `availability_locked = false` are considered
- Only `players.status IN ('active', 'inactive')` — `expelled` players are excluded
- A player is skipped entirely for a given booking if they already have **any** response (`Y`/`O`/`E`/`L`) against it — `L` counts as a complete answer, not a gap
- Max one notification **attempt** per player per day, enforced by `UNIQUE(player_id, nudge_date)` on `availability_nudge_log` — the log row is inserted *before* the push is sent, so a retried cron invocation skips re-attempting rather than double-notifying. **Note:** as of this writing, the table does not yet distinguish attempted-and-delivered from attempted-and-failed (see Section 6) — a push failure currently looks identical to success in the log.
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
> - [ ] Wednesday deadline nudge correctly carries forward the earlier-week booking reference
> - [ ] `availability_nudge_log` dedupe holds under a manual re-trigger
> - [ ] Failure-alerting fix (see below) has actually fired a test alert successfully, not just been merged
> - [ ] `030_availability_nudge_log_delivery_status.sql` migration is applied and rows correctly show `status = 'sent'` vs `'failed'` (not just `'pending'` left unresolved)

**Known follow-ups not yet merged as of this writing** (tracked separately, not blocking this doc):
- Failure alerting on cron error (mirrors `lock-availability`'s `notifyGCs()` pattern) — critical on Vercel Hobby, which does not retry failed invocations and only retains function logs for 1 hour
- Theme rename (`format_stretch` → `same_format_new_slot`) to free up the name for the future discovery theme
- Batching the per-player prior-nudge lookup into a single query (currently one sequential round-trip per player per run)
- Product decision pending: whether an `inactive` player with substantial prior history should get personalized (habitual-slot) reactivation copy instead of generic reactivation copy
- **Per-player delivery outcome is not currently tracked** — `availability_nudge_log` records that a nudge was *attempted* (row inserted before `sendPushToPlayer` is even awaited), not whether it was actually delivered. A push failure currently looks identical to a success in the table, and the daily unique constraint blocks any resend. Fix in progress: add a `status`/`error_message` column pair, update the row after the send resolves rather than before.

---

## 7. Explicitly Out of Scope

- The Thursday lock cron itself, the `Y/O/E/L` response model, and the captain-proxy flow are unchanged
- No public/captain-facing display of nudge open/click-through rates
- No captain-affinity-aware nudging (accounting for a player's loyalty to a specific match captain when suggesting an unfamiliar slot) — discussed as a future direction, not implemented
- The "discovery" themes (try a different format / try a genuinely novel slot) are not implemented — only the gap-closing Sun–Wed cadence above exists today
