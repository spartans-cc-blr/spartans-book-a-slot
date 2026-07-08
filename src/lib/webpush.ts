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

// Broadcast a push notification to every GC member — used by cron jobs to
// surface failures/results that would otherwise go unnoticed (Vercel Hobby
// doesn't retry failed cron invocations and drops logs within an hour).
export async function notifyGCs(title: string, body: string, url: string = '/admin') {
  const supabase = createServiceClient()
  const { data: gcs } = await supabase.from('players').select('id').eq('is_gc', true)
  if (gcs?.length) {
    await Promise.all(gcs.map(gc => sendPushToPlayer(gc.id, { title, body, url })))
  }
}
