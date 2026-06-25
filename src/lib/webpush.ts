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
    .select('id, endpoint, p256dh, auth')
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
    		 console.error('[webpush] send error:', err.statusCode, err.message, sub.endpoint.slice(0, 50))
        if (err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
        throw err
      }
    })
  )

  return results
}
