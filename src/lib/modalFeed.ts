// Shared data readers behind the club-wide modals (milestone recognition,
// birthday wishes) so both the individual routes and the combined
// /api/modals/pending feed return exactly the same thing.

import { createServiceClient } from '@/lib/supabase'
import { getTodaysBirthdays, istDateString } from '@/lib/birthdays'
import { istToday } from '@/lib/matchCompletion'
import { hasMatchEnded } from '@/lib/matchStatus'

const MAX_RESULTS = 20

type Supabase = ReturnType<typeof createServiceClient>

export async function getUnseenAchievements(supabase: Supabase, playerId: string) {
  const { data: me, error: meErr } = await supabase
    .from('players').select('milestones_seen_at').eq('id', playerId).single()
  if (meErr) throw new Error(meErr.message)

  const cursor = me?.milestones_seen_at ?? '1970-01-01'

  const [{ data: seasonRows, error: seasonErr }, { data: perfRows, error: perfErr }] = await Promise.all([
    supabase
      .from('milestone_achievements')
      .select(`
        id, achieved_at,
        milestone_type, milestone_value, year,
        player:players(id, name, photo_url, cricheroes_url),
        booking:bookings(game_date, opponent_name)
      `)
      .gt('achieved_at', cursor)
      .order('achieved_at', { ascending: true })
      .limit(MAX_RESULTS),
    supabase
      .from('match_performance_achievements')
      .select(`
        id, achieved_at,
        performance_type, value,
        player:players(id, name, photo_url, cricheroes_url),
        booking:bookings(game_date, opponent_name)
      `)
      .gt('achieved_at', cursor)
      .order('achieved_at', { ascending: true })
      .limit(MAX_RESULTS),
  ])

  if (seasonErr) throw new Error(seasonErr.message)
  if (perfErr) throw new Error(perfErr.message)

  const combined = [
    ...(seasonRows ?? []).map(r => ({ kind: 'season' as const, ...r })),
    ...(perfRows ?? []).map(r => ({ kind: 'match' as const, ...r })),
  ]
    .sort((a, b) => a.achieved_at.localeCompare(b.achieved_at))
    .slice(0, MAX_RESULTS)

  return combined
}

export async function getUnseenBirthdays(supabase: Supabase, playerId: string) {
  const { data: me, error: meErr } = await supabase
    .from('players').select('birthday_wishes_seen_date').eq('id', playerId).single()
  if (meErr) throw new Error(meErr.message)
  if (me?.birthday_wishes_seen_date === istDateString()) return []
  return getTodaysBirthdays()
}

// Upcoming confirmed games this player can still mark and hasn't: not yet
// ended, not availability-locked, no availability row. Drives the app-icon
// badge only — a count, never shown as fixture data.
export async function getUnmarkedFixtureCount(supabase: Supabase, playerId: string): Promise<number> {
  const today = istToday()
  const [{ data: bookings, error }, { data: marked, error: mErr }] = await Promise.all([
    supabase.from('bookings')
      .select('id, game_date, slot_time, format')
      .eq('status', 'confirmed').eq('availability_locked', false).gte('game_date', today),
    supabase.from('availability').select('booking_id').eq('player_id', playerId),
  ])
  if (error) throw new Error(error.message)
  if (mErr) throw new Error(mErr.message)
  const done = new Set((marked ?? []).map((r: any) => r.booking_id))
  return (bookings ?? []).filter((b: any) =>
    !done.has(b.id) && !(b.game_date === today && hasMatchEnded(b.game_date, b.slot_time, b.format)),
  ).length
}
