// Shared data readers behind the club-wide modals (milestone recognition,
// birthday wishes) so both the individual routes and the combined
// /api/modals/pending feed return exactly the same thing.

import { createServiceClient } from '@/lib/supabase'
import { getTodaysBirthdays, istDateString } from '@/lib/birthdays'

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
