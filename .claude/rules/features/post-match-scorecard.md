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
| Apply match fees | ❌ | ❌ | ❌ | ✅ only |
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
backwards. The scorecard's sync lifecycle (`parsed` / `synced` /
`fees_applied`) is intentionally the quietest thing on the card: a small
icon + caption (`⏳ Awaiting sync`, `✓ Stats synced`, `✓ Fees applied`) sat
inline in the icon row, not a standalone highlighted box — it used to be a
bordered badge and was outshining the actual match result, so it moved.

### Icon row
Left to right: the subtle sync indicator described above (when
`can_upload` and a status exists), a spacer, then Ground (mirrors
`FixturesCard`'s `MapPinIcon`, opens Google Maps), then CricHeroes —
Ground intentionally comes before CricHeroes here, the reverse of
`FixturesCard`'s order. Hidden entirely if none of the three apply. Ball/
jersey icons were removed from this card (they're still on `FixturesCard`
for upcoming fixtures; here they added nothing a completed-match viewer
needed).

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
no upload yet, or a stuck `pending_parse`. Every later state
(`parsed`/`synced`/`fees_applied`) is passive and renders as the subtle
icon-row indicator instead — see above.

### Ground link
`match.ground` comes from a `tournaments → grounds` join added to
`/api/matches/history` specifically for this card, mirroring
`FixturesCard`'s pattern exactly. Falls back to the booking's free-text
`venue` column when no ground record is linked to the tournament.

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
| `src/app/api/matches/history/route.ts` | Paginated match list — `can_upload`, `roles_complete`, `scorecard_status`, `ground` join |
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
| `spartans-python/api.py` | FastAPI wrapper — `/parse-scorecard`, `/fetch-and-parse-scorecard`, `/health` |
| `spartans-python/scripts/import_to_supabase.py` | `raise_on_error` param added — silent-failure bug fix |
| `spartans-python/utils/csv_writers.py` | `HOUSE_NAME = "SPARTANS"` constant — house system is defunct, replaced the old per-player house lookup |
| `spartans-python/utils/field_config.py` | `PDFLayoutConfig.LAYOUT_RULES` corrected to pages 3,4 (was 2,3) — see Section 3.1 note; the real cause of bowling/fielding always coming back empty |

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

*Maintained by: Spartans CC BLR · Coordinator: Muthu*
*Security audit: vibe-security patterns applied per SKILL.md*
*Analytics pipeline: `spartans-python` repo (Render) · Hub: `spartans-book-a-slot` repo (Vercel)*
