# Spartans Hub — Security Reference

**Last updated:** March 2026  
**Sprint:** 2 (pre-Sprint 3 / payment gateway hardening)  
**Audited against:** `vibe-security` SKILL.md

---

## 1. Architecture Overview

The Hub uses a **two-key Supabase pattern** with all database access routed exclusively through Next.js API routes. No client component ever touches Supabase directly.

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
            Used by: browser client (no direct DB queries made from it)
```

**Core principle:** The service role key never touches the browser. The anon key is public but protected by RLS on all tables.

---

## 2. Supabase Client — `src/lib/supabase.ts`

Three exported functions with distinct purposes:

| Function | Key used | Where used | Bypasses RLS? |
|---|---|---|---|
| `createServiceClient()` | `SUPABASE_SERVICE_ROLE_KEY` | All API routes, auth callback | ✅ Yes |
| `createServerSupabaseClient()` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Server components (not currently used for DB queries) | ❌ No |
| `createClient()` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/client components (no DB queries made) | ❌ No |

**Critical bug fixed in Sprint 2:** `createServiceClient()` was originally using `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead of `SUPABASE_SERVICE_ROLE_KEY`. This meant it was not bypassing RLS, causing the JWT player lookup to fail silently once RLS was enabled on the `players` table. Fixed by correcting the key reference.

---

## 3. Authentication — `src/lib/auth.ts`

### Provider
Google OAuth via NextAuth.js. Any Google account can sign in — player matching happens after sign-in, not before.

### JWT Callback Logic

The JWT callback runs in two situations and enriches the token with player context from the database:

```
Sign-in (user present)     → always re-fetch player from DB
Token refresh (user absent) → re-fetch only if token.playerId is null
                              (handles stale sessions from before a deployment)
```

Fields written to the JWT token:

| Field | Source | Purpose |
|---|---|---|
| `playerId` | `players.id` matched by `gmail_id` | Player identity — null if not registered |
| `playerName` | `players.name` | Display name |
| `isCaptain` | `players.is_captain` | Captain-gated routes |
| `isGC` | `players.is_gc` | Governing Council access |
| `playerStatus` | `players.status` | Expulsion check (`active` / `inactive` / `expelled`) |
| `isAdmin` | `ADMIN_EMAILS` env var match | Admin-gated routes — **not from DB** |
| `photoUrl` | `players.photo_url`, falling back to `user.image` from Google OAuth.
On first sign-in, if `photo_url` is null, the Google profile photo is written to
`players.photo_url`. No Supabase Storage used. |

### Key Design Decisions

**`isAdmin` is derived from an environment variable, not the database.** An attacker cannot escalate to admin by modifying their player record in Supabase. Admin emails are set in Vercel and require a redeployment to change.

**Error handling:** A `PGRST116` error (no rows found) is silently ignored — it means the user is not a registered player, which is a valid state. Any other error is logged with `[auth]` prefix so it appears in Vercel function logs.

**Session strategy:** JWT, 8-hour expiry. No database session storage.

### Player Status Enforcement
The `expelled` status is checked at both the page level (shows suspension banner) and the API level (`/api/player-availability` returns 403 for expelled players).

---

## 4. Route-Level Access Control

Every API route enforces auth server-side via `getServerSession(authOptions)`. No route trusts client-supplied user IDs or roles.

### Access matrix

| Route | GET | POST | PATCH | DELETE |
|---|---|---|---|---|
| `/api/bookings` | Admin | Admin | Admin | Admin |
| `/api/bookings/[id]` | Authenticated | — | Admin | Admin |
| `/api/captains` | Public | Admin | Admin | — |
| `/api/tournaments` | Public | Admin | Admin | — |
| `/api/grounds` | Public | Admin | Admin | — |
| `/api/players` | Admin | Admin | Admin | — |
| `/api/players/[id]` | Own or Admin | — | Own (limited fields) or Admin | — |
| `/api/player-availability` | Own player | Own player | — | Own player |
| `/api/availability/weekend` | Captain or Admin | — | — | — |
| `/api/soft-blocks` | Authenticated | Authenticated | — | — |
| `/api/cron/expire-reservations` | `CRON_SECRET` bearer token | — | — | — |

### `requireAdmin()` helper

A shared helper used across all admin-only routes:

```typescript
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  return null
}
```

### IDOR protection on `/api/players/[id]`

Players can only read and update their own profile. Admin can access any. The check is:

```typescript
if (!user.isAdmin && user.playerId !== params.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

### Field allowlist on player self-service PATCH

Non-admin players can only update a fixed set of fields. Sensitive fields like `wallet_balance`, `is_captain`, `status`, and `active` are excluded from the allowlist and silently dropped:

```typescript
const PLAYER_EDITABLE_FIELDS = new Set([
  'whatsapp', 'dob', 'jersey_name', 'jersey_number',
  'blood_group', 'primary_skill', 'secondary_skill',
  'cricheroes_url', 'photo_url',
])
```

### Admin layout guard

The entire `/admin/*` subtree is protected at the layout level (`src/app/admin/layout.tsx`). Any unauthenticated request redirects to `/login`; any authenticated non-admin redirects to `/?error=unauthorized`. This is defence-in-depth on top of individual route guards.

---

## 5. Row Level Security (RLS)

RLS was enabled on all tables as part of the Sprint 2 security hardening. The strategy: public read on non-sensitive tables, no direct client writes on any table (all writes go through the service role API).

### Policies applied

| Table | RLS | Policy |
|---|---|---|
| `captains` | ✅ Enabled | Public SELECT (needed by booking form dropdowns) |
| `tournaments` | ✅ Enabled | Public SELECT (needed by schedule and fixtures pages) |
| `bookings` | ✅ Enabled | Public SELECT where `status != 'cancelled'` |
| `grounds` | ✅ Enabled | Public SELECT (displayed on fixture cards) |
| `players` | ✅ Enabled | No anon/authenticated SELECT policy — full lockdown for direct access |
| `availability` | ✅ Enabled | No anon/authenticated SELECT/write policy — full lockdown for direct access |
| `fee_exemptions` | ✅ Enabled | No policies — complete lockdown |

**All writes on all tables** are blocked for anon and authenticated roles. Only the service role key (used exclusively by Next.js API routes) can write.

**Note on `auth.uid()`:** The Hub uses NextAuth with Google OAuth, not Supabase Auth. `auth.uid()` is always `NULL` for Hub users. RLS policies for `players` and `availability` therefore act as a blanket deny for any direct client access — which is correct, since all access is intended to go through the API.

---

## 6. Environment Variables

### Full list

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

### Rules enforced
- No secret is prefixed with `NEXT_PUBLIC_` — secrets never enter the client bundle
- `SUPABASE_SERVICE_ROLE_KEY` is marked as Secret in Vercel
- `.env.local` is in `.gitignore` and never committed

---

## 7. Security Headers

Set in `vercel.json` for all `/api/*` routes:

```json
{ "key": "X-Content-Type-Options", "value": "nosniff" }
{ "key": "X-Frame-Options",        "value": "DENY" }
```

---

## 8. Cron Job Security

The reservation expiry cron (`/api/cron/expire-reservations`) is protected by a bearer token, not a session:

```typescript
const authHeader = req.headers.get('authorization')
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
}
```

Vercel's cron runner supplies this header automatically. The route is otherwise unauthenticated (no Google session).

---

## 9. Known Issues Fixed in Sprint 2

| Issue | Root Cause | Fix Applied |
|---|---|---|
| `createServiceClient` used anon key | `lib/supabase.ts` had `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the service client function | Changed to `SUPABASE_SERVICE_ROLE_KEY` |
| Duplicate `createServiceClient` export | Manual edit left original function in file alongside new one | Removed duplicate — single definition |
| JWT callback only ran on first sign-in | `if (user?.email)` skips token refresh cycles | Changed to `if (email && (user \|\| !token.playerId))` to also re-fetch on stale sessions |
| `status` column caused silent query failure | `add_player_status.sql` migration not applied to live DB | SQL run in Supabase; column added with `IF NOT EXISTS` guard |
| 5 API routes had no auth guards | `captains`, `grounds`, `tournaments`, `players`, `exemptions` routes had no `getServerSession` check | `requireAdmin()` helper added to all write operations |

---

## 10. Pending — Before Sprint 3 (Payment Gateway)

These must be completed before any payment code is written:

- [ ] **Wallet balance write route** — `wallet_balance` is currently patchable via the admin PATCH on `/api/players`. Before Sprint 3, wallet changes should go through a dedicated `/api/wallet/transactions` route that creates an immutable transaction log row, with `wallet_balance` removed from the general PATCH allowlist.
- [ ] **Rate limiting** — no rate limiting exists on any route. At minimum, `/api/player-availability` (POST) should be rate-limited per player to prevent accidental or intentional spam. Vercel KV or Upstash Redis is the recommended implementation.
- [ ] **Input validation library** — all API routes currently do ad-hoc field checks. A lightweight schema validator (e.g. Zod) should be added before payment routes ship, since payment inputs require strict type and range validation.
- [x] **`availability/weekend` array size limit** — the `booking_ids` query parameter is split and passed to `.in()` with no cap. Should be limited to 20 IDs maximum.
- [x] **`NEXTAUTH_URL` verification** — confirm this is explicitly set in Vercel production (not just derived) to prevent OAuth callback URL mismatches on custom domain.
- [ ] **Payment webhook signature verification** — when Razorpay or Stripe is integrated, webhook payloads must be verified using the provider's signing secret before any database writes. Never trust the payload body alone.
- [x] **`squad` table RLS** — enabled via migration 007. Blanket deny for anon/authenticated roles. All access via service role through API routes only.

---

## 11. Repo Sync Note

This project uses Claude Projects for AI-assisted development. The project knowledge must be manually re-synced after each significant commit so Claude has accurate context for code reviews and new feature work. Sync at the start of any debugging session or before beginning a new feature sprint.

## Captain FK Validation

When accepting player_id in captain context (POST /api/captains, PATCH /api/captains),
validate server-side before any DB write:

```typescript
if (body.player_id) {
  const { data: player } = await supabase
    .from('players').select('id, is_captain').eq('id', body.player_id).single()
  if (!player?.is_captain) {
    return NextResponse.json({ error: 'Player is not flagged as captain' }, { status: 400 })
  }
}
```

## PostgREST FK Ambiguity

When a table has two FKs to the same target, use explicit hint:

```typescript
// Fails with "more than one relationship was found":
.select('*, captains(id, name)')

// Correct:
.select('*, captains!tournaments_captain_id_fkey(id, name)')
```

Find constraint names:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'your_table'::regclass AND contype = 'f';
```

Preferred fix: drop the unused FK column to eliminate ambiguity permanently.

## Deprecated Column Write Prevention

Strip deprecated columns server-side before every DB write:

```typescript
const { vc_captain_id: _dropped, ...safeUpdates } = body
```

Never rely on the client to omit deprecated fields.