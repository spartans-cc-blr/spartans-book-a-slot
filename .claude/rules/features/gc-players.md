# GC Players — Squad Register & Player Status

**Spartans Hub · hub.spartanscricketclub.in**
**Last updated: June 2026 · Sprint 2**

---

## 1. Overview

The Squad Register is a read-only player directory available exclusively to GC members and admins. It surfaces under the **Council ⚖** nav dropdown as a sub-menu item labelled **👤 Players**, alongside Squad Review and Generate Invite Link.

**Purpose:** Allows GC members to view all club members' basic profile info and wallet balances without needing admin access to `/admin/players`.

**Security boundary (vibe-security):** No write paths exist on this page or its API route. `wallet_balance`, `status`, and `is_captain` are read-only display fields. `gmail_id`, `dob`, and `blood_group` are intentionally excluded from the GC fetch — not within GC's remit.

---

## 2. Player Status — Single Source of Truth

### Design decision

The `players` table has two historical columns — `status` (text) and `active` (boolean). These were redundant and could get out of sync via admin inline edits. **`status` is the single source of truth going forward.** The `active` column is retained only because four RLS policies depend on it directly and cannot be dropped without rewriting those policies in a migration — deferred to migration 003.

### Status values

| Value | Meaning | Who sets it |
|---|---|---|
| `'active'` | Marked availability (Y/O/E) for ≥ 1 game in last 30 days | Cron — automatic |
| `'inactive'` | No meaningful availability signal in last 30 days | Cron — automatic |
| `'expelled'` | Removed from club | Admin only — never touched by cron |

### Why availability signal, not squad appearance

A player who consistently marks availability but isn't selected in the XI is still an engaged member. Using `squad.status = 'announced'` would incorrectly mark them inactive. Availability responses `Y`, `O`, `E` are used as the activity signal. `L` (leave/withdrawal) is excluded — it's a withdrawal signal, not engagement.

The offline withdrawal blind spot (player marks Y, drops out on WhatsApp, nobody logs L in Hub) is accepted: it keeps someone active for at most one extra 30-day window before they naturally drop off. This incentivises captains to log `L` in Hub when someone drops out verbally.

### 30-day window rationale

Spartans play 2–3 games per week (8–12 per month). If a player hasn't marked availability in a month with that many games, they are genuinely inactive. 30 days is the right window.

---

## 3. Migration — `supabase/migrations/002_consolidate_player_status.sql`

Run to backfill and harden the `status` column. Does **not** drop `active` — that is deferred to migration 003 once the four dependent RLS policies are documented and rewritten.

```sql
-- Migration: 002_consolidate_player_status
-- Backfills and hardens the status column.
-- active column left in place — RLS policies reference it; drop deferred to migration 003.

-- Step 1: Backfill status from active boolean
UPDATE players
SET status = CASE
  WHEN status = 'expelled' THEN 'expelled'
  WHEN active = false      THEN 'inactive'
  ELSE                          'active'
END;

-- Step 2: Harden the status column
ALTER TABLE players
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active';
```

### Deferred — migration 003

When ready to drop `active`, these four RLS policies must be dropped and recreated first:
- `read_active_players` on `players`
- `captain_manage_own_squad` on `squad`
- `admin_full_squad` on `squad`
- `captain_read_all_availability` on `availability`

Before writing migration 003, go to **Supabase Dashboard → Authentication → Policies** and copy the exact `USING` clauses of these policies. Rewrite using `status != 'expelled'` instead of `active = true`.

> ⚠️ The `active` column comment in Supabase should read: *"Deprecated — use status column. Retained for RLS policy compatibility until migration 003."*

---

## 4. Cron — `src/app/api/cron/sync-player-status/route.ts`

Runs daily at **02:00 IST** (20:30 UTC). Registered in `vercel.json`.

```ts
// Runs daily at 02:00 IST (20:30 UTC previous day)
// vercel.json: { "path": "/api/cron/sync-player-status", "schedule": "30 20 * * *" }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0]
  const today  = new Date().toISOString().split('T')[0]

  // Players with any meaningful availability signal in last 30 days
  // Y = available, O = one game weekend, E = either game — all count as active
  // L (leave/withdrawal) intentionally excluded
  const { data: activePlayers, error: activeErr } = await supabase
    .from('availability')
    .select('player_id, bookings!inner(game_date)')
    .in('response', ['Y', 'O', 'E'])
    .gte('bookings.game_date', cutoff)
    .lte('bookings.game_date', today)

  if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 })

  // Array.from instead of spread — downlevelIteration not enabled in tsconfig
  const activeIds = Array.from(new Set((activePlayers ?? []).map(r => r.player_id)))

  // Set active — never touch expelled
  const { error: setActive } = await supabase
    .from('players')
    .update({ status: 'active' })
    .in('id', activeIds.length ? activeIds : ['00000000-0000-0000-0000-000000000000'])
    .neq('status', 'expelled')

  if (setActive) return NextResponse.json({ error: setActive.message }, { status: 500 })

  // Set inactive — everyone not in activeIds and not expelled
  const { error: setInactive } = await supabase
    .from('players')
    .update({ status: 'inactive' })
    .not('id', 'in', `(${activeIds.length ? activeIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
    .neq('status', 'expelled')

  if (setInactive) return NextResponse.json({ error: setInactive.message }, { status: 500 })

  return NextResponse.json({ active: activeIds.length })
}
```

### vercel.json crons

```json
"crons": [
  { "path": "/api/cron/expire-reservations",  "schedule": "30 18 * * *" },
  { "path": "/api/cron/lock-availability",    "schedule": "30 0 * * 4"  },
  { "path": "/api/cron/sync-player-status",   "schedule": "30 20 * * *" }
]
```

### Manual trigger (when needed)

```bash
curl -X GET https://hub.spartanscricketclub.in/api/cron/sync-player-status \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Response: `{ "active": N }` where N is the count of players set to active.

---

## 5. Status Filter Logic — shared across all surfaces

All three surfaces (admin players page, GC players grid) now use identical simple logic:

```ts
function isActivePlayer(p: Player)   { return p.status === 'active'   }
function isInactivePlayer(p: Player) { return p.status === 'inactive' }
function isExpelledPlayer(p: Player) { return p.status === 'expelled' }
```

> ⚠️ Previous versions used compound logic `p.active && p.status !== 'expelled'`. This is now wrong — do not reintroduce it. `status` is the only signal.

### Admin players page filter

```ts
if (filterActive === 'active')   return p.status === 'active'
if (filterActive === 'inactive') return p.status === 'inactive'
if (filterActive === 'expelled') return p.status === 'expelled'
```

### Admin status badge

```ts
p.status === 'expelled' ? 'Expelled' : p.status === 'active' ? 'Active' : 'Inactive'
```

---

## 6. File Map — GC Players Feature

| File | Role |
|---|---|
| `src/app/gc-players/page.tsx` | Server component — auth guard, Supabase fetch, page layout |
| `src/components/gc/GCPlayersGrid.tsx` | Client component — card grid, status filter, A–Z bar, dues toggle |
| `src/app/api/gc/players/route.ts` | `GET` only — GC/admin-gated, returns all players (no status filter) |
| `src/components/ui/SiteNav.tsx` | Council dropdown + mobile drawer — both include Players link |
| `src/app/api/cron/sync-player-status/route.ts` | Daily cron — drives active/inactive from availability signal |
| `supabase/migrations/002_consolidate_player_status.sql` | Backfills and hardens status column |

---

## 7. Page — `src/app/gc-players/page.tsx`

- Requires `isGC || isAdmin` — server-side redirect to `/` on failure
- Passes `activePage="gc-players"` to `<SiteNav>` (not `"gc"`)
- Fetches **all players** — no status filter; client-side radio handles filtering
- Supabase select: `id, name, photo_url, jersey_name, jersey_number, primary_skill, secondary_skill, cricheroes_url, wallet_balance, inducted_on, is_captain, status, active`
- Fields intentionally excluded: `gmail_id`, `dob`, `blood_group`, `whatsapp`, `referred_by`
- `revalidate = 120`
- Page bg: `bg-[#F0F4F5]`, heading: `font-cinzel text-xl font-bold text-[#0F3D42]`

---

## 8. API Route — `src/app/api/gc/players/route.ts`

`GET` only. Auth: `isGC || isAdmin` → 403 otherwise. Uses `createServiceClient()`. Returns all players ordered by name ascending. No write path.

---

## 9. Component — `src/components/gc/GCPlayersGrid.tsx`

Client component. Theme: **Slate & Teal**.

### State

```ts
const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')  // default Active
const [letterFilter, setLetterFilter] = useState<string | null>(null)
const [duesOnly,     setDuesOnly]     = useState(false)
```

### Status radio filter

Options: Active (default) · Inactive · Expelled · All. Counts shown inline. Switching status resets `letterFilter` via `handleStatusChange()`.

### A–Z alphabet bar

Below the status radio row. Letters with no players in the current status+dues filter are faded and `disabled`. Clicking a selected letter deselects it. Dues toggle resets `letterFilter` via `handleDuesToggle()`.

### Dues toggle

Right-aligned in the same flex row as the status radios (`ml-auto`). Amber colour connects visually to the `⚠ dues` badge on wallet balances in cards. `handleDuesToggle` toggles `duesOnly` and resets `letterFilter`.

### `availableLetters` — must respect both status AND dues filters

```ts
const availableLetters = useMemo(() => {
  const statusFiltered = players.filter(p => { /* status check */ })
  const duesFiltered = duesOnly
    ? statusFiltered.filter(p => p.wallet_balance < 0)
    : statusFiltered
  return new Set(duesFiltered.map(p => p.name[0]?.toUpperCase()).filter(Boolean))
}, [players, statusFilter, duesOnly])
```

### Filter interaction matrix

| Status | Letter | Dues | Result |
|---|---|---|---|
| Active | All | Off | All active players |
| Active | A | Off | Active players whose name starts with A |
| Active | All | On | Active players with wallet_balance < 0 |
| Active | A | On | Active, name starts with A, wallet_balance < 0 |
| All | All | On | Every player with wallet_balance < 0 |

### Player cards

- `bg-white rounded-xl border-l-[3px] border-[#CBD5DC]`
- Hover: `hover:border-l-[#1D9E75] hover:shadow-sm`
- Expelled: `opacity-60`, Inactive: `opacity-75`
- Avatar: Google photo if `photo_url` set; else initials circle (`bg-[#E1F5EE] border-[#5DCAA5] text-[#0F6E56]`)
- Player name: `PlayerNameLink` from `src/lib/playerLink.tsx` — CricHeroes hyperlink if `cricheroes_url` set
- Jersey: `#number · JerseyName` in `text-slate-500 text-xs`
- Primary skill pill: `bg-[#E1F5EE] border-[#5DCAA5] text-[#085041]`
- Secondary skill pill: `bg-slate-100 border-slate-300 text-slate-600`
- Captain badge: `bg-red-50 border-red-300 text-red-700`
- Wallet: `text-emerald-600` if ≥ 0, `text-amber-600` with `⚠ dues` if < 0
- Inducted year: `text-slate-400 text-xs` right-aligned in footer

### TypeScript gotchas

- All three helper functions require explicit `Player` type: `function isActivePlayer(p: Player)`
- Use `Array.from(new Set(...))` not `[...new Set(...)]` — `downlevelIteration` not enabled in tsconfig
- Destructure `error` in the same statement as `data` — do not split across lines or TypeScript loses the variable

### Skill short labels

| Full skill (partial match) | Display |
|---|---|
| Opening Batsman | Opener |
| Top Order Batsman | Top Order |
| Middle Order Batsman | Mid Order |
| Lower Order Batsman | Lower Order |
| Wicket Keeping Batsman | WK Bat |
| Fast Medium Bowler | FM Bowl |
| Medium Pace Bowler | Med Pace |
| Off Break Bowler | Off Break |
| Leg Break Bowler | Leg Break |

---

## 10. Theme — Slate & Teal

Approved by club coordinator over the default warm-light theme for this page.

| Token | Value | Usage |
|---|---|---|
| Page bg | `#F0F4F5` | Page wrapper |
| Heading | `#0F3D42` | `text-[#0F3D42]` |
| Teal accent | `#1D9E75` | Active filter, card left border hover, radio accent |
| Teal dark | `#0F6E56` | Player name text, active radio label |
| Teal deepest | `#085041` | Primary skill pill text |
| Teal light bg | `#E1F5EE` | Skill pill bg, initials avatar bg |
| Teal border | `#5DCAA5` | Skill pill border, avatar border |
| Border | `#CBD5DC` | Cards, section dividers |
| Muted | slate-500 | Jersey, metadata |
| Faint | slate-400 | Inducted year, result count |

Nav bar stays dark (`bg-ink-2`). Only page content uses slate-teal.

---

## 11. Navigation — `src/components/ui/SiteNav.tsx`

### Desktop Council dropdown

```tsx
<Link href="/gc-review"  ...>⚖ Squad Review</Link>
<Link href="/gc-players" ...>👤 Players</Link>
<Link href="/wrangler/grounds" ...>📍 Grounds</Link>
<GenerateInviteItem />
```

`/wrangler/grounds` is added here (not only under the Wrangler ⚒ dropdown)
so a GC member who isn't also a wrangler still has a nav path to it — GC
can create new grounds there even without wrangler's edit access. See
`features/wrangler-grounds-menu.md`.

### Mobile drawer

```tsx
{isGC && (
  <>
    <Link href="/gc-review" onClick={() => setOpen(false)} ...>⚖ Squad Review</Link>
    <Link href="/gc-players" onClick={() => setOpen(false)}
      className={`... ${activePage === 'gc-players' ? 'text-gold' : 'text-zinc-400 hover:text-gold'}`}>
      👤 Players
    </Link>
    <Link href="/wrangler/grounds" onClick={() => setOpen(false)} ...>📍 Grounds</Link>
    <GenerateInviteItem mobile onClose={() => setOpen(false)} />
  </>
)}
```

### `GenerateInviteItem` — `onClose` prop

```ts
function GenerateInviteItem({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  async function generate() {
    onClose?.()   // close drawer immediately on tap, before async work
    ...
  }
}
```

---

## 12. Security Checklist (vibe-security)

| Check | Status |
|---|---|
| `isGC \|\| isAdmin` enforced server-side on page and API route | ✅ |
| No `NEXT_PUBLIC_` prefix on service role key | ✅ |
| `gmail_id`, `dob`, `blood_group` excluded from GC select | ✅ |
| No write path on page or API route | ✅ |
| `wallet_balance` read-only display only | ✅ |
| Cron protected by `CRON_SECRET` bearer token | ✅ |
| Cron never touches `expelled` players | ✅ |
| `status` not in `PLAYER_EDITABLE_FIELDS` allowlist — cron-managed | ✅ |
| `active` not in `PLAYER_COLUMNS` admin allowlist — deprecated | ✅ |

---

## 13. Pending / Known Issues

| Item | Notes |
|---|---|
| Migration "003" — RLS rewritten off `active` | ✅ Done (July 2026) — `supabase/migrations/048_rls_status_not_active.sql`. `read_active_players` had already been dropped separately (035); the remaining three (`captain_manage_own_squad`, `admin_full_squad`, `captain_read_all_availability`) now key on `status != 'expelled'` instead of `active = true`. Byte-for-byte identical otherwise; a DB-wide `pg_policies` scan confirmed no other policy references `active`. |
| `active` in auth.ts select | Already clean — `auth.ts`'s player select never included `active` (verified by grep); no change needed. |
| Admin inline edit form | ✅ Done — `active` boolean toggle removed from `src/app/admin/players/page.tsx`; it was already a no-op since `active` was never in the `PLAYER_COLUMNS` PATCH allowlist. |
| `players.active` read/write cleanup across app code | ✅ Done — removed from: admin players page (badge styling, active-count, expel PATCH), admin captains page (promotion filter now `status !== 'expelled'`), `CaptainsCornerGrid.tsx` display logic, `captains-corner`/`gc-players` page selects, `GCPlayersGrid.tsx` type, and the hardcoded `active: true` defaults in `POST /api/players` and `POST /api/players/register`. Auto-reactivation bug fixed in `/api/player-availability` — it was flipping `active` instead of `status`, so a returning inactive player never actually got `status = 'active'` back except via the next cron run. |
| Migration 002 not checked into repo | ⚠️ Confirmed during this pass — `002_consolidate_player_status.sql` was applied directly to the live project (via Supabase MCP) but no such file exists in `supabase/migrations/`. Same drift pattern as the incident documented in `features/availability-nudge.md` §6, just inverted (applied but not committed, vs. merged but not applied). Not reconstructed as part of this change since it's already fully applied; flagging so a future migrations audit doesn't assume it's missing from the DB too. |
| `players.active` column itself | Not yet dropped — `supabase/migrations/049_drop_players_active_column.sql` is written but intentionally **not applied**. Drop only after the above has been live a few days and re-verified (no RLS policy or app code references `active` — both confirmed clean at time of writing). |
| Offline withdrawal blind spot | Bounded to one 30-day window. Mitigated by captain discipline logging `L` in Hub |

---

*Maintained by: Spartans Data Wranglers Team · Coordinator: Muthu, Spartans CC BLR · June 2026*
