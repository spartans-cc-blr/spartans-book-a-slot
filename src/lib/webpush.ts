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
