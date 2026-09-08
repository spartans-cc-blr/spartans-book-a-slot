import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase'



type PushPayload = { title: string; body: string; url?: string }

export async function sendPushToPlayer(playerId: string, payload: PushPayload) {
    webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
    )
    const supabase = createServiceClient()
  const { data: subs } = await supabase
  .from('push_subscriptions')
  .select('endpoint, p256dh, auth')
  .eq('player_id', playerId)


  if (!subs?.length) return

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
      } catch (err: any) {
        if (err?.statusCode === 410) {
					await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
        throw err
      }
    })
  )

  return results
}

// Broadcast a push notification to every GC member (and optionally every
// captain) — used by cron jobs to surface failures/results that would
// otherwise go unnoticed (Vercel Hobby doesn't retry failed cron
// invocations and drops logs within an hour).
export async function notifyGCs(
  title: string,
  body: string,
  url: string = '/admin',
  includeCaptains: boolean = false
) {
  const supabase = createServiceClient()
  const query = supabase.from('players').select('id')
  const { data: recipients } = includeCaptains
    ? await query.or('is_gc.eq.true,is_captain.eq.true')
    : await query.eq('is_gc', true)
  if (recipients?.length) {
    await Promise.all(recipients.map(p => sendPushToPlayer(p.id, { title, body, url })))
  }
}

// Broadcast a push notification to every admin — resolved from ADMIN_EMAILS
// (the same env-derived source of truth session.user.isAdmin uses, see
// src/lib/auth.ts) rather than a DB role flag, since isAdmin is
// deliberately not stored on `players`. An admin who has no players row at
// all (email in ADMIN_EMAILS but never registered as a player) simply has
// nowhere to push to and is silently skipped — same posture as any other
// player with zero push_subscriptions rows. Used by the match-fee reminder
// (see src/lib/feeReminders.ts) to alert admins the moment a scorecard
// syncs into a fees-pending state.
export async function notifyAdmins(title: string, body: string, url: string = '/admin') {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  if (!adminEmails.length) return
  const supabase = createServiceClient()
  const { data: recipients } = await supabase
    .from('players')
    .select('id')
    .in('gmail_id', adminEmails)
  if (recipients?.length) {
    await Promise.all(recipients.map(p => sendPushToPlayer(p.id, { title, body, url })))
  }
}

// Broadcast a push notification to every player who has subscribed for
// push notifications at all (i.e. has at least one push_subscriptions
// row) — used for club-wide announcements like a new player being
// inducted. `excludePlayerId` skips the subject of the announcement
// themselves, in case they already happen to have a subscription.
export async function notifyAllSubscribed(
  title: string,
  body: string,
  url: string = '/',
  excludePlayerId?: string
) {
  const supabase = createServiceClient()
  const { data: subs } = await supabase.from('push_subscriptions').select('player_id')
  if (!subs?.length) return
  const playerIds = Array.from(new Set(subs.map(s => s.player_id))).filter(id => id !== excludePlayerId)
  if (!playerIds.length) return
  await Promise.all(playerIds.map(id => sendPushToPlayer(id, { title, body, url })))
}
