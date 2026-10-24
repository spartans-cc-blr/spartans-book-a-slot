# Record-Break Alerts — admin-only inbox, share to WhatsApp or ignore

**Spartans Hub · Added: October 2026**

---

## 1. Overview

When a freshly-synced scorecard breaks a club record (e.g. a 3rd-wicket T20 partnership in 2026),
the **admin** is pushed and the break lands in an inbox at `/admin/records`. For each one the admin
chooses **📲 Share on WhatsApp** (opens a pre-filled `wa.me` message to pick the club group; marks it
shared) or **Ignore**. Nothing is shown to players unless the admin shares it. This is deliberately
separate from season milestones / single-match highlights (`milestone-recognition.md`), which are a
club-wide modal.

## 2. What counts as a record (Phase 1)

| Key | Record | "Better" |
|---|---|---|
| `highest_total` | Highest team total | higher |
| `highest_chase` | Highest successful chase (won, batted second) | higher |
| `lowest_defended` | Lowest total defended (won, batted first) | lower |
| `highest_score` | Highest individual score | higher (a tie is not a break) |
| `best_bowling` | Best bowling figures (≥3 wickets; wickets, then fewer runs) | better |
| `partnership_w1`…`w10` | Highest partnership for that wicket (`computePartnerships()`) | higher |

Scopes: **`<format>` all-time** and **`<format>` in the match's calendar year**, T20 and T30 kept
separate (other formats and practice games are ignored). A record broken at the all-time scope is
announced once, at that scope only — the year version is dropped.

## 3. Rules that keep it from being noisy

- **Strict beat of every other match** in the scope. This also makes it date-safe: a match a later
  match has already overtaken is never announced, and a re-sync of the same match finds the same
  answer.
- **`MIN_PRIOR_ENTRIES = 5`** earlier entries in the scope, otherwise silent (best of two earlier
  3rd-wicket stands isn't news).
- **`MAX_BREAKS_PER_MATCH = 6`**, all-time first.
- **Idempotent:** `UNIQUE(booking_id, record_key, scope_key)` with `ON CONFLICT DO NOTHING`; only newly
  inserted rows trigger the push, so a re-sync never duplicates or re-notifies.
- **Alerts start 24 Oct 2026:** a match with `game_date` before that never produces an alert, even on a re-sync (`isBeforeRecordAlertStart()` / `RECORD_BREAK_ALERTS_START` in `src/lib/repullCutoff.ts`). Earlier matches still count as *history* that a new match must beat. (The sync-level 1 Oct re-pull cutoff, `post-match-scorecard.md` §18, also applies.)
- No stored "holder" table: history is recomputed from `match_stats_cache` at sync time, so there is
  nothing to seed or drift, and the numbers always agree with the Team Record / Partnerships pages.

## 4. Flow

`syncMatchStatsForBooking()` → `detectAndLogRecordBreaks(bookingId)` (`src/lib/recordBreakDetect.ts`,
best-effort, never throws) → `getTeamMatchesUncached()` (uncached on purpose: the cached list may
pre-date the sync) + batting/bowling/FOW from `match_stats_cache` → pure `detectRecordBreaks()`
(`src/lib/recordBreaks.ts`) → insert into `record_breaks` → `notifyAdmins()` push to `/admin/records`.

## 5. Admin UI and API

`/admin/records` (sidebar: 🏆 Records, under Master Data): tabs To review / Shared / Ignored, each card
shows record, scope, value, holder, what it beat, opponent/date, scorecard link, a message preview,
Share / Copy text / Ignore, and "Move back to review". Sharing opens `https://wa.me/?text=…`
(destination-free: the admin picks the group) and records the decision.

| Route | Method | Auth |
|---|---|---|
| `/api/admin/record-breaks` | GET | `isAdmin` |
| `/api/admin/record-breaks/[id]` | PATCH `{status: pending\|shared\|ignored}` | `isAdmin`, `adminWrite` rate limit, Zod `recordBreakDecisionSchema` (`.strict()`) |

## 6. Database — `supabase/migrations/088_record_breaks.sql`

`record_breaks(id, booking_id FK, record_key, scope_key, title, scope_label, holder, display,
prev_holder, prev_display, game_date, opponent_name, message, status, decided_by, decided_at,
created_at)`. RLS enabled, no anon/authenticated policies (service role only). **Must be applied to
the live Hub project** — until it is, detection logs an error and does nothing, and the page shows
an error.

## 7. Security

Admin-only end to end (push via `notifyAdmins()`, routes re-check `isAdmin`); no player-facing
surface; no new client-reachable input beyond the three-value status enum; detection failure never
fails the scorecard sync.

## 8. File map

| File | Role |
|---|---|
| `src/lib/recordBreaks.ts` (+ `.test.ts`) | Pure candidates, scopes, detection, WhatsApp message text |
| `src/lib/recordBreakDetect.ts` | Server fetch, insert, admin push |
| `src/lib/matchStatsSync.ts` | Calls the detector after the fee reminder (skipped for pre-cutoff games) |
| `src/lib/teamStats.ts` | `getTeamMatchesUncached` now exported |
| `src/app/api/admin/record-breaks/**` | List + decision routes |
| `src/app/admin/records/page.tsx` | Review inbox |
| `src/components/admin/AdminSidebar.tsx` | 🏆 Records entry |

## 9. Not built (ideas)

Lead-change records (Orange/Purple Cap changing hands, season MVP lead), tournament/ground scopes,
"equalled" records, a public Record Book page, and a push to the previous holder.

---

*Maintained by: Spartans CC BLR*
