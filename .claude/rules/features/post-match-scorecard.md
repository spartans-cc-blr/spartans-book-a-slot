# Post-Match Scorecard Integration

**Spartans Hub · Data Wranglers Integration**
*Prepared: June 2026 · Status: Implemented (July 2026)*

---

## 1. Overview

Match scorecards flow from CricHeroes into the Hub without any manual Python
runs. Two independent paths converge on the same pipeline:

- **Manual upload** — a wrangler, that match's captain/VC, or an admin
  uploads a CricHeroes PDF from the match card on `/matches/history`.
- **Automated fetch** — a daily cron (and an on-demand admin backfill page)
  pulls the PDF directly from CricHeroes's own PDF endpoint, no browser
  automation and no human needed. This was not part of the original plan —
  see Section 3 for why it turned out to be viable after all.

Both paths land in the same `scorecard_uploads` status machine and the same
analytics pipeline. Parsing and syncing stats into the Hub DB are now
seamless end-to-end for the automated path; **applying match fees is a
permanently separate, explicit, manual admin action** — nothing in this
feature ever triggers a wallet debit on its own. See Section 6.

Once a scorecard is synced, a captain/VC/wrangler/admin can additionally
mark it **verified** against the real CricHeroes page, or **flag it for
reconciliation** if something looks wrong — two independent flags layered
on top of the status machine above, never rewinding it. See Section 14.

---

## 2. Permanent Limitations (revised)

> These were the original constraints. One of them turned out to be only
> partially true — see the correction below. Do not re-litigate the ones
> that still hold; do re-litigate assumptions this project already disproved
> once, elsewhere (that's how the CricHeroes one below got fixed).

| Limitation | Status |
|---|---|
| **CricHeroes blocks all automated access** | ⚠️ **Partially wrong — corrected in `limitations.md`.** The scorecard *webpage* is a JS-rendered SPA and is not scraped. But CricHeroes's own PDF endpoint (`pdf.cricheroes.in/scorecard-summary/{match_id}/...`) is a plain HTTP resource that returns a normal 200 with the right headers (`User-Agent`, `Accept`, `Referer: https://cricheroes.in/`) — no browser automation, no login, no rate-limit trouble observed. This is the entire basis for the automated fetch path in Section 3. Manual PDF download remains a fallback for matches this doesn't work for. |
| **Vercel cannot run Python** | ✅ Still true. All parsing stays in `spartans-python`, hosted separately. |
| **Google Drive OAuth not suitable for hosted services** | ✅ Still true. Bypassed — PDFs never touch Drive in the Hub flow. |
| **Supabase free tier — 50MB storage cap** | ✅ Still true, and irrelevant here — PDFs are never persisted in Supabase, only forwarded to the microservice. |

---

## 3. Architecture

### 3.1 Two Repos, Permanently Separate

```
spartans-python  (Python · Render)     spartans-hub  (Next.js · Vercel)
══════════════════════════════════    ══════════════════════════════════
pdf_extractor.py     ← touched        src/app/api/matches/[id]/scorecard
field_config.py      ← touched        src/app/api/admin/sync-match-stats
field_extractors.py  ← untouched      src/app/api/fees/apply (existing)
dismissal_parser.py  ← untouched      src/lib/matchStatsSync.ts
mvp_calculator.py    ← untouched      src/lib/scorecardBackfill.ts
csv_writers.py       ← touched        src/app/api/cron/backfill-scorecards
import_to_supabase.py ← touched       src/app/api/admin/scorecard-backfill
api.py               ← new
```

> **Real bug fixed here, worth knowing if fielding/bowling ever looks empty
> again:** `field_config.py`'s `PDFLayoutConfig.LAYOUT_RULES` originally
> pointed the extractor at PDF pages 2 and 3 for the batting/bowling
> scorecard content. Page 2 is actually the "Playing Squad" page, not a
> scorecard — this silently produced complete batting data (which happened
> to also appear on page 2) but zero bowling/fielding rows every time,
> because the real scorecard content is on pages 3 and 4. Verified against
> a real PDF: 0 → 7 bowlers once corrected. If a future CricHeroes export
> format changes page layout again, this is the first place to check.

> **Hosting note:** the microservice is deployed on **Render**, not Railway
> as originally planned — see the `Render's free/hobby tier spins down after
> inactivity` comment in `src/app/api/matches/[id]/scorecard/route.ts`. Cold
> starts take up to ~30s; every fetch to it carries a 45s client-side
> timeout to absorb that without hanging.

### 3.2 End-to-End Data Flow

```
                         CricHeroes
                             │
        ┌────────────────────┴────────────────────┐
        │ manual PDF download                      │ direct PDF fetch
        ▼                                           │ (Referer + UA headers,
Captain / VC / Wrangler opens match                 │  no browser needed)
in /matches/history                                 │
        │                                            │
        ▼                                            ▼
"Upload Scorecard" → file picker            Daily cron (07:00 IST) or
        │                                    /admin/scorecard-backfill
        ▼                                            │
POST /api/matches/[id]/scorecard             backfillOneBooking()
  (streamed progress events)                  (src/lib/scorecardBackfill.ts)
        │                                            │
        └─────────────────┬──────────────────────────┘
                           ▼
              spartans-python api.py
        (POST /parse-scorecard  — manual path)
        (POST /fetch-and-parse-scorecard — automated path)
                           │
                           ▼
              Analytics Supabase DB
   match_stats / batting_stats / bowling_stats / fielding_stats / team_list
                           │
        ┌──────────────────┴──────────────────┐
        │ manual path: stops at 'parsed'       │ automated path: chains
        │ — admin/wrangler/captain/VC clicks   │ straight into sync — no
        │ "Sync Stats" explicitly              │ separate click needed
        ▼                                      ▼
         syncMatchStatsForBooking()  (src/lib/matchStatsSync.ts)
              — upserts match_stats_cache in Hub DB
                           │
                           ▼
        Result + scorecard visible on /matches/history for everyone
                           │
                           ▼
        Admin explicitly runs POST /api/fees/apply — separate, manual,
        never automated by anything above
```

---

## 4. Data Wrangler Persona (`is_wrangler`)

Unchanged from the original plan — fully implemented, no action needed:

- `players.is_wrangler boolean not null default false` (migration `042_add_wrangler_role.sql`)
- Selected into the JWT in `src/lib/auth.ts`: `token.isWrangler = player?.is_wrangler ?? false`
- Surfaced on the session: `session.user.isWrangler`

### Access matrix (as actually shipped — wider than originally planned)

| Feature | Captain (own match) | VC (own match) | Wrangler | Admin |
|---|---|---|---|---|
| Upload scorecard | ✅ | ✅ | ✅ (any match) | ✅ |
| View completed matches / scorecards | ✅ | ✅ | ✅ | ✅ |
| **Sync stats from analytics DB** | ✅ (own match) | ✅ (own match) | ✅ | ✅ |
| **Verify scorecard / report discrepancy** | ✅ (own match) | ✅ (own match) | ✅ | ✅ |
| Apply match fees | ❌ | ❌ | ❌ | ✅ only |
| Clear a reconciliation flag without reprocessing | ❌ | ❌ | ❌ | ✅ only |
| Run the one-time backfill page | ❌ | ❌ | ❌ | ✅ only |
| Edit an existing ground (maps/hospital link) | ❌ | ❌ | ✅ | ✅ |
| Create a new ground | ❌ | ❌ | ❌ (GC only, not wrangler) | ✅ |

> **Grounds management (added July 2026):** wrangler also covers editing
> the `grounds` master-data table at `/wrangler/grounds`, reached via the
> new "Wrangler ⚒" nav dropdown (`src/components/ui/SiteNav.tsx`) that
> Squad Backfill also moved under. *Creating* a new ground is intentionally
> kept out of the wrangler role — it's GC/admin only, same tier as adding a
> tournament or captain. See `features/wrangler-grounds-menu.md` for the
> full permission split and the nav changes.

> **Change from the original plan:** "Sync stats" was originally admin-only.
> It's now open to the same audience as upload — a match's captain/VC, or
> any wrangler — because there was no reason to make someone wait on an
> admin to unstick a `parsed` scorecard they were already trusted to upload.
> `POST /api/admin/sync-match-stats` re-derives this server-side via the
> identical `squad` table lookup the upload route uses — never trusts the
> client-side gate that decided to show the button.

---

## 5. Database (Hub DB)

### `match_stats_cache` — migration `044_match_stats_cache.sql`
Read-through cache of analytics-DB stats, keyed by `match_id`, FK'd to
`booking_id`. `batting` / `bowling` / `fielding` / `team_list` are `jsonb`
arrays mirroring the analytics DB's column shapes exactly — no separate
per-stat tables in the Hub DB.

### `scorecard_uploads` — migration `045_scorecard_uploads.sql`
One row per booking (`UNIQUE(booking_id)`). `status` is a Postgres enum:
`pending_parse → parsed → synced → fees_applied`, forward-only. Set by
whichever path (manual or automated) is currently acting on that booking.

### RLS — migration `046_enable_rls_scorecard_tables.sql`
> ⚠️ **Both tables were created without RLS enabled** — a real gap, found
> and closed 2026-07-15. Unlike the rest of this app's tables, they were
> fully readable *and writable* via the public anon key until this
> migration. No policies added, matching the established pattern for
> `players` / `availability` / `fee_exemptions` — blanket deny for
> anon/authenticated, service-role-only access. Every read/write to these
> two tables already goes through `createServiceClient()`, so this closes
> the exposure without changing app behaviour.

### `players.is_wrangler` — migration `042_add_wrangler_role.sql`
See Section 4.

> **Repo/DB drift note:** migrations `044`–`046` were applied directly to
> the live project via Supabase MCP and were not checked into this repo
> until this documentation pass (2026-07-15). Same failure class the
> `availability-nudge.md` incident write-up warns about, just inverted —
> *applied* but not *checked in*, rather than the other way round. Always
> cross-check `list_migrations` against `supabase/migrations/*.sql` after a
> session that touched schema.

---

## 6. Status Lifecycle — and why fees are deliberately decoupled

```
pending_parse → parsed → synced → fees_applied
```

| Transition | Trigger | Who |
|---|---|---|
| *(none)* → `pending_parse` | Upload initiated / backfill run started | Upload route or `backfillOneBooking()` |
| `pending_parse` → `parsed` | Microservice parse succeeds | Both paths |
| `parsed` → `synced` | `syncMatchStatsForBooking()` succeeds | **Automatic** on the backfill/cron path; **explicit click** ("Sync Stats") on the manual-upload path |
| `synced` → `fees_applied` | Admin runs `POST /api/fees/apply` | **Always manual, always admin-only, never triggered by anything else in this feature** |

**Why fees stay manual:** past match fees are being handled through a
separate Hub-sheet export/import process, and going forward the club wants
fee application to always be an explicit admin decision — not something a
cron silently does on a schedule. `src/lib/scorecardBackfill.ts` and its
cron caller never call `/api/fees/apply`, by design, and the code comments
say so explicitly to prevent a future edit from "helpfully" wiring it up.

A sync failure on the automated path (e.g. analytics DB not reachable) just
leaves the booking at `parsed` — identical to where a manual upload would
sit before someone clicks "Sync Stats". No new failure-path UI was needed;
the existing admin Post-Match panel and match-card indicator already handle
that state.

---

## 7. API Routes (as shipped)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/matches/[id]/scorecard` | POST | Captain/VC (own booking) or wrangler/admin | Manual PDF upload. Streams newline-delimited JSON progress events (`recording` → `sending` → `finalizing` → `done`/`error`) so a slow parse shows exactly where it's stuck. 45s microservice timeout, `maxDuration=60` (Hobby ceiling). Magic-byte PDF validation (`%PDF`), 10MB cap, both enforced server-side. |
| `/api/admin/sync-match-stats` | POST | Captain/VC (own booking) or wrangler/admin | Manual "Sync Stats" trigger. Thin wrapper around `syncMatchStatsForBooking()` (shared with the automated path). |
| `/api/matches/[id]/verify-scorecard` | POST | Captain/VC (own booking) or wrangler/admin | Marks the scorecard as manually checked against CricHeroes. Requires `status IN ('synced','fees_applied')`; rejected while flagged. See Section 14. |
| `/api/matches/[id]/flag-reconciliation` | POST, DELETE | POST: captain/VC (own booking) or wrangler/admin. DELETE: admin only | POST reports a discrepancy with a required note, re-queuing the booking into the backfill pipeline and clearing any prior `verified`. DELETE clears the flag without reprocessing — a false-alarm override. See Section 14. |
| `/api/admin/matches/[id]/post-match` | GET, DELETE | Admin only | Feeds the admin Post-Match panel (upload status + uploader name + stats preview). DELETE resets a stuck/wrong `scorecard_uploads` row — admin-only override, never reverses a fee debit. |
| `/api/admin/scorecard-backfill` | GET, POST | Admin only | GET lists past confirmed bookings with a `match_id` that aren't yet `synced`/`fees_applied`. POST processes exactly one booking per call — the admin page drives the loop client-side, paced ~4s apart, never server-side (a single Vercel invocation can't safely loop a whole historical backlog). |
| `/api/cron/backfill-scorecards` | GET | `CRON_SECRET` bearer | Daily cron. See Section 8. |
| `/api/matches/history` | GET | Any signed-in, non-expelled member | Paginated match list feeding `/matches/history`. Computes `can_upload` and `roles_complete` server-side per booking; joins `scorecard_uploads` status and a `match_stats_cache` summary. |
| `/api/matches/history/[bookingId]` | GET | Any signed-in member | Squad detail for one booking (also resolves CricHeroes links for the scorecard tables). |
| `/api/matches/history/[bookingId]/scorecard` | GET | Any signed-in member | Full `batting`/`bowling`/`fielding`/`team_list` from `match_stats_cache` — stats aren't sensitive, so no role gate beyond being signed in. |
| `/api/matches/history/[bookingId]/roles` | PATCH | Same as `canEditRoles` (GC/admin/wrangler) | Corrects C/VC/WK on a past match. |
| `/api/matches/history/[bookingId]/tournament` | PATCH | Admin only | Reassigns a mis-tagged tournament after the fact. |
| `/api/fees/apply` | POST | Admin only | Pre-existing route, untouched in spirit. Only addition: sets `scorecard_uploads.status = 'fees_applied'` and `fees_applied_at`/`fees_applied_by` after a successful debit. |

### Microservice endpoints (`spartans-python/api.py`)

| Endpoint | Used by | Notes |
|---|---|---|
| `POST /parse-scorecard` | Manual upload route | Accepts a multipart PDF + optional `match_id` form field. `match_id` must be `Form(...)`-annotated — a bare parameter is silently read as a query param instead (a real bug hit and fixed during development). |
| `POST /fetch-and-parse-scorecard` | `backfillOneBooking()` (backfill page + cron) | Accepts `{ match_id, dry_run }` JSON. Downloads the PDF directly from `pdf.cricheroes.in` server-side with the CricHeroes-friendly headers, then runs the identical parse pipeline. `dry_run: true` parses without writing to the analytics DB — used to validate a new match_id safely. |
| `GET /health` | — | Liveness check. |

---

## 8. Automation — Backfill & Daily Cron

### `src/lib/scorecardBackfill.ts` — shared core
`backfillOneBooking(bookingId)` is the single function used by both the
one-time admin page and the daily cron. Per booking: validates the booking
is completed and has a `match_id`, upserts `scorecard_uploads` to
`pending_parse`, calls the microservice's `/fetch-and-parse-scorecard`
(45s timeout), flips to `parsed` on success, then **immediately** calls
`syncMatchStatsForBooking()` — this is what makes the automated path
seamless end-to-end. Never calls `/api/fees/apply`.

### `/admin/scorecard-backfill` — one-time catch-up UI
Lists every eligible past booking, admin selects which to run, and the
**client** drives a sequential loop (~4s pacing between CricHeroes fetches,
matching the wrangler's own `download_scorecard.py` etiquette) — the server
route only ever processes one booking per request, since a single Vercel
invocation can't safely absorb an entire historical backlog.

Since Section 14, the page splits into a **⚠ Needs Reconciliation** section
(flagged bookings, oldest flag first, pre-selected regardless of their
current `status`) above the regular list, each row showing the note and who
flagged it, with an admin-only **Resolve** action that clears the flag
without re-running the fetch (a false-alarm override, distinct from "Reset
Upload").

### `/api/cron/backfill-scorecards` — twice daily, self-healing
Runs at 07:00 and 19:00 IST (`vercel.json`: `"30 1,13 * * *"` — widened
from once daily on 2026-07-16 to help drain the backlog described below;
drop back to once-daily once it's clear). Queries **all** past unsynced
bookings with a `match_id`, not just "yesterday" — so a run that's cut
short, or a match that keeps failing, just rolls into the next run instead
of being permanently skipped. `MAX_PER_RUN = 3` bounds each individual run
(lowered from 5, see incident below); a backlog beyond that drains a few
more per run until clear. Pushes a GC notification on completion (success
count, or failures with reasons).

Eligibility (added with Section 14's verification/reconciliation feature):
a booking also qualifies here if `needs_reconciliation` is true, regardless
of its `status` — a human-reported discrepancy jumps the queue ahead of
routine never-synced backlog (flagged bookings are sorted first within the
`MAX_PER_RUN` slice). `backfillOneBooking()` clears the flag itself on a
successful re-sync, so there's no separate "un-flag" step needed here.

> **Incident (2026-07-16) — this route had never actually fired
> automatically, and separately, its per-run cap was too high.** Two
> distinct problems, found the same day while investigating why two known
> past matches (4 & 5 Jul) hadn't synced:
>
> 1. **Vercel Hobby was never invoking the cron.** Every row in
>    `scorecard_uploads` had `uploaded_by` set to a real player — the
>    automated path always writes `uploaded_by: null`, and zero such rows
>    existed anywhere in the table's history. A ~33-booking backlog going
>    back to mid-March had quietly accumulated with no errors anywhere,
>    because nothing had ever actually run. Manually triggering the route
>    from the Vercel dashboard worked immediately and correctly. This is
>    the same failure class as `lock-availability` (see `pending-backlog.md`
>    S-8 and `limitations.md`) — not a bug in this route's code.
> 2. **The previously "accepted risk" below materialized for real.** A
>    manual run at `MAX_PER_RUN = 5` completed exactly 3 bookings and then
>    hit a `504 FUNCTION_INVOCATION_TIMEOUT` starting the 4th — confirming
>    the prediction that used to live in this callout as a hypothetical.
>    Nothing was left corrupted (each booking only reaches `synced` after
>    its full cycle completes, so the killed 4th attempt left no dangling
>    row), but it did confirm 5 was too high for a reliable single run.
>
> **Fixed:** `MAX_PER_RUN` lowered 5→3 (3 sequential bookings reliably fits
> the 60s Hobby ceiling even under a cold Render start); a GitHub Actions
> workflow (`.github/workflows/cron-backfill-scorecards.yml`) now calls this
> route twice daily as a reliable second trigger alongside the still-present
> `vercel.json` entry — safe since re-running only ever touches bookings not
> yet `synced`/`fees_applied`. The March–July backlog is being drained via
> `/admin/scorecard-backfill` (client-paced, one booking per request, not
> subject to the 60s ceiling at all) rather than repeated cron runs.

### Why the daily-cron-plus-guard shape exists at all
Vercel Hobby does not support day-of-week-restricted cron expressions —
this was discovered the hard way on the *separate* `lock-availability`
cron (`"30 2 * * 4"` never fired at all on Hobby; see that route's git
history). `backfill-scorecards` doesn't need day-of-week restriction — it's
meant to run every day — so it isn't affected by that specific failure
mode, but it's worth knowing the platform constraint exists before adding
any future cron that does need one.

---

## 9. UI — `MatchHistoryCard` (`src/components/matches/MatchHistoryClient.tsx`)

### Result badge vs. sync status — deliberately asymmetric weight
A win gets a solid green pill (`WON`, celebratory). A loss, tie, or
no-result renders as **plain coloured text, no pill** — a bordered badge on
every outcome made a loss read as visually "achieved" as a win, which is
backwards. The scorecard's sync lifecycle is intentionally the quietest
thing on the card: originally a small icon + caption (`⏳ Awaiting sync`,
`✓ Stats synced`, `✓ Fees applied`) sat inline in the icon row rather than a
standalone highlighted box (a bordered badge used to outshine the actual
match result). Since Section 14, only `⏳ Awaiting sync` (`parsed`) still
renders here — `synced`/`fees_applied` are superseded by the verify line
below the icon row, which already implies "stats are synced" as a
precondition, so the old captions there were redundant.

### Icon row
Left to right: the subtle sync indicator described above (`parsed` only,
when `can_upload`), a spacer, then CricHeroes. **Ground was removed
entirely** — the ground name under the opponent (`@ <ground>`) was already
the clickable Maps link, so a second identical icon further down the card
was pure duplication. **CricHeroes is also hidden here** whenever the
verify line below is about to show the same icon instead (see Section 14's
`CricHeroesInlineLink` / `verifyRowHasCricHeroesLink`) — one real,
clickable icon per card, never two copies of it. Hidden entirely if
neither applies. Ball/jersey icons were removed from this card earlier
(they're still on `FixturesCard` for upcoming fixtures; here they added
nothing a completed-match viewer needed).

### "Did not bat" line
The batting table filters out players who didn't face a ball — that's the
right call for the table itself, but on its own it hides who else was in
the squad that day. A line under the batting table lists everyone from
`team_list` who isn't in the filtered batting rows, CricHeroes-linked the
same way every other player name is — mirrors CricHeroes's own scorecard
convention.

### Squad collapsible — hidden once redundant
Only shown when `!match.stats || !match.roles_complete` — i.e. hidden once
the scorecard has synced stats *and* C/VC/WK are all set, since at that
point the scorecard already answers "who played," and roles essentially
never need touching again after that. `roles_complete` is computed
server-side in `/api/matches/history` from the `squad` table (at least one
`is_captain`, one `is_vc`, one `is_wk` row for that booking).

### Actionable vs. passive states — where each renders
`ScorecardUploadButton` (file picker / "Processing…" spinner / "Stuck?
Retry upload") only renders for the two states that need a human action:
no upload yet, or a stuck `pending_parse`. `parsed` is passive and renders
as the subtle icon-row indicator. `synced`/`fees_applied` are passive too,
but render via the verify line described in Section 14 instead of the
icon row.

### Ground link
`match.ground` comes from a `tournaments → grounds` join added to
`/api/matches/history` specifically for this card, mirroring
`FixturesCard`'s pattern exactly. Falls back to the booking's free-text
`venue` column when no ground record is linked to the tournament. This is
now the card's only ground affordance — see the Icon row note above.

### Tournament name — hyperlink to "Yours Statistically"
Underlined in gold (same convention as `FixturesCard`'s tournament →
CricHeroes-points-table link), linking to `/leaderboard` pre-filtered to
`?tournament=<id>&category=mvp&year=all`. See Section 14 for why `mvp`
and `year=all` specifically.

### Default filters — faster first paint
`roleFilter` defaults to `'played'` ("I Played") for a viewer with a
`playerId`, rather than `'all'` — see Section 14.

---

## 10. Security Checklist (vibe-security)

| Check | Status |
|---|---|
| Upload/sync auth is per-booking, not just role | ✅ `squad` table lookup scoped to this `booking_id` + this `player_id`, in both `/api/matches/[id]/scorecard` and `/api/admin/sync-match-stats` |
| `is_wrangler` bypasses per-booking check | ✅ Acceptable — wrangler is a trusted role, admin-writable only |
| PDF validated by magic bytes, not Content-Type | ✅ `%PDF` header check |
| File size capped at 10MB server-side | ✅ Both the Hub route and the microservice enforce independently |
| `MICROSERVICE_SECRET` / `ANALYTICS_SUPABASE_KEY` / `ANALYTICS_SUPABASE_URL` never in client bundle | ✅ No `NEXT_PUBLIC_` prefix on any of them |
| Fees never auto-triggered | ✅ `scorecardBackfill.ts` and its cron caller never call `/api/fees/apply` — verified by reading the file, not just by comment |
| Fee-exempt players skipped server-side | ✅ Pre-existing behaviour in `/api/fees/apply`, untouched |
| `match_stats_cache` / `scorecard_uploads` RLS | ✅ **Fixed 2026-07-15** — see Section 5. Was disabled since table creation; closed via migration `046`. |
| CricHeroes direct-fetch endpoint auth | ✅ Server-to-server only (`MICROSERVICE_SECRET` header), never called from the browser |
| Verify/flag auth is per-booking, not just role | ✅ Same `squad` lookup pattern reused in `verify-scorecard`/`flag-reconciliation` — see Section 14 |
| Reconciliation note validated server-side | ✅ Zod (`flagReconciliationSchema`/`resolveReconciliationSchema`, `src/lib/schemas.ts`), 3–500 chars |
| `verified`/`needs_reconciliation` mutually exclusive | ✅ Enforced server-side in both routes (flagging clears `verified`; verifying is rejected while flagged), not just in the UI |
| `scorecard_reconciliation_log` RLS | ✅ Blanket deny, service-role only — same pattern as `scorecard_uploads` |
| Top-performer verify/flag grant re-derived server-side per booking | ✅ `canActOnScorecard()` (`src/lib/scorecardAuth.ts`) recomputes from `match_stats_cache` + `squad` on every call — never trusted from the client, never a standing role, never widens `can_upload`/fees — see Section 15 |
| Standalone match page's `canAct` mirrors the API auth exactly | ✅ Page-local gating in `/matches/history/[bookingId]/page.tsx` is a display convenience only; `verify-scorecard`/`flag-reconciliation` re-check independently regardless of what the page renders |
| Wrangler-only share button visibility | ✅ Gated to `isWrangler` specifically (not paired with `isAdmin` like every other wrangler affordance in this app) — deliberate scoping, see Section 15 |
| `top_performers[].whatsapp` never sent to a non-privileged viewer | ✅ Redacted to `null` server-side in `/api/matches/history` unless `isWrangler \|\| isAdmin` — same posture as `emergency_contact_phone`, never relies on the client just not rendering it — see Section 15 |
| Share-list MVP scoping never narrows real access | ✅ `computeMatchMVP()` only changes what's serialized as `top_performers` (the share button's input) — `can_verify` and `canActOnScorecard()` still key off the tie-inclusive `computeTopPerformers()`, so a tied top batter/bowler who isn't picked as the share target keeps their own verify/flag access — see Section 15 |

---

## 11. File Map

| File | Role |
|---|---|
| `src/app/api/matches/[id]/scorecard/route.ts` | Manual upload — streamed progress, per-booking captain/VC or wrangler/admin auth |
| `src/lib/matchStatsSync.ts` | `syncMatchStatsForBooking()` — shared by manual "Sync Stats" and the automated backfill path |
| `src/lib/scorecardBackfill.ts` | `backfillOneBooking()` — shared core for the admin backfill page and the daily cron; chains parse → sync, never touches fees |
| `src/app/api/admin/sync-match-stats/route.ts` | Manual sync trigger — thin wrapper around `matchStatsSync.ts` |
| `src/app/api/admin/matches/[id]/post-match/route.ts` | Admin Post-Match panel feed (GET) + stuck-upload reset (DELETE) |
| `src/app/api/admin/scorecard-backfill/route.ts` | One-time backfill: GET lists eligible bookings, POST processes one |
| `src/app/admin/scorecard-backfill/page.tsx` | Admin UI driving the client-side backfill loop |
| `src/app/api/cron/backfill-scorecards/route.ts` | Daily self-healing cron |
| `src/app/api/matches/history/route.ts` | Paginated match list — `can_upload`, `can_verify`, `top_performers`, `roles_complete`, `scorecard_status`, `ground` join. `top_performers` is built from `computeMatchMVP()` (single match MVP); `can_verify` still uses `computeTopPerformers()` (tie-inclusive) — see Section 15 |
| `src/app/api/matches/history/[bookingId]/route.ts` | Squad detail for one booking |
| `src/app/api/matches/history/[bookingId]/scorecard/route.ts` | Full batting/bowling/fielding/team_list |
| `src/app/api/matches/history/[bookingId]/roles/route.ts` | Correct C/VC/WK post-hoc |
| `src/app/api/matches/history/[bookingId]/tournament/route.ts` | Reassign tournament post-hoc |
| `src/app/matches/history/page.tsx` + `src/components/matches/MatchHistoryClient.tsx` | `/matches/history` page — filters, pagination, `MatchHistoryCard` |
| `src/components/matches/ScorecardUploadButton.tsx` | Upload button + actionable-state UI only (no-upload / stuck pending_parse) |
| `src/components/matches/ScorecardTables.tsx` | Batting/bowling tables + "Did not bat" line |
| `src/app/admin/bookings/[id]/page.tsx` | Admin booking edit page — Post-Match panel |
| `supabase/migrations/042_add_wrangler_role.sql` | `players.is_wrangler` |
| `supabase/migrations/044_match_stats_cache.sql` | `match_stats_cache` table (reconstructed — see Section 5) |
| `supabase/migrations/045_scorecard_uploads.sql` | `scorecard_uploads` table + enum (reconstructed — see Section 5) |
| `supabase/migrations/046_enable_rls_scorecard_tables.sql` | RLS fix (see Section 5) |
| `supabase/migrations/051_scorecard_verification_reconciliation.sql` | `scorecard_uploads` verify/reconciliation columns + `scorecard_reconciliation_log` table (see Section 14) |
| `src/app/api/matches/[id]/verify-scorecard/route.ts` | Mark scorecard verified (see Section 14; auth widened to top performers in Section 15) |
| `src/app/api/matches/[id]/flag-reconciliation/route.ts` | Report/resolve a stats discrepancy (see Section 14; auth widened to top performers in Section 15) |
| `src/app/matches/history/[bookingId]/page.tsx` | Standalone shareable match page — now also renders the verify/flag block (Section 15), not just a read-only scorecard |
| `src/lib/matchTopPerformers.ts` | Top-performer computation + resolution (Section 15) — `computeTopPerformers()`/`resolveMatchTopPerformers()` for authorization (tie-inclusive), `computeMatchMVP()`/`resolveMatchMVP()` for the single-target share list |
| `src/lib/scorecardAuth.ts` | Shared `canActOnScorecard()` auth helper (Section 15) |
| `src/components/matches/ScorecardVerifyPanel.tsx` | Shared verify/flag UI, extracted from `MatchHistoryClient.tsx` (Section 15) |
| `src/components/matches/MatchVerifyBlock.tsx` | Standalone page's client state wrapper (Section 15) |
| `src/components/matches/PerformerShareButton.tsx` | Wrangler-only share button (Section 15) |
| `spartans-python/api.py` | FastAPI wrapper — `/parse-scorecard`, `/fetch-and-parse-scorecard`, `/health` |
| `spartans-python/scripts/import_to_supabase.py` | `raise_on_error` param added — silent-failure bug fix |
| `spartans-python/utils/csv_writers.py` | `HOUSE_NAME = "SPARTANS"` constant — house system is defunct, replaced the old per-player house lookup |
| `spartans-python/utils/field_config.py` | `PDFLayoutConfig.LAYOUT_RULES` corrected to pages 3,4 (was 2,3) — see Section 3.1 note; the real cause of bowling/fielding always coming back empty |
| `spartans-python/utils/mvp_calculator.py` | Source of the `mvp_score` formula (`MVPCalculator`) written into `batting_stats`/`bowling_stats`/`fielding_stats` at parse time — untouched, but now the reference implementation `computeMatchMVP()` (Hub side) mirrors the *sum* of, not the formula itself — see Section 15 |

---

## 12. Environment Variables

Add to Vercel (never `NEXT_PUBLIC_` — all server-side only):

```
ANALYTICS_SUPABASE_URL     = <analytics Supabase project URL>
ANALYTICS_SUPABASE_KEY     = <analytics Supabase service role key>
MICROSERVICE_URL           = <Render app URL for spartans-python/api.py>
MICROSERVICE_SECRET        = <shared secret, same value set on Render>
```

On Render (`spartans-python`):

```
SUPABASE_URL         = <analytics Supabase project URL — must be the API
                        URL, e.g. https://<ref>.supabase.co, not a
                        dashboard URL — this was a real bug hit once>
SUPABASE_KEY         = <analytics Supabase SERVICE ROLE key, not anon —
                        also a real bug hit once, caused RLS violations>
MICROSERVICE_SECRET  = <same value as Hub's MICROSERVICE_SECRET>
```

---

## 13. Known Gaps / Follow-on

| Item | Status |
|---|---|
| `match_stats_cache` / `scorecard_uploads` RLS disabled | ✅ Fixed 2026-07-15, migration `046` |
| Migrations `044`–`046` applied but not checked in | ✅ Fixed 2026-07-15, this doc pass |
| Vercel Hobby cron duration risk on `backfill-scorecards` (`MAX_PER_RUN=5` vs. 60s ceiling) | ✅ Fixed 2026-07-16 — risk confirmed live (a run 504'd after 3/5 bookings), `MAX_PER_RUN` lowered to 3 — see Section 8 |
| `backfill-scorecards` never actually firing on its Vercel schedule (~33-booking backlog accumulated, mid-March–July) | ✅ Fixed 2026-07-16 — GitHub Actions backstop added (`.github/workflows/cron-backfill-scorecards.yml`); backlog drained via `/admin/scorecard-backfill` — see Section 8 and `pending-backlog.md` S-8 |
| Wrong PDF uploaded — admin override | ✅ Done — "Reset Upload" / `DELETE /api/admin/matches/[id]/post-match` |
| `import_from_dict` on `SupabaseImporter` | ✅ Done, live on Render |
| CricHeroes match URL backfill for pre-existing bookings | ⏳ See `pending-backlog.md` E-3 — separate, ongoing coordinator task |

---

## 14. Scorecard Verification & Reconciliation (added 2026-07-28)

### Overview

A manual "does this match the real CricHeroes scorecard?" check, layered on
top of everything above without touching the forward-only `status` column
(`pending_parse → parsed → synced → fees_applied`) and without ever
reversing an applied fee. Two independent, **mutually exclusive** flags:

- **Verified** — a captain/VC (own booking) or wrangler/admin (any booking)
  confirms the synced stats match CricHeroes. Pure confidence flag, no
  reprocessing.
- **Flagged for reconciliation** — the same audience reports a discrepancy
  with a required note. This re-queues the booking into the existing
  backfill pipeline (Section 8) regardless of its current status —
  including `fees_applied`, which the reprocessing itself never touches —
  and jumps that queue ahead of routine never-synced backlog. Clears
  itself automatically the next time the booking re-syncs successfully; an
  admin can also clear it manually without reprocessing (a false-alarm
  override).

Flagging clears any prior `verified`; verifying is rejected server-side
while flagged — so a match is never both at once.

### Database — migration `051_scorecard_verification_reconciliation.sql`

New columns on `scorecard_uploads`: `verified boolean`, `verified_by`,
`verified_at`, `needs_reconciliation boolean`, `reconciliation_note`,
`reconciliation_flagged_by`, `reconciliation_flagged_at`.

New immutable audit table, same insert-only pattern as `availability_audit`:

```sql
CREATE TABLE scorecard_reconciliation_log (
  id, booking_id, action ('flagged'|'resolved'), note,
  actor_id  -- nullable; null = system (e.g. an auto-resolve on re-sync)
  created_at
)
```

RLS enabled on the new table, no anon/authenticated policies — same
blanket-deny pattern as `scorecard_uploads` itself (Section 5).

### API Routes

See the rows added to Section 7's table:
`POST /api/matches/[id]/verify-scorecard` and
`POST`/`DELETE /api/matches/[id]/flag-reconciliation`.

### Backfill integration

`backfillOneBooking()` (`src/lib/scorecardBackfill.ts`) clears
`needs_reconciliation` and writes a `'resolved'` audit row (`actor_id:
null`) the moment a re-sync succeeds — no admin click needed in the common
case. `/api/cron/backfill-scorecards`'s eligibility query widens from "not
yet synced" to include any `needs_reconciliation = true` booking regardless
of status, sorted first (Section 8). `/api/admin/scorecard-backfill` does
the same widening/sorting and additionally surfaces the note, who flagged
it, and when, in its own "⚠ Needs Reconciliation" section above the regular
list — with an admin-only "Resolve" action that clears the flag without
re-running the fetch.

### UI — `MatchHistoryCard`

- **Any viewer**, once verified: a read-only right-aligned line — "Stats
  verified with [CricHeroes icon]" — using a scalloped-seal "verified"
  badge (`VerifiedBadge`; the familiar Twitter/X shape — two rounded
  squares offset 45° with a checkmark) rather than a bare tick. **Not**
  gated to `can_upload` — everyone should be able to see a scorecard's
  been checked, not just the people who could check it.
- **Captain/VC/wrangler/admin only**, while not yet verified and not
  flagged: a checkbox prefixed to "Mark Scorecard as Verified with
  [CricHeroes icon]" — ticking it (or clicking the text) calls the verify
  route. Underneath, "🔔 Notify stats discrepancy" (renamed during
  development from an earlier "Flag for Reconciliation" + 🚩) opens a note
  field and calls the flag route. This whole block disappears the moment
  the match is verified — see the always-visible line above instead.
- **The CricHeroes icon is one real, independently-clickable link**
  (`CricHeroesInlineLink`) reused across both lines above — opens the
  match's CricHeroes page in a new tab, unrelated to the verify/notify
  action sitting next to it. The icon row's own separate CricHeroes link
  (Section 9) is hidden whenever one of these lines is about to show the
  same icon, so a card never shows two copies of it.
- **Flagged**: a banner above the result strip ("🔔 Stats Discrepancy
  Reported" + the note + who/when) visible to every viewer, plus a small
  "will clear automatically once re-synced" line for the privileged
  audience in the same spot the checkbox/notify controls would otherwise
  render.
- **Ground icon removed** from the icon row (Section 9) — the ground name
  under the opponent was already the clickable Maps link.
- **Tournament name is now a hyperlink** (Section 9) into `/leaderboard`
  ("Yours Statistically"), pre-filtered to
  `?tournament=<id>&category=mvp&year=all`. `year=all` because the
  leaderboard page's own default is the current calendar year, which would
  otherwise silently hide an older tournament; `category=mvp` rather than
  `milestones` because the Milestones tab resets/ignores tournament scoping
  entirely (see `LeaderboardFilters.tsx`).
- **`roleFilter` on `/matches/history` now defaults to `'played'`** ("I
  Played") for a viewer with a `playerId`, instead of `'all'` — a much
  smaller default result set, for a faster first paint. Falls back to
  `'all'` for a viewer with no `playerId` (the "I Played"/"I Led" chips
  aren't even rendered for them, and the API returns nothing for those
  filters without one).

### Security (vibe-security)

See the rows added to Section 10's checklist — per-booking auth reused
from the upload/sync routes, Zod-validated note, server-side mutual
exclusivity, and RLS on the new table.

### File Map additions

See the rows added to Section 11 — `verify-scorecard/route.ts`,
`flag-reconciliation/route.ts`, and migration `051`.

### Pending

| Item | Notes |
|---|---|
| No known gaps yet | Feature is fresh as of this pass — worth a follow-up note here once it's been exercised through a real cycle (a captain flags something for real, the cron/backfill picks it up, it auto-resolves). |

---

## 15. Top-Performer Verification Access (added 2026-07-28)

### Why

Section 14's verify/flag audience (captain/VC of the booking, or
wrangler/admin for any booking) doesn't scale well as the only recruiting
pool for manual verification — wranglers already have plenty to do, and a
match's captain/VC aren't necessarily the best-placed people to notice a
scorecard discrepancy. This extends the same two actions (mark verified /
flag a discrepancy) to **this match's own top performer** — whoever topped
batting (most runs) or bowling (most wickets) *for that match alone* — on
the theory that the standout player already has a reason to look closely at
their own scorecard, and asking them doubles as a small recognition
gesture.

Deliberately **not** a standing role: a player who topped one match's
scorecard gets no permission on any other match. Access is recomputed live
from `match_stats_cache` on every request, never granted-and-stored, so it
can't go stale or be revoked-and-forgotten.

> **Updated 28 Jul 2026:** the paragraph above still describes
> *authorization* exactly as shipped — `canActOnScorecard()`/`can_verify`
> remain tie-inclusive (every player tied for top runs or top wickets keeps
> real verify/flag access). What changed is which of them the wrangler's
> share button actually messages — see "Share target — narrowed to a single
> match MVP" below.

### "Top performer" — reuses the existing scorecard highlight, doesn't invent a new one

`src/lib/matchTopPerformers.ts`'s `computeTopPerformers()` is a direct port
of the `isTop` logic `ScorecardTables.tsx` already used to render gold text
on the highest run-scorer and highest wicket-taker — same filters (skip
`did_not_bat` / zero-overs rows), same strict-max comparison, same
all-ties-included behaviour (a tied top score highlights every player who
hit it, not an arbitrary single "winner" — unlike `summarizeStats()`'s
single-pick reduce in the history list route, which stays as its own
display-only convenience and is intentionally not reused for this). Each
row is resolved to a Hub `player_id` the same way `ScorecardTables.tsx`
already resolves CricHeroes links: prefer the analytics row's own
`player_id` (set once reconciled, see `player-identity-resolution.md`),
else fall back to a case-insensitive name match against the booking's own
squad. Opponent players and unreconciled rows resolve to `player_id: null`
and simply aren't grantable — there's no Hub account to grant to.

An all-rounder who tops both batting and bowling in the same match is one
performer, not two — the share button (below) dedupes by `player_id` and
combines both stat lines into one message.

**As of 28 Jul 2026, `computeTopPerformers()` feeds authorization only**
(`can_verify` / `canActOnScorecard()`) — it no longer feeds the share
button's target list. See the next subsection.

### Share target — narrowed to a single match MVP (added 28 Jul 2026)

`computeTopPerformers()` above is intentionally tie-inclusive — a match
with three bowlers tied at 2 wickets each surfaces all three as
`top_performer`s, because that's correct for *authorization* (any of them
genuinely earned verify/flag rights). It turned out to be the wrong input
for the wrangler's **share list** though: a real match hit exactly this
case (three bowlers tied at 2/16, 2/26, 2/17) and the "Request top
performer to verify" panel showed three separate WhatsApp targets for one
scorecard, when the ask should go to one person — the actual match MVP,
not everyone who happened to tie on one raw stat.

`computeMatchMVP()` (same file) is the fix. It sums the CricHeroes MVP
formula's `mvp_score` column — already computed per player per stat
category by spartans-python's `MVPCalculator` (`utils/mvp_calculator.py`)
at parse time and already flowing into `match_stats_cache.batting` /
`.bowling` / `.fielding` unchanged — across all three categories for each
player, and returns only the strict-max total. `computeMatchMVP()` does
**not** re-derive the MVP formula itself (batting-position strength,
strike-rate bonuses, wicket value by match type, multi-wicket and maiden
bonuses, fielding assist multipliers) — that stays a single source of
truth inside `spartans-python`; the Hub side only sums the `mvp_score`
values that formula already wrote. Ties are only ever a genuine exact-float
match, which the formula's various bonuses make vanishingly rare in
practice — realistically this returns exactly one performer per match.

Deliberately scoped to **this booking's own squad only**: a row that can't
be resolved to a Hub `player_id` (almost always an opponent) is excluded
before the max is taken, not filtered out afterwards. `computeTopPerformers()`
tolerates an unresolvable top-tied entry because its other ties usually
still include an own-team player; a single MVP pick has no such fallback —
without this scoping, a genuine match-wide MVP on the opposing side (who
has no Hub account to grant access to or message) could silently zero out
the whole share list even when one of our own players had a very good day.

This does **not** change who is allowed to verify or flag a scorecard —
`can_verify` and `canActOnScorecard()` both still key off the tie-inclusive
`computeTopPerformers()` result (see the update note in the previous
subsection), so the other tied bowlers who aren't picked as the share
target keep their own real access if they open the match page directly.
Only the array serialized as `top_performers` in `/api/matches/history` —
which is what `PerformerShareButton` iterates — is now MVP-scoped. The
match-card highlight line (top batter + top bowler, via `summarizeStats()`
in the same route) is a separate, always-unrelated computation and is
unaffected either way — a match still visibly credits its top batter and
top bowler there even when one of them isn't the share target.

### Authorization — `src/lib/scorecardAuth.ts`

`canActOnScorecard(supabase, bookingId, user)` replaces the auth blocks
that used to live separately (and had started to drift) inside
`verify-scorecard` and `flag-reconciliation`. Three independent ways in,
any one sufficient:

1. `isWrangler || isAdmin` — any booking
2. captain/VC of **this** booking (`squad` row lookup scoped to
   `booking_id` + `player_id`, never a role-only check)
3. this booking's own resolved top performer (`resolveMatchTopPerformers()`,
   the server-side counterpart of `computeTopPerformers()` for routes that
   only have a `booking_id` in hand, not the batting/bowling arrays already
   in memory)

Both `POST /api/matches/[id]/verify-scorecard` and
`POST`/`DELETE /api/matches/[id]/flag-reconciliation` call this same
function — see the rows added to Section 10's checklist. A top performer
can do everything a captain/VC could already do on their own match: mark
verified, or flag a discrepancy with a note. Nothing about `fees_applied`,
scorecard upload, or sync eligibility (`can_upload`) is widened by this —
those stay exactly as scoped in Sections 4 and 7. This function is
unaffected by the MVP narrowing above — it still resolves via
`resolveMatchTopPerformers()`/`computeTopPerformers()`, not
`computeMatchMVP()`.

### Known gap — the top-performer grant requires a populated `squad`

`resolveSquadMatch()` (`src/lib/matchTopPerformers.ts`) is the only place a
scorecard row gets turned into a Hub `player_id`, and both of its branches
depend on the `squad` array passed in:

```ts
function resolveSquadMatch(row, name, squad) {
  const rowPlayerId = pickField(row, ['player_id'])
  if (rowPlayerId) {
    const byId = squad.find(p => p.player_id === rowPlayerId)  // still needs squad
    if (byId) return byId
  }
  const byName = squad.find(p => p.player_name...=== name...)  // name fallback, also needs squad
  return byName ?? null
}
```

Note the first branch: even when the analytics row already carries a
`player_id` resolved via `player_name_aliases`/`match_name_overrides` (see
`player-identity-resolution.md`), the code doesn't trust that value
directly — it still requires finding that same `player_id` inside the
`squad` array before returning a match. If a booking has **no `squad`
rows at all** (e.g. it was never staffed through Captains Corner, or its
squad was wiped/never backfilled), `squad` is `[]`, so both branches
return `null` for every batting/bowling row — regardless of how well the
name is already reconciled.

Knock-on effects, all traced through the actual code, not just this
route:

- `resolveMatchTopPerformers()` → every performer resolves to
  `player_id: null` → `topPerformerPlayerIds()` returns an empty `Set` →
  the third path in `canActOnScorecard()`
  (`topPerformerPlayerIds(performers).has(user.playerId)`) is
  unconditionally `false`. No one can gain verify/flag access as "the top
  performer" on a squad-less booking.
- The **second** path in `canActOnScorecard()` — captain/VC of the
  booking — is a `squad` row lookup scoped to `booking_id` + `player_id`
  and *also* fails with zero squad rows, so nobody qualifies as captain/VC
  either.
- `computeMatchMVP()` uses the same `resolveSquadMatch()`/`ensure()` gate,
  so `PerformerShareButton`'s "Request top performer to verify" list would
  also come back empty for a squad-less booking.

**Net effect:** with no squad, `canActOnScorecard()` (and therefore
`can_verify`, `verify-scorecard`, `flag-reconciliation`) only succeeds via
the first path — `isWrangler || isAdmin`. This is consistent with the rest
of the feature (a `squad` row is how the app knows who was in the team at
all), but it's worth flagging explicitly here because a scorecard can be
synced and displayed on `/matches/history` without ever having a squad
(e.g. matches predating squad selection, or ones only reached via the
CricHeroes-fetch backfill path) — those matches silently reduce to
wrangler/admin-only verification with no UI cue explaining why the
verify/flag controls and share button aren't showing up.

Not yet fixed — flagged here so it isn't mistaken for a live bug report.
The fastest path to closing it, if it's ever prioritized, is populating
`squad` for the booking (e.g. via `/wrangler/backfill-squad`) rather than
changing `resolveSquadMatch()` itself, since requiring squad membership to
grant access is the correct security posture — the alternative (trusting
a bare `player_id` off the analytics row with no squad cross-check) would
let anyone whose name happens to alias-match get access even for a match
they were never part of.

### Where the performer actually acts — the standalone match page

`/matches/history/[bookingId]/page.tsx` (previously a read-only share page
with no verify/flag controls at all) now renders the same
`VerifiedStatusLine` / `ReconciliationControls` blocks the list page's
`MatchHistoryCard` does, gated by a page-local `canAct` boolean that
mirrors `canActOnScorecard()` exactly (server-recomputed from data already
fetched for the page — no extra round trip). This is deliberate: it's the
link a wrangler's share button (below) points a top performer at, so the
destination needed the actual controls, not just a read-only scorecard.

To avoid the two surfaces (list card, standalone page) drifting on what
"verify this scorecard" looks like, the shared UI —
`CricHeroesIcon`/`CricHeroesInlineLink`/`VerifiedBadge`/`NotifyIcon`/
`VerifiedStatusLine`/`ReconciliationControls` — was extracted out of
`MatchHistoryClient.tsx` into `src/components/matches/ScorecardVerifyPanel.tsx`,
and both surfaces import from there now. `ReconciliationControls` takes a
minimal `VerifiableMatch` shape (`booking_id`, `cricheroes_url`,
`needs_reconciliation`, `reconciliation_note`) rather than the list page's
full `MatchSummary`, and an `onPatch(patch)` callback instead of
`onMatchPatch(bookingId, patch)` — the standalone page's own
`MatchVerifyBlock.tsx` is a small client wrapper holding local state for
that one booking (no list to patch into).

### `can_verify` — a narrower sibling of `can_upload`, not a widening of it

`GET /api/matches/history` gained two new per-booking fields:

- `can_verify: boolean` — `can_upload` OR the signed-in viewer is this
  match's own resolved top performer (tie-inclusive — see
  `computeTopPerformers()` above). **Deliberately a separate field, not a
  widened `can_upload`** — a top performer gets verify/flag rights only,
  never scorecard upload/sync rights, which stay scoped to captain/VC/
  wrangler/admin exactly as before.
- `top_performers: { player_id, name, reason, statLine, whatsapp }[]` —
  **as of 28 Jul 2026, this match's single MVP** (see "Share target —
  narrowed to a single match MVP" above), computed by `computeMatchMVP()`
  from the `batting`/`bowling`/`fielding` arrays already fetched for
  `summarizeStats()`, plus the same batched `squad` roster query
  (`player_id, players(name, whatsapp)` per booking on the page, same
  one-round-trip-for-the-whole-page pattern as the existing `rolesRes`
  query) used to resolve names to Hub player IDs. Note this field is now
  computed from a *different* function than the one driving `can_verify`
  directly above — `can_verify` intentionally stayed on the broader
  tie-inclusive `performers` result computed in the same route, not on
  this narrowed array, so narrowing the share list couldn't accidentally
  narrow real access too. `whatsapp` is fetched for every booking
  regardless of viewer but redacted to `null` in the response unless the
  viewer is `isWrangler || isAdmin` — the share button that actually uses
  it is wrangler-only, but the API response is redacted independently
  rather than trusting the client to just not render it (same posture as
  `emergency_contact_phone` elsewhere in this app: "never returned to
  client" for a non-privileged role).

`MatchHistoryCard`'s verify/flag block now gates on `match.can_verify`
instead of `match.can_upload` (upload/sync buttons elsewhere on the card
are untouched, still `can_upload`-gated).

### Share button — wrangler-only, WhatsApp-first

`src/components/matches/PerformerShareButton.tsx`, rendered on
`MatchHistoryCard` only when `isWrangler` (deliberately narrower than the
usual `isWrangler || isAdmin` pairing used everywhere else in this app —
an explicit product decision, not an oversight) and the match has at least
one resolved top performer and isn't already verified or flagged. As of
28 Jul 2026 that list is the single match MVP (occasionally an all-rounder
combining a batting and a bowling line into one row, or — vanishingly
rarely — a genuine exact-float tie), not the full tie-inclusive top-scorer/
top-bowler set. Button label: **"Request top performer to verify"**.
Tapping it opens a small panel per resolved performer with:

- an italicised preview of the exact message text (see below), shown
  inline so the wrangler can read it before sending anything — added
  after the first cut only showed the performer's name and stat line,
  leaving the actual wording invisible until WhatsApp opened
- a single WhatsApp icon (no separate "Copy link" button) that opens
  `wa.me/<digits>?text=...` addressed directly to the performer's own
  `players.whatsapp` number (digits-only, non-digit characters stripped
  defensively) with the message pre-filled — unlike every other WhatsApp
  nudge in this app (all destination-free `wa.me/?text=...`, sender picks
  the recipient), this message is only ever meant for one specific person,
  so auto-targeting is the right call here. Falls back to the
  destination-free form when the performer has no WhatsApp number on
  file, so the icon still does something rather than being dead — the
  tooltip says so explicitly in that case
- a direct link to `/matches/history/<bookingId>` appended after the
  message text

**Message content** — `buildMessageText()` addresses the performer by
**first name only** (`firstName()` splits on whitespace — "Hi Kushal,"
not "Hi Kushal Vidya,", which read like a database field rather than a
person greeting them) and names the match's date and tournament
explicitly (never "today" — a wrangler could easily send this a day or
two after the match), using the same short-date convention as
`availability-nudge.md`'s design constraint ("Sun 19 Jul", not a relative
phrase):

```
Hi <first name>,

🏆 Great knock in <tournament> on <Sun 19 Jul>! <statLine> — well played 👏

Even as you relive the moment, could you help us out by checking the
*full match scorecard* on the Hub against CricHeroes — not just your own
numbers — and mark it verified (or flag anything that looks off)?

<link>
```

"Relive" over "rejoice": "rejoice in the moment" reads more formal/
declarative for a casual WhatsApp message, and — since this can be sent a
day or two after the match, never assumed to be "today" — "relive" fits a
look-back better than "rejoice", which implies celebrating something still
happening. "Not just your own numbers" was added after a real ambiguity:
the message is built entirely around the performer's individual stat line,
so without an explicit disclaimer a reader could easily assume the ask is
"check your own score is right" rather than "check the whole team's
scorecard on the Hub against CricHeroes." `*full match scorecard*` uses
WhatsApp's own `*bold*` markdown so the clarifying phrase actually stands
out in the sent message, not just in the source.

Falls back to just the date (drops the "in \<tournament\>" clause) when the
booking has no tournament assigned. "knock"/"bat" swap to "spell"/"ball"
for a top wicket-taker. An all-rounder who tops both gets one row with
both stat lines combined (see `dedupePerformers()`) rather than two
separate messages.

The button doesn't grant anything itself — `canActOnScorecard()` already
grants the performer access independently of whether anyone ever taps
share. It exists purely so a wrangler doesn't have to explain "go to
Past Matches, find the card, expand it, tap verify" over WhatsApp by hand.

### Security (vibe-security)

See the rows added to Section 10's checklist. In particular: the
top-performer grant is re-derived server-side on every request from
`match_stats_cache` + `squad` (never trusted from the client or from
anything the list/detail API responses send down), is scoped to the one
booking it was computed for, and never widens `can_upload`/fee/sync
eligibility — only the two actions Section 14 already exposed to
captain/VC. `top_performers[].whatsapp` is redacted to `null` server-side
for any viewer who isn't `isWrangler || isAdmin`, regardless of what the
share button itself would or wouldn't render — see the `can_verify`
section above. The MVP narrowing added 28 Jul 2026 only changes which
player(s) a wrangler is nudged to message — it never widens or narrows the
real `can_verify`/`canActOnScorecard()` grant, which stays on the separate,
tie-inclusive `computeTopPerformers()` path.

### File Map additions

| File | Role |
|---|---|
| `src/lib/matchTopPerformers.ts` | `computeTopPerformers()` (pure, mirrors `ScorecardTables.tsx`'s `isTop` highlight; feeds authorization) + `resolveMatchTopPerformers()` (server-side auth resolver) + `computeMatchMVP()` (pure, sums `mvp_score` across batting/bowling/fielding per squad member, strict-max; feeds the share list) + `resolveMatchMVP()` (server-side MVP resolver, for any future caller with only a `booking_id`) |
| `src/lib/scorecardAuth.ts` | `canActOnScorecard()` — shared per-booking auth for verify-scorecard and flag-reconciliation, now including the top-performer grant |
| `src/components/matches/ScorecardVerifyPanel.tsx` | Extracted shared UI (icons, `VerifiedStatusLine`, `ReconciliationControls`) — used by both `MatchHistoryClient.tsx` and the standalone match page |
| `src/components/matches/MatchVerifyBlock.tsx` | Client state wrapper for the standalone page's verify block |
| `src/components/matches/PerformerShareButton.tsx` | Wrangler-only share button — WhatsApp icon per resolved top performer (single match MVP as of 28 Jul 2026), auto-targeted to their own number |
| `src/components/matches/BallIcon.tsx` | Red/white/pink cricket ball icon, extracted out of `MatchHistoryClient.tsx` so `PerformerShareButton.tsx`'s wicket-taker row uses the same icon as the card's own top-bowler line, not a generic emoji |

### Pending

| Item | Notes |
|---|---|
| Share list surfaced every tied top scorer/bowler instead of one MVP | ✅ Fixed 28 Jul 2026 — see "Share target — narrowed to a single match MVP" above. `computeMatchMVP()` added to `matchTopPerformers.ts`; `top_performers` in `/api/matches/history` now built from it instead of the tie-inclusive `computeTopPerformers()`. `can_verify`/`canActOnScorecard()` deliberately left unchanged. |
| `computeMatchMVP()` picked the wrong player when the true MVP's scorecard name didn't byte-match their squad name | ✅ Fixed 31 Jul 2026 — see the incident write-up below. Resolution order flipped: max-then-resolve, not resolve-then-max. |
| No other known gaps | Fresh as of this pass — worth a follow-up note here once a real top performer has actually verified or flagged a scorecard through this path. |

> **Incident (28 Jul 2026) — stale `match_stats_cache` silently hid the
> verify/share controls on a already-`synced` match, with no self-service
> way to fix it.** The 11 Jul PSG Champions Trophy match (vs Republic Of
> Whitefield CC) synced on 14 Jul — *before* five of its scorecard names
> ("Sagar", "Ashish Gupta", "Kathiresh", "Nagarjun H", "DS Sakketha") were
> reconciled via `/admin/player-reconciliation`. `player-identity-resolution.md`
> §5 already documents that rows synced before reconciliation carry
> `player_id: null` "until the next sync" — but there was no UI path to
> trigger that next sync once a booking was already `synced`:
> `ScorecardUploadButton`/the "Sync Stats" button (`MatchHistoryClient.tsx`,
> the admin Post-Match panel) only rendered for `parsed` status, and
> `/admin/scorecard-backfill` only lists bookings not yet
> `synced`/`fees_applied`. Result: `computeTopPerformers()` couldn't resolve
> a `player_id` for either the top scorer or top wicket-taker (the
> analytics-scraped names don't exactly match the squad's full names, so the
> case-insensitive fallback also missed), `top_performers.some(p =>
> p.player_id)` was false, and `showsPerformerShare` never rendered even for
> the wrangler viewing it — despite `can_verify`/`showsVerifyAction` being
> true the whole time. Fixed by re-syncing that one booking (idempotent —
> `syncMatchStatsForBooking()` just re-reads the analytics DB, which by then
> had all five names correctly aliased) and by adding a permanent secondary
> "Re-sync stats from Analytics DB" affordance for `can_upload` viewers
> whenever `scorecard_status === 'synced'`, in both `MatchHistoryClient.tsx`
> and the admin Post-Match panel (`src/app/admin/bookings/[id]/page.tsx`) —
> deliberately **not** offered once `fees_applied`, matching a second fix in
> `matchStatsSync.ts` itself: the status-flip at the end of a sync now has
> `.neq('status', 'fees_applied')`, so a re-sync can never regress the
> forward-only status machine back to `synced` and make a fees-applied
> booking look eligible for another fee debit.

> **Incident (31 Jul 2026) — `computeMatchMVP()` surfaced the wrong player
> as match MVP on a real match, not just an empty share list.** A club
> coordinator asked why Tejas Lengade (MVP score 2.3) was shown as the top
> performer for the 12 Apr Blendin practice game (booking `13b951c8`) when
> Keshav Renganathan (33 runs + 2 wickets, true MVP 6.74) and Aarit
> Srivatsava (45 runs, MVP 4.5) clearly outscored him. Root cause: the
> first cut of `computeMatchMVP()` (see the 28 Jul entry above and the
> function's own header comment) resolved each scorecard name to a Hub
> `player_id` **before** taking the max, dropping any candidate that
> couldn't resolve. Keshav's and Aarit's CricHeroes scorecard names
> ("Keshav", "Aarit S") don't byte-match their full Hub squad names
> ("Keshav Renganathan", "Aarit Srivatsava") — a case
> `player-identity-resolution.md`'s alias table already had covered
> correctly, but this booking's `match_stats_cache` predated that
> reconciliation and was still carrying `player_id: null` for every row
> (the exact same stale-cache class as the 28 Jul incident above, just
> with a worse symptom this time: instead of an empty share list, the
> function silently substituted a lesser, resolvable candidate — Tejas,
> whose scorecard name happens to equal his squad name exactly — and
> reported him as "the MVP" with full confidence). Confirmed via direct
> query: `batting_stats`/`bowling_stats`/`fielding_stats` in the analytics
> DB already had correct `player_id`s reconciled for every name in this
> match; only the Hub-side `match_stats_cache` copy was stale. Fixed two
> ways: (1) `computeMatchMVP()` now mirrors `computeTopPerformers()`'s
> order of operations — sum and max across *all* scorecard names first,
> resolve `player_id` only on the winner(s) afterward, so an unresolvable
> winner now correctly yields no share target instead of a wrong one; see
> the updated header comment on `computeMatchMVP()` for the full
> before/after; (2) this one booking's `match_stats_cache` was manually
> re-synced from the analytics DB so it now carries the correct
> `player_id`s — confirmed Keshav now resolves correctly as MVP 6.74.
> Take-away, same as 28 Jul's: a name being present in
> `player_name_aliases` doesn't mean every match that name appears in has
> picked it up yet — only a sync after the alias existed does that.

---

*Maintained by: Spartans CC BLR · Coordinator: Muthu*
*Security audit: vibe-security patterns applied per SKILL.md*
*Analytics pipeline: `spartans-python` repo (Render) · Hub: `spartans-book-a-slot` repo (Vercel)*
