# Spartans Hub — System Map
 
**Spartans CC BLR · hub.spartanscricketclub.in**
**Last updated: June 2026 · Synced from project knowledge base**
 
---
 
## 1. Platform Overview
 
Spartans Hub is a unified Club Operations Platform replacing three disconnected tools (WhatsApp, Google Sheets "Spartans Hub", CricHeroes) with a single web application. It is the single source of truth for fixture scheduling, player availability, squad management, and (future) club finances.
 
**Live URLs**
- Hub: `hub.spartanscricketclub.in`
- Legacy stats: `spartanscricketclub.vercel.app` *(to be merged in Sprint 5)*
- Repository: `github.com/spartans-cc-blr/spartans-book-a-slot`
---
 
## 2. Technology Stack
 
| Layer | Technology | Notes |
|---|---|---|
| Frontend & API | Next.js 14 (App Router, TypeScript) | SSR + client components; deployed on Vercel Hobby |
| Database | Supabase (PostgreSQL) | RLS enabled on all tables post-Sprint 2 |
| Auth | NextAuth.js + Google OAuth | JWT-based; player matching via `gmail_id` → `players` table |
| Hosting | Vercel Edge Network | Auto-scaling; Vercel Cron for reservation expiry |
| Notifications | WhatsApp (wa.me links) + Web Push | WhatsApp: manual tap by coordinator; Web Push: implemented June 2026 via web-push + VAPID; Business API deferred to Sprint 5 || External Integration | CricHeroes | Match URLs stored; stats sync planned Sprint 5 |
| Domain | Wix DNS → CNAME → Vercel | `hub.spartanscricketclub.in` |
 
---
 
## 3. User Roles & Access Map
 
| Role | Auth required | Routes accessible | Key capabilities |
|---|---|---|---|
| **Public / Organiser** | None | `/schedule`, `/fixtures/[id]` | View slot grid, view match cards, WhatsApp enquiry link |
| **Player** | Google OAuth | `/fixtures`, `/profile` | Mark Y/O/E/L availability (**N removed** — blank = not available), view announced squad, edit own profile |
| **Captain** | Google OAuth + `is_captain` | `/fixtures`, `/captains-corner`, `/tournament-planner`, `/profile` | All player actions + full availability breakdown, squad selection & announcement, captain bandwidth view |
| **GC (Governing Council)** | Google OAuth + `is_gc` | `/gc-review`, `/tournament-planner` | Approve or return submitted squads; tournament pace overview |
| **Admin (Coordinator)** | Google OAuth + `ADMIN_EMAILS` env var | `/admin/**`, `/tournament-planner`, all above | Full booking CRUD, player management, override all workflows |
 
> **Security note (vibe-security audit):** `isAdmin` is derived from an environment variable — not the database — making it tamper-proof. `isCaptain` and `isGC` are DB-sourced flags written into the JWT at sign-in. Middleware enforces role checks on every protected route server-side.
 
---
 
## 4. Route Architecture
 
### Public Routes
 
| Route | Component | Data source |
|---|---|---|
| `/` | Server component (`page.tsx`) — role-aware split audience landing | `bookings` (counts), `players` (own row), session |
| `/schedule` | Server component | `bookings` (confirmed + soft_block, non-cancelled) |
| `/fixtures` | Server component + `FixturesWeekendGroup` (client) | `bookings`, `availability`, `squad` (announced only) |
| `/fixtures/[id]` | Server component | Single booking + squad; auth-gated share URL |
| `/tournament-planner/share/[tournamentId]` | Public server component (`revalidate=300`) | Single tournament slot-balance card for WhatsApp sharing with organisers; no auth |
| `/login` | NextAuth sign-in page | Google OAuth |
 
### Player Routes (auth required)
 
| Route | Component | Data source |
|---|---|---|
| `/profile` | Server + client form | `players` (own row only — IDOR protected) |
 
### Captain Routes (`isCaptain` or `isAdmin`)
 
| Route | Component | Data source |
|---|---|---|
| `/captains-corner` | Server → `CaptainsCornerGrid` (client) | `bookings`, `players`, `availability`, `squad` |
| `/tournament-planner` | Server → `TournamentPlannerClient` (client) | `bookings`, `captains`, `tournaments` (with `total_league_games`, `cricheroes_points_table_url`) |
 
### GC Routes (`isGC` or `isAdmin`)
 
| Route | Component | Data source |
|---|---|---|
| `/gc-review` | Server → `GCReviewClient` (client) | `bookings`, `availability`, `squad` (pending/approved/announced) |
 
### Admin Routes (`isAdmin`)
 
| Route | Purpose |
|---|---|
| `/admin` | Booking dashboard — all confirmed + soft_block |
| `/admin/bookings/new` | Create confirmed booking or reservation |
| `/admin/bookings/[id]` | Edit, confirm, cancel + WhatsApp notify |
| `/admin/players` | Full player directory management |
| `/admin/captains` | Captain master data |
| `/admin/tournaments` | Tournament master data (includes `total_league_games` and `cricheroes_points_table_url` inputs) |
| `/admin/grounds` | Grounds master data (name, Maps URL, hospital URL) |
| `/admin/soft-blocks/new` | Create reservation (soft block) |
 
---
 
## 5. API Routes
 
### Public APIs
 
| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/availability` | GET | None | Slot availability grid with booking rules applied |
 
### Player APIs
 
| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/player-availability` | GET, POST, DELETE | Player session | Upsert own Y/O/E/L availability (**N removed** — blank = not available); guards: wallet dues block, `checkFreeze()` (blanket Thu lock + squad `pending_approval`/`approved`/`announced`); captains/GC/admin bypass freeze; auto-reactivation; audit log |
| `/api/players/[id]` | PATCH | Own session (allowlisted fields) | Self-edit profile fields; `wallet_balance`, `is_captain`, `status` silently dropped |
 
### Captain APIs
 
| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/squad` | GET, POST | Captain or Admin | Fetch squad; save draft (delete-and-reinsert pattern) |
| `/api/squad/submit` | POST | Captain or Admin | Flip draft → `pending_approval` |
| `/api/squad/announce` | POST | Captain or Admin | Flip approved → `announced` (requires prior GC approval) |
| `/api/captain-availability` | GET, POST | Captain or Admin | Override player availability — flat route, **not** nested under `/api/captain/`; `AddPlayerPanel` proxy flow; audit log |
| `/api/availability/weekend` | GET | Captain or Admin | Powers Captains Corner grid |
| `/api/squad/[booking_id]` | GET | Captain / GC / Admin / Family session | Returns squad with `phone` field conditionally included server-side by tier |
 
### GC APIs
 
| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/gc/weekend-review` | PATCH | GC or Admin | `approved` → `pending_approval` → `approved`; `returned` → `draft` |
 
### Admin APIs
 
| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/bookings` | GET, POST, PATCH, DELETE | Admin | Booking CRUD |
| `/api/bookings/reserve` | POST | Admin | Create soft_block reservation |
| `/api/validate` | POST | Admin | Live rule validation during booking form entry |
| `/api/captains` | GET, POST, PATCH | Admin | Captain master data |
| `/api/tournaments` | GET, POST, PATCH | Admin | Tournament master data; PATCH also used by `InlineGameCountEditor` in Tournament Planner to update `total_league_games`; POST/PATCH both handle `cricheroes_points_table_url` |
| `/api/players` | GET, POST, PATCH | Admin | Full player directory management |
| `/api/wallet/transactions` | POST | Admin | *(Planned Sprint 3)* Isolated wallet balance writes with immutable log |
 
### Family Auth APIs *(Planned — U-24)*
 
| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/family-auth/login` | POST | None (rate-limited by IP) | Phone number matched against `emergency_contact_phone` for squad players on a booking; issues booking-scoped session cookie |
 
### Cron / System APIs
 
| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/cron/expire-reservations` | GET | `CRON_SECRET` bearer | Daily at 18:30 UTC — delete expired `soft_block` rows |
| `/api/cron/lock-availability` | GET | `CRON_SECRET` bearer | Thursday at 02:30 UTC (08:00 IST) — blanket-lock all confirmed Sat/Sun bookings for the upcoming weekend |
 
---
 
## 6. Database Schema
 
### Core Tables (Live)
 
#### `bookings`
Primary scheduling record.
 
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `game_date` | date | Saturday or Sunday only |
| `slot_time` | text | `07:30` · `10:30` · `12:30` · `14:30` |
| `format` | text | `T20` · `T30` · null for soft_block |
| `status` | text | `confirmed` · `soft_block` · `cancelled` |
| `tournament_id` | uuid FK | → `tournaments.id` |
| `venue` | text | Match ground name |
| `opponent_name` | text | Opposing team |
| `match_id` | text | CricHeroes match reference |
| `cricheroes_url` | text | Direct CricHeroes match link |
| `match_time` | text | Actual start time (may differ from slot) |
| `match_stage` | text | Group / Knockout etc. |
| `reserved_until` | timestamptz | 48 hr expiry for `soft_block` |
| `organiser_name` | text | External organiser (reservations) |
| `organiser_phone` | text | WhatsApp for expiry warnings |
| `notes` | text | Internal admin notes — never shown publicly |
| `availability_locked` | boolean | Thursday blanket-lock flag; set by cron at 08:00 IST for all confirmed Sat/Sun slots; blocks all player writes (POST + DELETE); captains/GC/admin bypass |
| `created_at` / `updated_at` | timestamptz | Auto-managed |
 
**Unique constraint:** `UNIQUE(game_date, slot_time) WHERE status != 'cancelled'`
 
#### `captains`
`id, name, active, player_id (FK → players.id), captain_since (date), inactive_since (date), created_at`

- `player_id` — links SCD captain record to players table. Enables CricHeroes URL, photo, and identity joins. Nullable for legacy rows.
- `captain_since` — date the player was promoted as captain (backfilled from created_at for legacy rows)
- `inactive_since` — date the captain was marked inactive. NULL while active.
 
#### `tournaments`
`id, name, organiser_name, organiser_contact, active, total_league_games, vc_captain_id, cricheroes_points_table_url, created_at`
> `total_league_games` — used by Tournament Planner for bandwidth and pace signals. `vc_captain_id` — links the vice-captain for this tournament (FK → `captains.id`); used in share card and bandwidth view. `cricheroes_points_table_url` — optional URL to the CricHeroes points table for this tournament; when set, the tournament name renders as a hyperlink on fixture cards (`FixturesCard.tsx`) and the Tournament Planner page (`TournamentPlannerClient.tsx`), helping captains and players track standings.
 
#### `grounds`
`id, name, maps_url, hospital_url` — joined into fixture cards and squad announcement text.
 
### Sprint 2 Tables (Live)
 
#### `players`
Full member directory.
 
| Column | Notes |
|---|---|
| `id` | uuid PK |
| `name` | Admin-managed |
| `gmail_id` | OAuth matching key |
| `whatsapp` | Player-editable (with country code) |
| `dob`, `jersey_name`, `jersey_number`, `blood_group` | Player-editable |
| `primary_skill`, `secondary_skill` | Player-editable (17 options) |
| `cricheroes_url` | Player-editable — **drives CricHeroes hyperlinks throughout the app** |
| `photo_url` | Set from Google OAuth on first sign-in |
| `wallet_balance` | Admin-managed; shown amber if negative |
| `dues_override` | Admin-managed boolean; allows player with negative balance to still mark availability |
| `inducted_on`, `referred_by` | Admin-managed |
| `is_captain`, `is_gc` | Admin-managed; surface as JWT token flags |
| `is_vc` | *(Planned U-23)* Vice-captain flag — grants access to emergency contacts |
| `status` | `active` / `inactive` / `expelled` |
| `active` | boolean |
| `emergency_contact_name` | *(Planned U-22)* Player-editable; visible to Captain/VC/GC/Admin only — excluded from general API response |
| `emergency_contact_phone` | *(Planned U-22)* Used by family auth phone matching; never returned to client |
| `emergency_contact_relation` | *(Planned U-22)* |
| `home_location_url` | *(Planned U-16)* Google Maps share link; shown only if `home_location_consent = true` |
| `home_location_consent` | *(Planned U-16)* Default false; controls carpool visibility to squad members |
| `matchcard_call_consent` | *(Planned U-25)* Controls whether fellow players (not family/captain) see call button |
 
**RLS:** Full lockdown — no anon or authenticated SELECT policy. All access via service role through API routes only.
 
#### `availability`
`id, player_id FK, booking_id FK, response (Y/O/E/L), created_at, updated_at`
> N removed — blank row = no response (player is not available or hasn't responded).
**RLS:** Full lockdown — same pattern as `players`.
 
#### `squad`
`id, booking_id FK, player_id FK, status, is_captain, is_vc, is_wk, created_at`
**Unique constraint:** `UNIQUE(player_id, booking_id)`
 
**Status machine:** `draft → pending_approval → approved → announced` (with GC return path back to `draft`)
 
#### `fee_exemptions`
Full lockdown RLS. Joined to `players` in admin view.
 
### Planned Tables (Future Sprints)
 
| Table | Sprint | Purpose |
|---|---|---|
| `family_sessions` | U-24 | Booking-scoped phone-verified sessions for family emergency access; expires at match end |
| `match_participation` | Sprint 4 | Who played in each match |
| `match_fees` | Sprint 4 | Fee totals and organiser payment status |
| `player_dues` | Sprint 4 | Individual dues and payment history |
 
---
 
## 7. Booking Rules Engine
 
All rules live in `src/lib/validation.ts`. Called from both the API (on save) and the client (live feedback during form entry).
 
| Rule | Label | Type | Description |
|---|---|---|---|
| R1 | Weekend Capacity | Error | Max 3 confirmed games per Sat–Sun weekend |
| R2 | Captain Conflict | Warning (overridable) | Captain leading another tournament is already booked this weekend |
| R3 | Tournament Monthly Limit | Error | Max 2 confirmed games per tournament per calendar month |
| R4 | No Duplicate Slot | Error | Same `game_date` + `slot_time` cannot be double-booked |
| R5 | T30 Format Clash | Error | T30 at 07:30 blocks 10:30; T20 at 10:30 blocks 12:30 |
| R6 | 12:30 Overlap | Error | Any game at 12:30 blocks 10:30 and 14:30; T20 at 14:30 blocks 12:30 |
 
**Valid slot/format combinations:**
 
| Format | Valid Slots |
|---|---|
| T30 | 07:30, 12:30 |
| T20 | 07:30, 10:30, 14:30 |
 
---
 
## 8. Key Feature Flows
 
### 8.1 Booking & Reservation Flow
```
Admin → /admin/bookings/new
  → Validate rules (R1–R6) via /api/validate (live)
  → POST /api/bookings → DB write (service role)
  → [soft_block] reserved_until = now() + 48hr
  → [confirmed] WhatsApp notify buttons (organiser + captain)
  → Cron at 18:30 UTC deletes expired soft_blocks
```
 
### 8.2 Player Availability Flow
```
Player → /fixtures → Google sign-in
  → JWT enriched with playerId, isCaptain, playerStatus
  → Y/O/E/L button tap → POST /api/player-availability
  → Guards checked: wallet dues, squad announced, availability_locked
  → Upsert in availability table (service role)
  → If player was inactive → auto-reactivated
  → Button highlights instantly (optimistic UI)
```
 
### 8.3 Squad Selection & Announcement Flow
```
Captain → /captains-corner → SlotCard
  → Selects up to 12 players (hard cap enforced server-side)
  → Assigns C / VC / WK roles
  → POST /api/squad (draft saved — delete-and-reinsert)
  → POST /api/squad/submit → pending_approval
 
GC → /gc-review
  → Sees fairness check (O/E players across slots)
  → PATCH /api/gc/weekend-review → approved or returned
 
Captain → /captains-corner
  → POST /api/squad/announce (requires approved status)
  → Squad visible to all logged-in players on /fixtures cards
  → buildAnnouncementText() → WhatsApp link for Muthu
```
 
### 8.4 CricHeroes Player Hyperlink Pattern
```
players.cricheroes_url (set by player on /profile)
  → Rendered as <a href={cricheroes_url}> wherever player name appears:
      - SelectablePlayerRow in CaptainsCornerGrid (per-slot view)
      - MatrixView column headers (Captains Corner)
      - FixturesCard announced squad panel
      - (pending) availability grids, squad announcements
  → e.stopPropagation() prevents link click from triggering checkbox
```
 
### 8.5 CricHeroes Points Table Hyperlink Pattern
```
tournaments.cricheroes_points_table_url (set by admin on /admin/tournaments)
  → Rendered as <a href={cricheroes_points_table_url}> on tournament name wherever it appears:
      - FixturesCard.tsx — tournament name in match card header
      - TournamentPlannerClient.tsx — tournament name in planner section headers
  → Falls back to plain <span> if URL is null/empty
  → Helps captains and players track standings directly from the fixture card
  → Migration: 021_tournament_cricheroes_points_url.sql
```
 
### 8.6 Tournament Planner Flow
```
Captain / GC / Admin → /tournament-planner
  → TournamentPlannerClient loads bookings + tournaments (with total_league_games, cricheroes_points_table_url)
  → Captain Bandwidth section:
      - Horizontal bar per captain: completed / scheduled / unbooked games
      - Split by Sat/Sun slots for fairness balancing
      - "Balance remaining" suggestion across under-used slots
  → Per Tournament section (collapsible):
      - Tournament name links to CricHeroes points table if URL is set
      - League games: completed (collapsible) + scheduled
      - Average gap in weeks between consecutive games displayed per game + overall
      - Pace signal: Good / Nudge to schedule / Ask to slow down
      - Pre-filled WhatsApp link to organiser when pace action needed
  → Qualifier / Knockout tracking once league completes
```
 
### 8.7 Family Emergency Access Flow *(Planned — U-22 to U-26)*
```
Player → /profile
  → Saves emergency_contact_name / phone / relation
  → Toggles matchcard_call_consent (controls peer call visibility)
 
Family member → /fixtures/[id] (URL shared via club WhatsApp)
  → No Google session → sees "Family Access" panel
  → Enters mobile number → POST /api/family-auth/login
      → Rate-limited by IP (5 attempts / 15 min)
      → Phone matched against emergency_contact_phone for squad players on that booking
      → On match: booking-scoped session cookie issued (expires at match end)
  → Squad panel re-fetched with family tier → full call buttons visible
 
Server-side tier resolution in /api/squad/[booking_id]:
  Public       → no phone field
  Fellow player (no consent) → no phone field
  Fellow player (consented)  → own phone only
  Family session / Captain / VC / GC / Admin → full squad phone fields
```
 
---
 
## 9. Authentication & Security Architecture
 
```
Browser (client components)
    │
    │  fetch('/api/...')   ← only channel to the database
    ▼
Next.js API Routes (server-side)
    │
    ├── createServiceClient()  ← SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
    │       Used by: auth.ts, all /api/* routes
    │
    └── createClient()         ← NEXT_PUBLIC_SUPABASE_ANON_KEY
            Used by: browser client (no direct DB queries)
```
 
### JWT Token Fields
 
| Field | Source | Purpose |
|---|---|---|
| `playerId` | `players.id` matched by `gmail_id` | Player identity |
| `playerName` | `players.name` | Display name |
| `isCaptain` | `players.is_captain` | Captain-gated routes |
| `isGC` | `players.is_gc` | GC-gated routes |
| `isVC` | `players.is_vc` *(planned)* | VC access to emergency contacts |
| `playerStatus` | `players.status` | Expulsion check |
| `isAdmin` | `ADMIN_EMAILS` env var | Admin — **not from DB** |
| `photoUrl` | `players.photo_url` | Avatar |
 
### RLS Policy Summary
 
| Table | Public SELECT | Authenticated SELECT | Writes |
|---|---|---|---|
| `bookings` | ✅ (non-cancelled only) | ✅ (non-cancelled only) | Service role only |
| `captains` | ✅ | ✅ | Service role only |
| `tournaments` | ✅ | ✅ | Service role only |
| `grounds` | ✅ | ✅ | Service role only |
| `players` | ❌ Locked | ❌ Locked | Service role only |
| `availability` | ❌ Locked | ❌ Locked | Service role only |
| `fee_exemptions` | ❌ Locked | ❌ Locked | Service role only |
| `squad` | ❌ *(RLS must be enabled before public exposure)* | ❌ | Service role only |
| `family_sessions` *(planned)* | ❌ Locked | ❌ Locked | Service role only |
 
### Security Checklist Status (vibe-security audit)
 
| Check | Status |
|---|---|
| No secrets with `NEXT_PUBLIC_` prefix | ✅ |
| Auth on all admin write routes (`requireAdmin()`) | ✅ |
| IDOR protection on player self-PATCH | ✅ Field allowlist; wallet/is_captain/status silently dropped |
| Cron job protected by bearer token | ✅ `CRON_SECRET` |
| Security headers on all `/api/*` | ✅ `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` |
| `cricheroes_points_table_url` — read-only URL, no user input trusted client-side | ✅ Admin-only write; rendered as plain `<a href>` |
 
---
 
## 10. Environment Variables
 
| Variable | Prefix | Secret? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | No | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | No | Supabase anon key (safe — RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | None | ✅ Yes | Bypasses RLS — server-side only |
| `GOOGLE_CLIENT_ID` | None | No | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | None | ✅ Yes | OAuth client secret |
| `NEXTAUTH_SECRET` | None | ✅ Yes | JWT signing secret |
| `NEXTAUTH_URL` | None | No | Full deployment URL (required for OAuth callbacks) |
| `ADMIN_EMAILS` | None | No | Comma-separated admin Gmail list |
| `NEXT_PUBLIC_WA_NUMBER` | Public | No | WhatsApp number for organiser links |
| `CRON_SECRET` | None | ✅ Yes | Bearer token for cron job authentication |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | Public | No | VAPID public key for web push subscriptions |
| VAPID_PRIVATE_KEY | None | ✅ Yes | VAPID private key — server-only, never NEXT_PUBLIC_ |
| VAPID_EMAIL | None | ✅ Yes | Must include mailto: prefix e.g. mailto:foo@gmail.com |
 
### Rules enforced
- No secret is prefixed with `NEXT_PUBLIC_` — secrets never enter the client bundle
- `SUPABASE_SERVICE_ROLE_KEY` is marked as Secret in Vercel
- `.env.local` is in `.gitignore` and never committed
---
 
## 11. File Map — Key Source Files
 
| File | Role |
|---|---|
| `src/lib/auth.ts` | NextAuth config; JWT callback enriches token with player context; email lowercased; Google photo seeded on first sign-in; `session.maxAge` + `jwt.maxAge` aligned to 30 days |
| `src/lib/rateLimit.ts` | Upstash Redis sliding-window rate limiter; `RATE_LIMITS` presets: `playerWrite` (20/min), `captainWrite` (30/min), `adminWrite` (60/min), `publicRead` (100/min) |
| `src/lib/supabase.ts` | Three client factories: browser (anon), server (anon), service (bypasses RLS) |
| `src/lib/validation.ts` | Booking rules engine R1–R6; used by both API and client |
| `src/middleware.ts` | Route protection; redirects unauthenticated/unauthorised requests |
| `src/app/fixtures/page.tsx` | Main fixtures server component; fetches bookings, availability, squad; includes `cricheroes_points_table_url` in tournament select |
| `src/app/captains-corner/page.tsx` | Captain-only server page; feeds `CaptainsCornerGrid` |
| `src/app/gc-review/page.tsx` | GC-only server page; feeds `GCReviewClient` |
| `src/app/admin/` | All admin pages (dashboard, new/edit booking, players, captains, tournaments) |
| `src/components/fixtures/FixturesCard.tsx` | Match card display; squad panel; CricHeroes match link; tournament name links to CricHeroes points table if `cricheroes_points_table_url` set |
| `src/components/fixtures/FixturesWeekend.tsx` | Shared weekend state; handles availability API calls |
| `src/components/fixtures/FixturesAvailability.tsx` | Y/N/O/E/L button row; `getBlockReason()` validation |
| `src/components/captains/CaptainsCornerGrid.tsx` | Per-slot and matrix views; squad selection; CricHeroes player links; `AddPlayerPanel` proxy flow |
| `src/app/api/captain-availability/route.ts` | Captain proxy availability override — flat route (not nested under `/api/captain/`); audit log |
| `src/app/api/tournaments/route.ts` | Tournament CRUD; POST explicitly destructures `cricheroes_points_table_url`; PATCH spreads full body |
| `src/components/admin/GCReviewClient.tsx` | Fairness check table; per-slot approval panels |
| `src/app/tournament-planner/page.tsx` | Captain/GC/Admin server page — feeds `TournamentPlannerClient`; caps `.in()` at 100 booking IDs (S-4 partial fix) |
| `src/app/tournament-planner/share/[tournamentId]/page.tsx` | Public server page (`revalidate=300`) — `TournamentShareCard` for WhatsApp sharing with tournament organisers |
| `src/components/tournament-planner/TournamentPlannerClient.tsx` | Bandwidth meter, per-tournament pace timeline, `InlineGameCountEditor` (admin-only inline edit of `total_league_games`), WhatsApp nudge links; tournament name links to CricHeroes points table if URL set |
| `src/components/tournament-planner/TournamentShareCard.tsx` | Public-facing single tournament slot-balance card |
| `src/lib/familyAuth.ts` | *(Planned U-24)* `validateFamilySession()` — re-queries `family_sessions` table; never trusts cookie value alone |
| `src/lib/announcement.ts` | `buildSquadAnnouncement()` — WhatsApp message builder |
| `supabase/migrations/` | All schema migrations as SQL files — source of truth for DB state |
| `vercel.json` | Cron job config + security headers |
| src/lib/webpush.ts | Web push utility — sendPushToPlayer(playerId, payload); VAPID init inside function; 410 cleanup |
| src/app/api/push/subscribe/route.ts | POST — saves browser push subscription; player_id from session only |
| public/sw.js | Service worker — PWA caching + push notification display + notificationclick handler |
| supabase/migrations/009_push_subscriptions.sql | push_subscriptions table — one row per player per device |
 
---
 
## 12. Pending Backlog (Summary)
 
### Captain / Player UX
 
| Task | Priority | Ref |
|---|---|---|
| "taken elsewhere" ghost bug on squad re-edit after GC return (O/E player deselect not clearing `allSelected`) | 🔴 High | U-13 |
| GC Review page — include full `ground` join for announcement text | 🟡 Medium | admin_console |
| Notification to GC when squad submitted for review (WhatsApp/email nudge) | 🟡 Medium | captains_corner |
| Skill role badges (BAT/BOWL/BAT-AR/BOWL-AR) replacing text in squad selection | 🟢 Low | U-18 |
 
### Admin
 
| Task | Priority | Ref |
|---|---|---|
| Admin full schedule view (`/admin/schedule`) | 🟢 Low | admin_console |
| Rule violation badges on admin dashboard | 🟢 Low | admin_console |
| Filter by captain / tournament / month on dashboard | 🟢 Low | admin_console |
| `total_league_games` field on tournament admin form `/admin/tournaments` | ✅ Done | Field is editable both inline in Planner and in admin form |
| CricHeroes points table URL on tournament admin form + fixture card + tournament planner | ✅ Done | `cricheroes_points_table_url` column added; admin form, API route, FixturesCard, TournamentPlannerClient all updated |
 
### Infrastructure
 
| Task | Priority | Ref |
|---|---|---|
| GitHub Org migration (personal → club-owned org) | 🟡 Medium | TDD |
| Vercel Team + Supabase ownership transfer to club Gmail | 🟡 Medium | TDD |
| Seed `players.photo_url` passively on next sign-in (no migration needed) | 🟢 Low | site_navigation |
 
---
 
*Maintained by: Spartans Data Wranglers Team · Coordinator: Muthu, Spartans CC BLR · Last synced: June 2026*