// "New match booked" push. Fired when a booking becomes CONFIRMED (created as
// confirmed, or a reservation confirmed by an admin). Audience: every player
// with push enabled, minus expelled players and anyone who muted the master
// 'newmatch' switch or unfollowed this booking's tournament in My Notifications.
// Best-effort — never throws, never blocks the booking save.

import { createServiceClient } from '@/lib/supabase'
import { sendPushToPlayer } from '@/lib/webpush'
import { getMutedKeysForPlayers } from '@/lib/notificationPrefsServer'
import { isNewMatchMuted } from '@/lib/notificationPrefs'
import { istToday } from '@/lib/matchCompletion'
import { formatNudgeDateTime } from '@/lib/availabilityNudge'

export async function notifyNewMatchBooked(bookingId: string): Promise<void> {
  try {
    const supabase = createServiceClient()
    const { data: b } = await supabase
      .from('bookings')
      .select(`
        id, game_date, slot_time, match_time, format, status, opponent_name, is_practice,
        tournament_id, tournament:tournaments(name, is_practice)
      `)
      .eq('id', bookingId)
      .single()
    if (!b || b.status !== 'confirmed' || !b.tournament_id) return

    const t: any = Array.isArray(b.tournament) ? b.tournament[0] : b.tournament
    // Practice games, and matches already in the past (backfills), never alert.
    if (b.is_practice || t?.is_practice) return
    if (b.game_date < istToday()) return

    const { data: subs } = await supabase.from('push_subscriptions').select('player_id')
    let playerIds = Array.from(new Set((subs ?? []).map(s => s.player_id as string)))
    if (!playerIds.length) return

    const { data: active } = await supabase
      .from('players').select('id').in('id', playerIds).neq('status', 'expelled')
    playerIds = (active ?? []).map(p => p.id as string)

    const muted = await getMutedKeysForPlayers(supabase, playerIds)
    const recipients = playerIds.filter(id => !isNewMatchMuted(muted.get(id) ?? new Set(), b.tournament_id!))
    if (!recipients.length) return

    const when = formatNudgeDateTime({
      id: b.id, game_date: b.game_date, slot_time: b.slot_time,
      match_time: b.match_time ?? b.slot_time, format: b.format ?? '',
    } as any)
    const vs = b.opponent_name ? ` vs ${b.opponent_name}` : ''
    const payload = {
      title: '🆕 New match booked',
      body: `${t?.name ?? 'Match'} · ${b.format ?? ''}${vs} — ${when}. Mark your availability!`.replace(/\s+·\s+—/, ' —'),
      url: `/fixtures/${b.id}`,
    }
    await Promise.allSettled(recipients.map(id => sendPushToPlayer(id, payload)))
  } catch (err: any) {
    console.error('[new-match-notify] failed:', err?.message ?? err)
  }
}
