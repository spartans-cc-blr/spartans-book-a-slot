// src/lib/availabilityNudge.ts
//
// Core logic for the Sun 8pm → Wed 8pm availability nudge cadence.
// Reminds players to mark availability for `nextLockWeekend` — the Sat/Sun
// pair that the upcoming Thursday 08:00 IST lock-availability cron will freeze.
//
// Shared by:
//   - src/app/api/cron/availability-nudge/route.ts (sends pushes, writes the log)
//   - src/app/page.tsx (read-only "matches your pattern" dashboard section)
//
// Copy rules (hard constraints — see push_notifications spec):
//   - Always name the explicit date, never "this weekend"
//   - No scarcity / social-proof / comparative language, no raw counts
//   - Deadline framing ("locks tomorrow at 8am") is the one factual exception
//
// Out of scope for this pass: the "discovery" themes (format stretch / novel
// slot) — the spec describes them as an at-most-once-per-cycle addition with
// no defined trigger day, separate from this Sun–Wed cadence.

import { createServiceClient } from '@/lib/supabase'

type ServiceClient = ReturnType<typeof createServiceClient>

export const MIN_HISTORY_SAMPLE = 6

export type NudgeTheme =
  | 'habitual'
  | 'same_format_new_slot'
  | 'tournament_eligibility'
  | 'gap_reminder'
  | 'reactivation_1'
  | 'reactivation_2'
  | 'deadline'

// Priority order tried fresh each day for active players with enough
// history — replaces the old fixed dow-locked mapping (Fix 7). Themes
// already used this week are skipped; gap_reminder is the unconditional
// fallback (matches any remaining gap), which is what guarantees a nudge
// every day rather than going silent when today's "expected" theme happens
// not to match any current gap.
const ACTIVE_THEME_PRIORITY: readonly Exclude<NudgeTheme, 'deadline' | 'reactivation_1' | 'reactivation_2'>[] = [
  'habitual',
  'same_format_new_slot',
  'tournament_eligibility',
  'gap_reminder',
]

export interface NudgeBooking {
  id: string
  game_date: string          // YYYY-MM-DD
  slot_time: string
  match_time: string | null
  format: string
  tournament_id: string | null
  tournament_name: string | null
}

export interface NudgeCandidate {
  playerId: string
  booking: NudgeBooking
  theme: Exclude<NudgeTheme, 'deadline'>
}

// Wednesday is a last-chance warning, not an invitation to one opportunity —
// it must name every booking the player still has a gap on, not just one.
// `representativeBooking` exists only so the caller has a single booking_id
// to write to availability_nudge_log (the idempotency guard is per-day, not
// per-booking) and a single deep link for the push; the actual copy is built
// from the full `gapBookings` list via buildDeadlineCopy().
export interface DeadlineNudgeCandidate {
  playerId: string
  theme: 'deadline'
  representativeBooking: NudgeBooking
  gapBookings: NudgeBooking[]
}

interface PlayerHistory {
  hasEnoughSample: boolean
  favoriteDow: number | null     // 0=Sun..6=Sat
  favoriteSlot: string | null
  favoriteFormat: string | null
  tournamentIdsWithResponse: Set<string>
}

export interface PriorNudge {
  bookingId: string
  slotTime: string
}

// ── Date / label helpers ────────────────────────────────────────────────────

const SLOT_LABELS: Record<string, string> = {
  '07:30': '7:15 AM', '10:30': '10:15 AM', '12:30': '12:15 PM', '14:30': '2:15 PM',
}

function slotLabel(slot: string): string {
  return SLOT_LABELS[slot] ?? slot
}

function formatReportingTime(matchTime: string | null): string {
  if (!matchTime) return ''
  const [h, m] = matchTime.split(':').map(Number)
  const totalMinutes = h * 60 + m - 15   // reporting time is 15 min before kickoff
  const rh = Math.floor(totalMinutes / 60)
  const rm = totalMinutes % 60
  const period = rh >= 12 ? 'PM' : 'AM'
  const hour12 = rh % 12 || 12
  return `${hour12}${rm > 0 ? `:${String(rm).padStart(2, '0')}` : ''} ${period}`
}

function formatNudgeDateOnly(booking: NudgeBooking): string {
  const d = new Date(booking.game_date + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatNudgeDateTime(booking: NudgeBooking): string {
  const timeLabel = formatReportingTime(booking.match_time) || slotLabel(booking.slot_time)
  return `${formatNudgeDateOnly(booking)}, ${timeLabel}`
}

// ── nextLockWeekend — mirrors lock-availability cron's own Sat/Sun calc ────
// Thursday cron: saturday = thursday+2, sunday = thursday+3.
// From any day Sun(0)..Wed(3), the next Thursday is (4 - dow) days out.
export function getNextLockWeekendDates(now = new Date()) {
  const dow = now.getDay()
  const daysUntilThursday = ((4 - dow) % 7 + 7) % 7 || 7
  const thursday = new Date(now)
  thursday.setDate(now.getDate() + daysUntilThursday)
  const saturday = new Date(thursday)
  saturday.setDate(thursday.getDate() + 2)
  const sunday = new Date(saturday)
  sunday.setDate(saturday.getDate() + 1)
  return {
    saturday: saturday.toISOString().split('T')[0],
    sunday: sunday.toISOString().split('T')[0],
    dow,
  }
}

// ── Historical frequency — Y/O/E responses only (genuine-willingness signal) ─
// L (deliberate unavailability) and blank (no data) are excluded.
export async function buildPlayerHistories(
  supabase: ServiceClient,
  playerIds: string[]
): Promise<Map<string, PlayerHistory>> {
  const map = new Map<string, PlayerHistory>()
  if (!playerIds.length) return map

  // bookings.status filtered to 'confirmed' — otherwise a cancelled
  // (rescheduled-away) booking's availability response still counts toward
  // this player's habitual day/slot/format pattern, skewing which theme
  // pickNudgeCandidate() picks off a game that never actually happened.
  const { data } = await supabase
    .from('availability')
    .select('player_id, response, bookings!inner(slot_time, format, game_date, tournament_id)')
    .in('player_id', playerIds)
    .in('response', ['Y', 'O', 'E'])
    .eq('bookings.status', 'confirmed')

  type Row = {
    player_id: string
    bookings: { slot_time: string; format: string; game_date: string; tournament_id: string | null }
  }

  const byPlayer = new Map<string, Row[]>()
  for (const row of ((data ?? []) as unknown as Row[])) {
    const list = byPlayer.get(row.player_id) ?? []
    list.push(row)
    byPlayer.set(row.player_id, list)
  }

  for (const playerId of playerIds) {
    const rows = byPlayer.get(playerId) ?? []
    const dowSlotCounts = new Map<string, number>()
    const formatCounts = new Map<string, number>()
    const tournamentIds = new Set<string>()

    for (const row of rows) {
      const dow = new Date(row.bookings.game_date + 'T00:00:00').getDay()
      const key = `${dow}|${row.bookings.slot_time}`
      dowSlotCounts.set(key, (dowSlotCounts.get(key) ?? 0) + 1)
      formatCounts.set(row.bookings.format, (formatCounts.get(row.bookings.format) ?? 0) + 1)
      if (row.bookings.tournament_id) tournamentIds.add(row.bookings.tournament_id)
    }

    let favoriteDow: number | null = null
    let favoriteSlot: string | null = null
    let bestDowSlotCount = 0
    dowSlotCounts.forEach((count, key) => {
      if (count > bestDowSlotCount) {
        bestDowSlotCount = count
        const [dowStr, slot] = key.split('|')
        favoriteDow = Number(dowStr)
        favoriteSlot = slot
      }
    })

    let favoriteFormat: string | null = null
    let bestFormatCount = 0
    formatCounts.forEach((count, format) => {
      if (count > bestFormatCount) {
        bestFormatCount = count
        favoriteFormat = format
      }
    })

    map.set(playerId, {
      hasEnoughSample: rows.length >= MIN_HISTORY_SAMPLE,
      favoriteDow,
      favoriteSlot,
      favoriteFormat,
      tournamentIdsWithResponse: tournamentIds,
    })
  }

  return map
}

// Returns every gap booking that satisfies `theme`'s condition, or null if
// none do. gap_reminder has no condition beyond "a gap exists" — it always
// matches every remaining gap booking, which is what makes it a true
// fallback of last resort in the priority loop below.
function matchThemesCandidates(
  theme: Exclude<NudgeTheme, 'deadline' | 'reactivation_1' | 'reactivation_2'>,
  gapBookings: NudgeBooking[],
  history: PlayerHistory
): NudgeBooking[] {
  switch (theme) {
    case 'habitual':
      return gapBookings.filter(b =>
        new Date(b.game_date + 'T00:00:00').getDay() === history.favoriteDow &&
        b.slot_time === history.favoriteSlot
      )
    case 'same_format_new_slot':
      return gapBookings.filter(b => b.format === history.favoriteFormat)
    case 'tournament_eligibility':
      return gapBookings.filter(b => !!b.tournament_id && !history.tournamentIdsWithResponse.has(b.tournament_id))
    case 'gap_reminder':
      return gapBookings
  }
}

// Among a theme's matching bookings, prefer one not yet referenced by an
// earlier nudge this week — spreads coverage across a player's gaps instead
// of repeatedly naming the same booking under different themes when
// alternatives exist. Soft preference: falls back to a previously-
// referenced booking once every match has already been mentioned once.
function pickPreferredBooking(matches: NudgeBooking[], referencedBookingIds: Set<string>): NudgeBooking {
  return matches.find(b => !referencedBookingIds.has(b.id)) ?? matches[0]
}

// ── Candidate selection — one theme/booking per player per day ─────────────
// dow: 0=Sun, 1=Mon, 2=Tue, 3=Wed. gapBookings must already be filtered to
// bookings this player has NOT responded to (any of Y/O/E/L counts as answered).
export function pickNudgeCandidate(
  dow: number,
  playerId: string,
  playerStatus: 'active' | 'inactive',
  gapBookings: NudgeBooking[],
  history: PlayerHistory,
  priorNudgeThisWeek: PriorNudge | null,
  usedThemesThisWeek: Set<NudgeTheme>,
  referencedBookingIds: Set<string>
): NudgeCandidate | DeadlineNudgeCandidate | null {
  if (!gapBookings.length) return null

  // Wednesday — always fires if still unanswered, overrides theme choice,
  // and must cover every remaining gap booking (not just one): this is the
  // last nudge before the irreversible Thursday 8am lock, so unlike the
  // invitational Sun/Mon/Tue priority list below, it can't afford to warn
  // about only one of several open bookings. representativeBooking carries
  // the same reference used earlier in the week where possible, purely so
  // the daily log row / push deep-link has one concrete booking to point
  // at — the actual copy is built from the full gapBookings list.
  if (dow === 3) {
    const carried = priorNudgeThisWeek
      ? gapBookings.find(b => b.id === priorNudgeThisWeek.bookingId)
      : undefined
    const representativeBooking = carried ?? gapBookings[0]
    return { playerId, theme: 'deadline', representativeBooking, gapBookings }
  }

  // Deliberate: inactive players always get generic reactivation copy,
  // regardless of how much habitual-pattern history they have. Presuming a
  // lapsed player still wants their old slot back is presumptuous — a plain
  // "come back anytime" is the safer re-engagement hook. Do not change this
  // to `playerStatus === 'inactive' && !history.hasEnoughSample` without a
  // product decision — see availability-nudge follow-up spec, Fix 3 Option A.
  // Unaffected by the Fix 7 priority list below — "first vs subsequent" is
  // derived from usedThemesThisWeek rather than dow, so it works no matter
  // which day this player's first nudge of the week actually lands on.
  const noHistory = playerStatus === 'inactive' || !history.hasEnoughSample
  if (noHistory) {
    const booking = gapBookings[0]
    const theme = usedThemesThisWeek.size === 0 ? 'reactivation_1' : 'reactivation_2'
    return { playerId, booking, theme }
  }

  // Fix 7: try each theme in priority order, skipping whatever's already
  // been sent this week. Replaces the old fixed dow-locked mapping, which
  // returned null (no nudge at all that day) whenever today's "expected"
  // theme didn't happen to match any current gap.
  for (const theme of ACTIVE_THEME_PRIORITY) {
    if (usedThemesThisWeek.has(theme)) continue
    const matches = matchThemesCandidates(theme, gapBookings, history)
    if (!matches.length) continue
    const booking = pickPreferredBooking(matches, referencedBookingIds)
    return { playerId, booking, theme }
  }

  // Only reachable if every applicable theme — including the unconditional
  // gap_reminder — has already been used on this player this week.
  return null
}

// ── Copy — self-referential only, explicit date always, no counts/scarcity ─
// 'deadline' is handled by the dedicated buildDeadlineCopy() below — it needs
// every remaining gap booking, not just one, so it isn't part of this switch.
export function buildNudgeCopy(theme: NudgeCandidate['theme'], booking: NudgeBooking): { title: string; body: string } {
  const dt = formatNudgeDateTime(booking)
  switch (theme) {
    case 'habitual':
      return {
        title: '🏏 Your usual slot is open',
        body: `Your usual slot — ${dt} — is open. You haven't marked your availability yet.`,
      }
    case 'same_format_new_slot':
      return {
        title: `🏏 ${booking.format} slot open`,
        body: `A ${booking.format} slot is open on ${dt} — same format you usually play.`,
      }
    case 'tournament_eligibility':
      return {
        title: '🏏 Stay eligible',
        body: `You haven't featured in ${booking.tournament_name ?? 'this tournament'} yet — ${dt} keeps you eligible if we reach the knockouts.`,
      }
    case 'reactivation_1':
      return {
        title: '🏏 Jump back in',
        body: `It's been a while, Spartans! A game's open on ${dt} — jump back in anytime.`,
      }
    case 'reactivation_2':
      return {
        title: '🏏 Still open',
        body: `Still open: ${dt}. Whenever you're ready to play again.`,
      }
    case 'gap_reminder':
      return {
        title: '🏏 Slot still open',
        body: `${dt} is still open — you haven't marked your availability yet.`,
      }
  }
}

// Wednesday's last-chance warning — must name every booking the player still
// has a gap on. Naming a player's own count/list of outstanding items is
// consistent with the existing Pending Availability dashboard card (which
// already states a personal number) — this is not the others'-response-count
// scarcity pattern the no-counts rule was written to prevent.
export function buildDeadlineCopy(gapBookings: NudgeBooking[]): { title: string; body: string } {
  const title = '⏰ Locks tomorrow at 8am'
  if (!gapBookings.length) return { title, body: 'Availability locks tomorrow at 8am.' }

  // nextLockWeekend only ever spans Sat + Sun, but dedupe by game_date first
  // regardless — two unresponded slots on the same day must not repeat the
  // same date twice in the copy.
  const uniqueDates = Array.from(new Set(gapBookings.map(b => b.game_date))).sort()
  const dateLabels = uniqueDates.map(gameDate =>
    formatNudgeDateOnly(gapBookings.find(b => b.game_date === gameDate)!)
  )

  if (dateLabels.length === 1) {
    return {
      title,
      body: `Availability for ${dateLabels[0]} locks tomorrow at 8am — you haven't marked yours yet.`,
    }
  }
  if (dateLabels.length === 2) {
    return {
      title,
      body: `Availability locks tomorrow at 8am — you haven't marked ${dateLabels[0]} or ${dateLabels[1]} yet.`,
    }
  }
  return {
    title,
    body: `Availability locks tomorrow at 8am — you still have slots open on ${dateLabels.join(', ')} that you haven't marked yet.`,
  }
}

// ── Shared booking fetch — nextLockWeekend, confirmed, not yet locked ──────
export async function fetchNextLockWeekendBookings(
  supabase: ServiceClient,
  now = new Date()
): Promise<NudgeBooking[]> {
  const { saturday, sunday } = getNextLockWeekendDates(now)

  const { data } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, match_time, format, tournament_id, tournament:tournaments(name)')
    .in('game_date', [saturday, sunday])
    .eq('status', 'confirmed')
    .eq('availability_locked', false)

  return (data ?? [])
    .map(b => ({
      id: b.id,
      game_date: b.game_date,
      slot_time: b.slot_time,
      match_time: b.match_time,
      format: b.format,
      tournament_id: b.tournament_id,
      tournament_name: (b.tournament as any)?.name ?? null,
    }))
    .sort((a, b) => (a.game_date === b.game_date
      ? a.slot_time.localeCompare(b.slot_time)
      : a.game_date.localeCompare(b.game_date)))
}

// ── Most recent nudge already sent to this player earlier in the current
// Sun–Wed cycle (used by Wednesday's carried-booking rule — see Fix 6).
// ────────────────────────────────────────────────────────────────────────
export async function getPriorNudgeThisWeek(
  supabase: ServiceClient,
  playerId: string,
  bookingSlotMap: Map<string, string>,
  now = new Date()
): Promise<PriorNudge | null> {
  const dow = now.getDay()
  const today = now.toISOString().split('T')[0]
  const thisSunday = new Date(now)
  thisSunday.setDate(now.getDate() - dow)
  const thisSundayStr = thisSunday.toISOString().split('T')[0]

  const { data } = await supabase
    .from('availability_nudge_log')
    .select('booking_id, nudge_date')
    .eq('player_id', playerId)
    .gte('nudge_date', thisSundayStr)
    .lt('nudge_date', today)
    .order('nudge_date', { ascending: false })
    .limit(1)

  const row = data?.[0]
  if (!row) return null
  return { bookingId: row.booking_id, slotTime: bookingSlotMap.get(row.booking_id) ?? '' }
}

// ── Batched version of getPriorNudgeThisWeek — one round-trip for the whole
// roster instead of one query per player. Used by the cron's main loop;
// getPriorNudgeThisWeek() itself stays as-is for the single-player dashboard
// pipeline (getNudgeForPlayer), which only ever needs one player's data. ──
export async function getPriorNudgesThisWeek(
  supabase: ServiceClient,
  playerIds: string[],
  bookingSlotMap: Map<string, string>,
  now = new Date()
): Promise<Map<string, PriorNudge>> {
  const result = new Map<string, PriorNudge>()
  if (!playerIds.length) return result

  const dow = now.getDay()
  const today = now.toISOString().split('T')[0]
  const thisSunday = new Date(now)
  thisSunday.setDate(now.getDate() - dow)
  const thisSundayStr = thisSunday.toISOString().split('T')[0]

  const { data } = await supabase
    .from('availability_nudge_log')
    .select('player_id, booking_id, nudge_date')
    .in('player_id', playerIds)
    .gte('nudge_date', thisSundayStr)
    .lt('nudge_date', today)
    .order('nudge_date', { ascending: false })

  // Rows arrive most-recent-first — keep only the first (i.e. most recent)
  // row seen per player.
  for (const row of (data ?? [])) {
    if (result.has(row.player_id)) continue
    result.set(row.player_id, {
      bookingId: row.booking_id,
      slotTime: bookingSlotMap.get(row.booking_id) ?? '',
    })
  }

  return result
}

// ── Fix 7 — which themes this player has already been nudged with this
// week (powers the priority list's skip-already-used rule). ───────────────
export async function getThemesUsedThisWeek(
  supabase: ServiceClient,
  playerId: string,
  now = new Date()
): Promise<Set<NudgeTheme>> {
  const dow = now.getDay()
  const today = now.toISOString().split('T')[0]
  const thisSunday = new Date(now)
  thisSunday.setDate(now.getDate() - dow)
  const thisSundayStr = thisSunday.toISOString().split('T')[0]

  const { data } = await supabase
    .from('availability_nudge_log')
    .select('theme')
    .eq('player_id', playerId)
    .gte('nudge_date', thisSundayStr)
    .lt('nudge_date', today)

  return new Set((data ?? []).map(r => r.theme as NudgeTheme))
}

// ── Fix 7 — which booking_ids have already been referenced by a nudge to
// this player this week (powers the soft "prefer an unreferenced booking"
// preference in the priority loop, so repeated nudges spread across a
// player's gaps instead of always naming the same one). ───────────────────
export async function getReferencedBookingIdsThisWeek(
  supabase: ServiceClient,
  playerId: string,
  now = new Date()
): Promise<Set<string>> {
  const dow = now.getDay()
  const today = now.toISOString().split('T')[0]
  const thisSunday = new Date(now)
  thisSunday.setDate(now.getDate() - dow)
  const thisSundayStr = thisSunday.toISOString().split('T')[0]

  const { data } = await supabase
    .from('availability_nudge_log')
    .select('booking_id')
    .eq('player_id', playerId)
    .gte('nudge_date', thisSundayStr)
    .lt('nudge_date', today)

  return new Set((data ?? []).map(r => r.booking_id))
}

export interface WeeklyNudgeHistoryEntry {
  usedThemes: Set<NudgeTheme>
  referencedBookingIds: Set<string>
}

// ── Batched version combining getThemesUsedThisWeek + getReferencedBookingIdsThisWeek
// into one round-trip for the whole roster (both are the same query window,
// just different columns) — same rationale as getPriorNudgesThisWeek in Fix 4:
// the cron's main loop must not do two more per-player queries on top of the
// ones Fix 4 already batched. The single-player helpers above stay as
// specified for getNudgeForPlayer's dashboard pipeline, which only ever
// needs one player's data. ──────────────────────────────────────────────────
export async function getWeeklyNudgeHistoryForPlayers(
  supabase: ServiceClient,
  playerIds: string[],
  now = new Date()
): Promise<Map<string, WeeklyNudgeHistoryEntry>> {
  const result = new Map<string, WeeklyNudgeHistoryEntry>()
  if (!playerIds.length) return result

  const dow = now.getDay()
  const today = now.toISOString().split('T')[0]
  const thisSunday = new Date(now)
  thisSunday.setDate(now.getDate() - dow)
  const thisSundayStr = thisSunday.toISOString().split('T')[0]

  const { data } = await supabase
    .from('availability_nudge_log')
    .select('player_id, theme, booking_id')
    .in('player_id', playerIds)
    .gte('nudge_date', thisSundayStr)
    .lt('nudge_date', today)

  for (const row of (data ?? [])) {
    let entry = result.get(row.player_id)
    if (!entry) {
      entry = { usedThemes: new Set(), referencedBookingIds: new Set() }
      result.set(row.player_id, entry)
    }
    entry.usedThemes.add(row.theme as NudgeTheme)
    entry.referencedBookingIds.add(row.booking_id)
  }

  return result
}

// ── Day-agnostic weekend gap check — powers the first-open-of-day greeting
// dialog on the home page. Unlike getNudgeForPlayer() below, this has no
// Sun–Wed window and no theme/copy selection — it just answers "does this
// player still have an unanswered nextLockWeekend booking, right now." Once
// the Thursday lock cron fires, fetchNextLockWeekendBookings() naturally
// stops returning that weekend's rows (availability_locked = true), so the
// dialog stops prompting for a weekend nothing can be done about anymore.
export async function getWeekendGapForPlayer(
  supabase: ServiceClient,
  playerId: string,
  playerStatus: string | null | undefined
): Promise<NudgeBooking[]> {
  if (playerStatus === 'expelled') return []

  const bookingList = await fetchNextLockWeekendBookings(supabase)
  if (!bookingList.length) return []

  const { data: responded } = await supabase
    .from('availability')
    .select('booking_id')
    .eq('player_id', playerId)
    .in('booking_id', bookingList.map(b => b.id))

  const respondedIds = new Set((responded ?? []).map(r => r.booking_id))
  return bookingList.filter(b => !respondedIds.has(b.id))
}

// ── Single-player pipeline — used for the read-only dashboard section ──────
export async function getNudgeForPlayer(
  supabase: ServiceClient,
  playerId: string,
  playerStatus: string | null | undefined
): Promise<{ theme: NudgeTheme; booking: NudgeBooking; title: string; body: string } | null> {
  if (playerStatus === 'expelled') return null

  const now = new Date()
  const dow = now.getDay()
  if (dow > 3) return null   // outside the Sun 8pm–Wed 8pm nudge window

  const bookingList = await fetchNextLockWeekendBookings(supabase, now)
  if (!bookingList.length) return null
  const bookingIds = bookingList.map(b => b.id)

  const { data: responded } = await supabase
    .from('availability')
    .select('booking_id')
    .eq('player_id', playerId)
    .in('booking_id', bookingIds)

  const respondedIds = new Set((responded ?? []).map(r => r.booking_id))
  const gapBookings = bookingList.filter(b => !respondedIds.has(b.id))
  if (!gapBookings.length) return null

  const histories = await buildPlayerHistories(supabase, [playerId])
  const history = histories.get(playerId)!

  const bookingSlotMap = new Map(bookingList.map(b => [b.id, b.slot_time]))
  const prior = await getPriorNudgeThisWeek(supabase, playerId, bookingSlotMap, now)
  const usedThemesThisWeek = await getThemesUsedThisWeek(supabase, playerId, now)
  const referencedBookingIds = await getReferencedBookingIdsThisWeek(supabase, playerId, now)

  const candidate = pickNudgeCandidate(
    dow,
    playerId,
    playerStatus === 'inactive' ? 'inactive' : 'active',
    gapBookings,
    history,
    prior,
    usedThemesThisWeek,
    referencedBookingIds
  )
  if (!candidate) return null

  if (candidate.theme === 'deadline') {
    const { title, body } = buildDeadlineCopy(candidate.gapBookings)
    return { theme: candidate.theme, booking: candidate.representativeBooking, title, body }
  }

  const { title, body } = buildNudgeCopy(candidate.theme, candidate.booking)
  return { theme: candidate.theme, booking: candidate.booking, title, body }
}
