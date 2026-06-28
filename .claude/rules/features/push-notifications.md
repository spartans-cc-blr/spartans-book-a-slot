# Push Notifications — Feature Summary

**Spartans Hub · hub.spartanscricketclub.in**
**Implemented: June 2026 · Sprint 3**

---

## 1. Overview

Web Push notifications delivered to subscribed players and GC members when a squad is announced. Built on the Web Push Protocol using the `web-push` npm package and VAPID keys. No third-party paid service — fully self-hosted via Vercel serverless functions.

**Confirmed working:** Android Chrome, iPhone Safari PWA (iOS 16.4+ with Hub added to Home Screen).

---

## 2. How It Works

```
Player taps "Subscribe to notifications" on /profile
→ Browser permission dialog shown
→ Browser generates push subscription (endpoint + keys)
→ POST /api/push/subscribe saves to push_subscriptions table
→ On squad announce: sendPushToPlayer() called for each squad player + all GC members
→ web-push sends to each device's endpoint
→ Service worker (public/sw.js) displays the notification
→ Player taps notification → navigates to /fixtures/<booking_id>
```

---

## 3. Database

```sql
-- Migration: 009_push_subscriptions.sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(player_id, endpoint)
);
```

**RLS:** Disabled — consistent with platform pattern. All access via service role key through API routes only. No client ever touches this table directly.

---

## 4. Environment Variables

| Variable | Prefix | Notes |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public | Browser needs this to subscribe |
| `VAPID_PRIVATE_KEY` | None (server-only) | Never NEXT_PUBLIC_ |
| `VAPID_EMAIL` | None (server-only) | Must include `mailto:` prefix e.g. `mailto:foo@gmail.com` |

> ⚠️ **Critical gotcha:** `VAPID_EMAIL` must be prefixed with `mailto:`. Without it, `setVapidDetails()` throws `"Vapid subject is not a valid URL"` and every push silently fails. This was the root cause of initial failures during implementation.

Generate VAPID keys once with: `npx web-push generate-vapid-keys`

---

## 5. File Map

| File | Role |
|---|---|
| `src/lib/webpush.ts` | `sendPushToPlayer(playerId, payload)` utility — initialises VAPID inside the function (not at module level), fetches subscriptions, sends push, cleans up 410 expired endpoints |
| `src/app/api/push/subscribe/route.ts` | POST — saves browser subscription to DB. `player_id` always from server session, never request body (vibe-security) |
| `public/sw.js` | Service worker — handles `push` event (show notification) and `notificationclick` event (open URL). Also handles PWA caching |
| `src/app/profile/page.tsx` | Subscribe button in Club Details section. `useEffect` checks `pushManager.getSubscription()` on mount to show correct subscribed state |
| `src/app/api/squad/announce/route.ts` | Triggers push after squad status flips to `announced` |

---

## 6. Notification Triggers

### Squad Announced
**Who gets it:** Every player in the announced squad + all players with `is_gc = true`

**Title:** `🏏 Squad Announced — You're Selected!`

**Body (squad players):** Random congratulatory prefix + tournament name (if set) + format + opponent + date + slot time
```
"Let's go! 🔥 Trumphate T20 League · T20 vs Rising Phoenix CC · Sun, 28 Jun 14:30"
```

**Body (GC members):**
```
"Squad announced for T20 vs Rising Phoenix CC · Sun, 28 Jun 14:30"
```

**Congratulatory prefixes (random):**
- "You're in! 🏏"
- "Pads on! 🏏"
- "Time to shine! ⭐"
- "Let's go! 🔥"
- "Game day beckons! 🏆"

**URL:** `/fixtures/<booking_id>`

**Fires:** Every time the announce route succeeds — first announcement, re-announcement after squad change, or re-announcement of unchanged squad.

---

## 7. Re-Announce Behaviour

The announce route allows re-announcing squads that are already in `announced` status:

```ts
// Gate check allows both approved and announced:
if (!['approved', 'announced'].includes(rows[0].status))
  return NextResponse.json({ error: '...' }, { status: 400 })

// PATCH uses .in() to cover both states:
.update({ status: 'announced' })
.in('status', ['approved', 'announced'])
```

This means notifications fire on every announce action, which is intentional — players should be notified if the squad changes.

---

## 8. Key Implementation Decisions

### VAPID initialisation inside function, not at module level
```ts
// WRONG — throws during Vercel build (env vars not available at build time):
webpush.setVapidDetails(...)  // top level

// CORRECT — runs only at request time:
export async function sendPushToPlayer(...) {
  webpush.setVapidDetails(...)  // inside function
```

### Push must be awaited before returning response
Vercel serverless functions shut down immediately after `return NextResponse.json(...)`. Fire-and-forget async IIFEs get killed before completing. The push block must be `await`ed before the return.

### player_id always from session
```ts
// WRONG:
player_id: req.body.player_id

// CORRECT:
player_id: session.user.playerId  // from getServerSession()
```

### Stale subscription cleanup
On `sendNotification` error with `statusCode === 410`, the endpoint is deleted:
```ts
await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
```

---

## 9. PWA / Service Worker Notes

### sw.js must have install and activate handlers
Without `skipWaiting()` and `clients.claim()`, the SW sits in `waiting` state and `navigator.serviceWorker.ready` never resolves — the subscribe button hangs forever.

```js
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
```

### Precache list must only include existing assets
`cache.addAll([...])` fails entirely if any URL in the list returns non-200. Only precache assets that are guaranteed to exist:
```js
cache.addAll(['/', '/fixtures'])  // not '/offline' or '/icons/icon-192.png' unless they exist
```

### Do not precache auth-aware pages
`/fixtures` was in the precache list and caused a "sign in" flash — the SW served the cached unauthenticated version. Auth-aware pages must not be precached. Current precache: `['/']` only.

### iPhone requirements
- iOS 16.4+
- Hub must be added to Home Screen (Add to Home Screen in Safari → open from icon)
- Standard Safari browser tab does NOT support web push
- Focus mode silences notifications — expected iOS behaviour

---

## 10. Subscribe Button UX

Located in Club Details section of `/profile`. Checks existing subscription on mount:

```ts
useEffect(() => {
  async function checkSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) setPushSubscribed(true)
  }
  checkSubscription()
}, [])
```

States: `Subscribe to notifications` → `Enabling...` → `✓ Notifications enabled`

Players who reinstall the PWA must re-subscribe once — the old subscription endpoint becomes stale.

---

## 11. Future Notification Triggers (not yet implemented)

| Trigger | Who | Notes |
|---|---|---|
| Wallet topped up | Player | Requires S-1 wallet transaction route first |
| Match fee debited | Player | Requires S-1 wallet transaction route first |
| Wallet goes below zero | Player | Requires S-1 wallet transaction route first |
| Squad submitted for GC review | GC members | Currently WhatsApp only |

---

## 12. Security Audit (vibe-security)

| Check | Status |
|---|---|
| `player_id` never from request body | ✅ Always from `getServerSession` |
| Subscriptions never readable by other players | ✅ Service key only, no client fetch |
| VAPID private key server-only | ✅ No `NEXT_PUBLIC_` prefix |
| Stale subscriptions cleaned on 410 | ✅ Handled in `sendPushToPlayer` |
| Subscribe endpoint auth-gated | ✅ 401 if no session |
| Notification payload contains no sensitive data | ✅ Only match details, no wallet/personal data |
| Rate limiting on subscribe route | ⚠️ Not yet applied — S-2 backlog |

---

*Maintained by: Muthu, Spartans CC BLR Coordinator*
*vibe-security audit applied per SKILL.md — `never trust the client`*
