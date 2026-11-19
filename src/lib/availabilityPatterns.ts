// Server-only fetch for the Council "Availability Patterns" page. Reads Hub
// tables with the service role and hands plain arrays to the pure analysis in
// availabilityPatternsCore.ts. See .claude/rules/features/availability-patterns.md.
import { createServiceClient } from '@/lib/supabase'
import { istToday } from '@/lib/matchCompletion'
import { isWeekdayHoliday, oneDayTournamentDates } from '@/lib/holidays'
import {
  computeAvailabilityPatterns,
  type PatternBooking,
  type PatternResponse,
  type PlayerPattern,
} from '@/lib/availabilityPatternsCore'

export * from '@/lib/availabilityPatternsCore'

export const PATTERN_PERIODS = ['3', '6', '12', 'all'] as const
export type PatternPeriod = typeof PATTERN_PERIODS[number]
export const DEFAULT_PATTERN_PERIOD: PatternPeriod = '6'

const PAGE = 1000

// PostgREST caps an unpaginated response at 1000 rows; availability,
// squad and the audit log are all past that, so every read pages.
async function fetchAll<T>(build: () => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function sinceDate(period: PatternPeriod): string | null {
  if (period === 'all') return null
  const d = new Date(istToday() + 'T00:00:00')
  d.setMonth(d.getMonth() - Number(period))
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// IST wall-clock date + time → ISO instant.
function istInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString()
}

function minusDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// When player availability closes for a game: Thursday 08:00 IST before a
// Sat/Sun game (the lock-availability cron), the start time for a weekday
// game (no Thursday lock applies). An earlier lock from a squad draft isn't
// recorded with a time, so it isn't modelled.
function availabilityCutoff(gameDate: string, slot: string, dow: number): string {
  if (dow === 6) return istInstant(minusDays(gameDate, 2), '08:00')
  if (dow === 0) return istInstant(minusDays(gameDate, 3), '08:00')
  return istInstant(gameDate, slot.slice(0, 5))
}

export interface AvailabilityPatternsResult {
  players: PlayerPattern[]
  since: string | null
  until: string
  bookingCount: number
}

export async function getAvailabilityPatterns(period: PatternPeriod): Promise<AvailabilityPatternsResult> {
  const supabase = createServiceClient()
  const today = istToday()
  const since = sinceDate(period)

  // Past confirmed games only: a future game's availability is still open.
  const rawBookings = await fetchAll<any>(() => {
    let q = supabase
      .from('bookings')
      .select('id, game_date, slot_time, format, captain_id, ground_id, tournament_id, created_at, tournament:tournaments!bookings_tournament_id_fkey(captain_id, ground_id)')
      .eq('status', 'confirmed')
      .lt('game_date', today)
      .order('id')
    if (since) q = q.gte('game_date', since)
    return q
  })

  const [captainsRes, groundsRes, players] = await Promise.all([
    supabase.from('captains').select('id, name, player_id'),
    supabase.from('grounds').select('id, name'),
    fetchAll<any>(() => supabase.from('players').select('id, name, status').neq('status', 'expelled').order('id')),
  ])
  if (captainsRes.error) throw new Error(captainsRes.error.message)
  if (groundsRes.error) throw new Error(groundsRes.error.message)
  const captains = new Map<string, { name: string; player_id: string | null }>(
    (captainsRes.data ?? []).map((c: any) => [c.id, { name: c.name, player_id: c.player_id }]),
  )
  const grounds = new Map<string, string>((groundsRes.data ?? []).map((g: any) => [g.id, g.name]))

  // Weekday dates that hosted a one-day tournament count as holidays too.
  const oneDayDates = oneDayTournamentDates(
    rawBookings.map(b => ({ gameDate: b.game_date, tournamentId: b.tournament_id ?? null, format: b.format ?? null })),
  )
  const bookings: PatternBooking[] = rawBookings.map(b => {
    const t = Array.isArray(b.tournament) ? b.tournament[0] : b.tournament
    const captainId: string | null = b.captain_id ?? t?.captain_id ?? null
    const groundId: string | null = b.ground_id ?? t?.ground_id ?? null
    const dow = new Date(b.game_date + 'T00:00:00').getDay()
    const cap = captainId ? captains.get(captainId) : undefined
    return {
      id: b.id,
      gameDate: b.game_date,
      slot: String(b.slot_time),
      format: String(b.format ?? ''),
      dayType: dow === 6 ? 'Sat' : dow === 0 ? 'Sun' : (isWeekdayHoliday(b.game_date) || oneDayDates.has(b.game_date)) ? 'Holiday' : 'Weekday',
      captainId,
      captainName: cap?.name ?? null,
      captainPlayerId: cap?.player_id ?? null,
      groundId,
      groundName: groundId ? grounds.get(groundId) ?? null : null,
      bookedAt: b.created_at ?? null,
      cutoffAt: availabilityCutoff(b.game_date, String(b.slot_time), dow),
    }
  })

  const bookingIds = bookings.map(b => b.id)
  const responses: PatternResponse[] = []
  const withdrawals = new Map<string, number>()
  const selected = new Set<string>()
  const firstResponseAt = new Map<string, string>()

  for (const ids of chunk(bookingIds, 150)) {
    const [avail, squad, audit, firsts] = await Promise.all([
      fetchAll<any>(() => supabase.from('availability').select('id, player_id, booking_id, response').in('booking_id', ids).order('id')),
      fetchAll<any>(() => supabase.from('squad').select('player_id, booking_id').in('booking_id', ids).eq('status', 'announced').order('booking_id').order('player_id')),
      // Only a player's own switch from Y/O/E to L counts as a withdrawal.
      // A cleared response (DELETE) is logged without its old value, so it
      // can't be attributed and is not counted.
      fetchAll<any>(() => supabase.from('availability_audit').select('id, player_id').in('booking_id', ids)
        .eq('update_source', 'player').eq('new_response', 'L').in('old_response', ['Y', 'O', 'E']).order('id')),
      // Every response the player made themselves, for response timing; the
      // earliest per game is their first answer. Captain proxy entries and
      // clears are left out. The audit log starts 28 Mar 2026.
      fetchAll<any>(() => supabase.from('availability_audit').select('id, player_id, booking_id, created_at').in('booking_id', ids)
        .eq('update_source', 'player').neq('new_response', 'CLEARED').order('id')),
    ])
    for (const r of avail) responses.push({ playerId: r.player_id, bookingId: r.booking_id, response: r.response })
    for (const s of squad) selected.add(`${s.player_id}|${s.booking_id}`)
    for (const a of audit) withdrawals.set(a.player_id, (withdrawals.get(a.player_id) ?? 0) + 1)
    for (const f of firsts) {
      const key = `${f.player_id}|${f.booking_id}`
      const prev = firstResponseAt.get(key)
      if (!prev || f.created_at < prev) firstResponseAt.set(key, f.created_at)
    }
  }

  const patterns = computeAvailabilityPatterns({
    bookings,
    players: players.map(p => ({ id: p.id, name: p.name, status: p.status })),
    responses, withdrawals, selected, firstResponseAt,
  })

  // Players with no response in the period have nothing to show.
  return {
    players: patterns.filter(p => p.offered > 0),
    since,
    until: today,
    bookingCount: bookings.length,
  }
}
