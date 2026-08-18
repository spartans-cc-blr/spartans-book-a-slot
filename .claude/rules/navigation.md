# Site Navigation & Home Page — Feature Summary
 
**Spartans Hub · Last updated: March 2026**
**Sprint:** 2 (going live with player-facing features)
 
---
 
## 1. Overview
 
The home page (`/`) replaced a simple redirect to `/schedule` that was organiser-only. The new approach is a **split-audience landing page** — the correct first impression is served to each visitor based on their session state, without requiring any manual navigation.
 
### The Problem It Solved
 
`hub.spartanscricketclub.in` previously redirected everyone to `/schedule` (the organiser slot grid). Players had to know to navigate to `/fixtures` and then find the sign-in button. With 100+ members being onboarded for availability marking and squad announcements, this was the wrong default.
 
### Approach Chosen
 
**Option 2 — Split-audience home page** was selected over:
- Option 1 (smart redirect based on session) — too invisible, players without a session still saw the organiser view
- Option 3 (fixtures as the root) — broke the organiser-facing URL that was already being shared externally
---
 
## 2. File Map
 
| File | Role |
|---|---|
| `src/app/page.tsx` | Server component — home/landing page, role-aware rendering |
| `src/components/ui/SiteNav.tsx` | Sticky nav bar — shared across all pages, role-aware links and profile dropdown |
| `src/app/profile/page.tsx` | Player self-service profile edit page |
| `src/app/api/players/[id]/route.ts` | GET + PATCH for single player — IDOR-protected |
| `src/lib/auth.ts` | JWT callback — enriches session with player context, saves Google photo on first sign-in |
 
---
 
## 3. Home Page — `src/app/page.tsx`
 
### Rendering Strategy
 
Server component with `revalidate = 60`. Session is read server-side via `getServerSession(authOptions)`. All role checks and data fetching happen before any HTML is sent to the browser — no client-side loading states on the home page.
 
### Role Detection
 
Six distinct states are resolved from the session token:
 
| State | Condition | What they see |
|---|---|---|
| Logged out | No session | Both audience cards + sign-in prompt |
| Registered player | `player.playerId` set, status ≠ `expelled` | Personalised dashboard + both audience cards below |
| Captain | `player.isCaptain = true` | Player dashboard + Captains Corner shortcut |
| Admin | `player.isAdmin = true` | Player dashboard + Admin Panel shortcut |
| Expelled | `player.playerStatus === 'expelled'` | Suspension notice only |
| Unmatched Gmail | Signed in but no `playerId` | "Not registered yet" callout — contact admin |
 
### `getPlayerData(playerId)` — Server Function
 
Called only when `isPlayer = true`. Makes 4 Supabase queries in sequence:
 
```ts
// 1. Total upcoming confirmed fixtures count
supabase.from('bookings')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'confirmed')
  .gte('game_date', today)
 
// 2. Player's existing availability responses (all upcoming)
supabase.from('availability')
  .select('booking_id, response')
  .eq('player_id', playerId)
 
// 3. Next confirmed fixture with tournament join
supabase.from('bookings')
  .select('id, game_date, slot_time, format, opponent_name, tournament:tournaments(name, ball_type)')
  .eq('status', 'confirmed')
  .gte('game_date', today)
  .order('game_date', { ascending: true })
  .order('slot_time', { ascending: true })
  .limit(1).single()
 
// 4. All upcoming booking IDs (for pending count computation)
supabase.from('bookings')
  .select('id')
  .eq('status', 'confirmed')
  .gte('game_date', today)
```
 
**Derived values:**
- `nextFixtureResponse` — cross-references query 2 against query 3 to find the player's response for the very next match
- `pendingCount` — Set difference between all upcoming booking IDs and the set of booking IDs the player has already responded to
### Dashboard UI (Player View)
 
Three stat cards link to `/fixtures`:
 
| Card | Content | Highlight |
|---|---|---|
| Upcoming Fixtures | Total count of upcoming confirmed bookings | Always gold |
| Pending Availability | Count of matches with no response yet | Amber/warning if > 0, green if all done |
| My Profile | Player name + edit prompt | Always neutral |
 
**Next Match callout** — inline panel showing the next fixture's tournament name, opponent, date, and slot. Displays current availability response badge (Y/O/E/L with colour-coding) or a "Not marked yet" amber warning, plus a direct link to mark/update.
 
**Captain shortcut** — gold bordered panel linking to `/captains-corner` (shown only if `isCaptain = true`).
 
**Admin shortcut** — crimson bordered panel linking to `/admin` (shown only if `isAdmin = true`).
 
**Audience cards divider** — when the player dashboard is shown, the two public-facing cards below are separated by a "Quick Links" divider label, so it reads as secondary navigation rather than the primary content.
 
### Split Audience Cards (All Visitors)
 
Two side-by-side cards (stacked on mobile):
 
| Card | Audience | Destination | Access |
|---|---|---|---|
| Players card | Spartans CC members | `/fixtures` | Public (sign-in is on the fixtures page) |
| Organisers card | Tournament promoters | `/schedule` | Public — no login required |
 
The Players card border is gold (primary) and the Organisers card is neutral when a player is already logged in — emphasis shifts naturally.
 
### Sign-in Prompt (Logged-out Visitors)
 
A full-width panel at the bottom with a Google sign-in button (using inline Google SVG icon). Redirects to `/api/auth/signin`. Only shown when `!isLoggedIn`.
 
---
 
## 4. SiteNav — `src/components/ui/SiteNav.tsx`
 
### Link Structure
 
```ts
// AFTER
const links = [
  { href: 'https://spartanscricketclub.vercel.app', label: 'Club Site' },
  { href: '/', label: 'Home', key: 'home' },
  // Schedule: public + admin only
  ...(!isLoggedIn || isAdmin
    ? [{ href: '/schedule', label: 'Schedule', key: 'schedule' }] : []),
  ...(isLoggedIn && !isExpelled
    ? [{ href: '/fixtures', label: 'Fixtures', key: 'fixtures' }] : []),
  // The Dugout — all active signed-in players
  ...(isLoggedIn && !isExpelled
    ? [{ href: '/dugout', label: 'The Dugout', key: 'dugout' }] : []),
  ...(isCaptain || isAdmin
    ? [{ href: '/captains-corner', label: "Captains' Corner", key: 'captains' }] : []),
  ...(isGC
    ? [{ href: '/gc-review', label: 'GC Review', key: 'gc' }] : []),
  ...(isCaptain || isGC || isAdmin
    ? [{ href: '/tournament-planner', label: 'Tournaments', key: 'planner' }] : []),
  ...(isLoggedIn && !isExpelled
    ? [{ href: '/profile', label: 'My Profile', key: 'profile' }] : []),
]
```
 
Active page highlight is driven by the `activePage` prop passed from each page (`'home'`, `'schedule'`, `'fixtures'`, `'profile'`). The Club Site entry intentionally has no `key` — it is never highlighted.
 
### Logo Link
 
The logo currently links to `/schedule`. This should be updated to link to `/` now that the home page exists.
 
### Profile Dropdown
 
Shown when authenticated. Contains:
- Player display name + email + role badges (CAPTAIN, GC)
- "My Profile" link → `/profile` (hidden if `expelled`)
- "Complete Registration" link → `/join` (shown if `playerId` is null and not expelled)
- Sign out button
### Role-conditional Nav Elements
 
- **Admin button** — crimson pill linking to `/admin`, shown if `isAdmin`
- **GC Review button** — gold bordered pill linking to `/gc-review`, shown if `isGC && !isAdmin`
- Both are surfaced in the mobile drawer as text links
### Nav by Role

| Role | Nav items visible |
|---|---|
| Public (not signed in) | Schedule · Sign In |
| Player | Home · Fixtures · The Dugout · My Profile |
| Captain | Home · Fixtures · The Dugout · Captains Corner · Tournaments · My Profile |
| GC | Home · Fixtures · The Dugout · GC Review · Tournaments · My Profile |
| Admin | Home · Fixtures · The Dugout · Schedule · Admin ⚙ · My Profile |
| Expelled | Home only (Fixtures, Dugout, Profile all hidden) |
### Mobile Nav
 
Hamburger drawer (bottom sheet on mobile). All links included. Admin/GC shortcuts rendered inline before the hamburger icon for quick access without opening the drawer.
 
---
 
## 5. Auth Flow — `src/lib/auth.ts`
 
### JWT Callback — Key Design Decisions
 
**`isAdmin` is derived from `ADMIN_EMAILS` environment variable, not the database.** An attacker cannot escalate to admin by modifying their player record in Supabase. Changing admins requires a Vercel env var change + redeployment.
 
**Token is enriched on first sign-in and on any token refresh where `playerId` is null** — this handles stale sessions from before a deployment without forcing every request to re-query the DB.
 
**Google profile photo is saved to `players.photo_url` on first sign-in** if the field is currently empty:
 
```ts
const googlePhoto = user.image ?? null
if (player?.id && googlePhoto && !player.photo_url) {
  await supabase.from('players')
    .update({ photo_url: googlePhoto })
    .eq('id', player.id)
}
token.photoUrl = player?.photo_url ?? googlePhoto
```
 
This means photos are populated passively — existing players who have already signed in will have their Google photo saved on their next sign-in. No photo upload feature exists (Supabase free tier has 50MB storage; 100+ members at up to 5MB each would exceed it).
 
### Session Token Fields
 
| Field | Source | Purpose |
|---|---|---|
| `playerId` | `players.id` matched by `gmail_id` | Player identity — null if unregistered |
| `playerName` | `players.name` | Display name |
| `isCaptain` | `players.is_captain` | Captain-gated routes and UI |
| `isGC` | `players.is_gc` | Governing Council access |
| `playerStatus` | `players.status` | Expulsion check (`active` / `inactive` / `expelled`) |
| `isAdmin` | `ADMIN_EMAILS` env var | Admin-gated routes — not from DB |
| `photoUrl` | `players.photo_url` (Google photo on first sign-in) | Avatar display |
 
**Session strategy:** JWT, 8-hour expiry. No database session storage.
 
---
 
## 6. My Profile Page — `src/app/profile/page.tsx`
 
### Access Control
 
- Requires authenticated session with a valid `playerId`
- Expelled players see a suspension message and cannot edit
- Unauthenticated users are redirected to `/`
### Editable Fields (Player Self-Service)
 
| Field | Input Type | Notes |
|---|---|---|
| WhatsApp number | `tel` | Include country code e.g. `919876543210` |
| Date of birth | day + month `select`, year `number` (optional) | `DobInput` (`src/components/ui/DobInput.tsx`) — year left blank stores a sentinel `1900` in `players.dob` so the birthday-wishes feature (day/month only) still works without the player disclosing their birth year; see `features/birthday-wishes.md` |
| Blood group | `select` | A+/A−/B+/B−/AB+/AB−/O+/O− |
| Jersey name | `text` | Uppercased — name printed on back |
| Jersey number | `number` | 0–999 |
| Primary skill | `select` | 17 options covering batting, bowling, keeping roles |
| Secondary skill | `select` | Same list as primary |
| CricHeroes profile URL | `url` | With inline "Test link ↗" preview |
 
### Read-Only Fields (Admin-Managed)
 
- Full name, club Gmail, wallet balance (with dues highlight if < 0), inducted date, captain status
### API — `GET /api/players/[id]`
 
Player can only fetch their own profile. Admin can fetch any. IDOR check:
 
```ts
if (!user.isAdmin && user.playerId !== params.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```
 
### API — `PATCH /api/players/[id]`
 
Non-admin players can only update fields in a fixed allowlist. Sensitive fields are silently dropped server-side even if sent by the client:
 
```ts
const PLAYER_EDITABLE_FIELDS = new Set([
  'whatsapp', 'dob', 'jersey_name', 'jersey_number',
  'blood_group', 'primary_skill', 'secondary_skill', 'cricheroes_url',
])
// photo_url removed from allowlist — set only by auth.ts on sign-in
// wallet_balance, is_captain, status, active — never in the allowlist
```
 
### Hero
 
Displays the player's Google profile photo (from `player.photoUrl ?? player.image`), name, CAPTAIN/ACTIVE badges, and member-since date. No photo upload — profile photo comes exclusively from Google OAuth.
 
---
 
## 7. Architectural Decisions
 
| Decision | Rationale |
|---|---|
| Home page is a server component | No flash of unauthenticated content; role detection and data fetching happen before HTML is sent |
| `revalidate = 60` on home page | Fixture counts stay reasonably fresh without a full SSR on every hit |
| `getPlayerData` runs 4 separate queries rather than one complex join | Supabase query composability; each query is independently cacheable and easier to reason about |
| Google photo saved to DB on sign-in, not fetched live | Avoids Google token expiry issues; consistent avatar even if Google profile changes; zero storage cost |
| No Supabase Storage used for photos | Free tier is 50MB — 100+ members × up to 5MB = would exceed limit immediately |
| `isAdmin` from env var not DB | Prevents privilege escalation via DB manipulation; changing admins requires a deliberate redeployment |
| Player PATCH allowlist is server-enforced | Client cannot send `wallet_balance` or `is_captain` — they are silently dropped even if injected |
| Logo still links to `/schedule` | Not yet updated — see pending tasks |
 
---
 
## 8. Pending Tasks
 
| Task | Priority | Notes |
|---|---|---|
| Update logo `href` in `SiteNav.tsx` from `/schedule` to `/` | High | Small one-line change — schedule is no longer the default landing |
| Add `Home` link to the mobile nav drawer | High | The `links` array feeds both desktop and mobile — should already be included if SiteNav was updated |
| Seed `players.photo_url` for existing members | Medium | Existing players who signed in before the auth.ts change won't have photos until their next sign-in. Passive approach is fine; no one-off migration needed |
| CricHeroes hyperlink wherever player names appear | Medium | Agreed pattern: if `cricheroes_url` is set on the player's profile, their name should render as a hyperlink to that URL in squad announcements, availability grids, and Captains Corner |
| `/join` route for unmatched Gmail users | Low | `SiteNav` links to `/join` for unmatched users but the page doesn't exist yet — currently dead link |
| Optimise `getPlayerData` queries | Low | Queries 3 and 4 both hit `bookings` — could be merged into one query with the pending count derived from the same result set |
| Consider `Promise.all` in `getPlayerData` | Low | Queries 2 and 3 are independent — running them in parallel would reduce TTFB on the home page |
 
