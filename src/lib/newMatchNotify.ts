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

export interface NewMatchPushResult {
  sent: number
  failed: number
  // Why nothing (or fewer than everyone) was sent — surfaced in the booking
  // API response and the server log so a silent miss can be diagnosed.
  note: string
}

function matchTimeLabel(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const hour12 = h % 12 || 12
  return `${hour12}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`
}

export async function notifyNewMatchBooked(bookingId: string): Promise<NewMatchPushResult> {
  const done = (r: NewMatchPushResult) => {
    console.log(`[new-match-notify] booking ${bookingId}: sent=${r.sent} failed=${r.failed} (${r.note})`)
    return r
  }
  try {
    const supabase = createServiceClient()
    const { data: b, error: bErr } = await supabase
      .from('bookings')
      .select(`
        id, game_date, slot_time, match_time, format, status, opponent_name, is_practice,
        tournament_id, tournament:tournaments(name, is_practice)
      `)
      .eq('id', bookingId)
      .single()
    if (!b) return done({ sent: 0, failed: 0, note: `booking lookup failed: ${bErr?.message ?? 'not found'}` })
    if (b.status !== 'confirmed') return done({ sent: 0, failed: 0, note: 'not confirmed' })
    if (!b.tournament_id) return done({ sent: 0, failed: 0, note: 'no tournament' })

    const t: any = Array.isArray(b.tournament) ? b.tournament[0] : b.tournament
    // Practice games, and matches already in the past (backfills), never alert.
    if (b.is_practice || t?.is_practice) return done({ sent: 0, failed: 0, note: 'practice game, skipped by design' })
    if (b.game_date < istToday()) return done({ sent: 0, failed: 0, note: 'past date, skipped' })

    const { data: subs } = await supabase.from('push_subscriptions').select('player_id')
    let playerIds = Array.from(new Set((subs ?? []).map(s => s.player_id as string)))
    if (!playerIds.length) return done({ sent: 0, failed: 0, note: 'no push subscriptions' })

    const { data: active } = await supabase
      .from('players').select('id').in('id', playerIds).neq('status', 'expelled')
    playerIds = (active ?? []).map(p => p.id as string)

    const muted = await getMutedKeysForPlayers(supabase, playerIds)
    const recipients = playerIds.filter(id => !isNewMatchMuted(muted.get(id) ?? new Set(), b.tournament_id!))
    if (!recipients.length) return done({ sent: 0, failed: 0, note: 'everyone muted or unfollowed' })

    // The match start time (not the 15-minute-earlier reporting time).
    const day = new Date(b.game_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    const when = `${day}, ${matchTimeLabel(b.match_time ?? b.slot_time)}`
    const vs = b.opponent_name ? ` vs ${b.opponent_name}` : ''
    const payload = {
      title: '🆕 New match booked',
      body: `${t?.name ?? 'Match'} · ${b.format ?? ''}${vs} — ${when}. Mark your availability!`.replace(/\s+·\s+—/, ' —'),
      url: `/fixtures/${b.id}`,
    }
    const outcomes = await Promise.allSettled(recipients.map(id => sendPushToPlayer(id, payload)))
    let sent = 0, failed = 0
    const codes = new Set<string>()
    for (const o of outcomes) {
      if (o.status === 'rejected') { failed++; codes.add(String((o.reason as any)?.message ?? 'error')); continue }
      for (const r of o.value ?? []) {
        if (r.status === 'fulfilled') sent++
        else { failed++; codes.add(String((r.reason as any)?.statusCode ?? (r.reason as any)?.message ?? 'error')) }
      }
    }
    return done({ sent, failed, note: `${recipients.length} recipients${codes.size ? `; errors: ${Array.from(codes).join(', ')}` : ''}` })
  } catch (err: any) {
    return done({ sent: 0, failed: 0, note: `error: ${err?.message ?? err}` })
  }
}
