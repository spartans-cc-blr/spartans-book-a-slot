// GET /api/tournaments/[id]/suggested-slots
//
// GC/Admin only. Finds up to 3 upcoming (Sat/Sun) slots for this tournament
// that pass the same R1-R6 booking rules engine used by the admin booking
// form (src/lib/validation.ts) — reused as-is here rather than reimplemented,
// so a suggestion can never contradict what the form would actually accept.
//
// Deliberately does NOT consider a captain's overall cross-tournament slot
// balance (the Captain Bandwidth "Overall slot balance" signal) — that's a
// separate fairness feature. Ranking here only prefers slots this specific
// tournament itself has used least, so its own slot spread stays balanced.
//
// Suggestions are selected incrementally: each accepted candidate is folded
// into the working "existing bookings" set before the next candidate is
// checked, so all 3 suggestions remain mutually valid if the organiser
// books all of them (otherwise two suggestions from the same weekend could
// each look valid alone while jointly breaking R1's weekend cap).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { validateBooking } from '@/lib/validation'
import type { CreateBookingRequest, GameFormat, SlotTime } from '@/types'

const SLOT_DEFS: { time: SlotTime; validFor: GameFormat[] }[] = [
  { time: '07:30', validFor: ['T20', 'T30'] },
  { time: '10:30', validFor: ['T20'] },
  { time: '12:30', validFor: ['T30'] },
  { time: '14:30', validFor: ['T20'] },
]

const HORIZON_WEEKS = 16
const MAX_SUGGESTIONS = 3

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin && !user?.isGC) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }

  const supabase = createServiceClient()

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, captain_id, captains!tournaments_captain_id_fkey(id, name)')
    .eq('id', params.id)
    .single()

  if (tErr || !tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }

  const thisTournamentCaptainId = tournament.captain_id ?? null
  const captainName = (tournament.captains as any)?.name ?? 'This captain'
  const tournamentName = tournament.name

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Start from the next Saturday strictly after today — never suggest a same-day slot.
  let firstSat = addDays(today, (6 - today.getDay() + 7) % 7)
  if (toISODate(firstSat) === toISODate(today)) firstSat = addDays(firstSat, 7)
  const horizonEnd = addDays(firstSat, HORIZON_WEEKS * 7)

  // This tournament's own confirmed games — used only to rank candidate
  // slots by how under-used they are for THIS tournament specifically.
  const { data: ownGames, error: ownErr } = await supabase
    .from('bookings')
    .select('slot_time, format')
    .eq('tournament_id', params.id)
    .eq('status', 'confirmed')

  if (ownErr) return NextResponse.json({ error: ownErr.message }, { status: 500 })

  const ownSlotCounts: Record<string, number> = {}
  for (const g of ownGames ?? []) {
    ownSlotCounts[g.slot_time] = (ownSlotCounts[g.slot_time] ?? 0) + 1
  }
  const activeFormats = Array.from(new Set(
    (ownGames ?? []).map(g => g.format).filter((f): f is GameFormat => !!f)
  ))

  // All non-cancelled bookings within the suggestion horizon, club-wide —
  // R1/R4/R5/R6 depend on every booking that day/weekend, not just this
  // tournament's, and R3's monthly cap needs this tournament's games within
  // the horizon too (already covered since tournament_id is on every row).
  const { data: existingRaw, error: existingErr } = await supabase
    .from('bookings')
    .select('*, tournament:tournaments!bookings_tournament_id_fkey(id, name, captain_id)')
    .neq('status', 'cancelled')
    .gte('game_date', toISODate(firstSat))
    .lte('game_date', toISODate(horizonEnd))

  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })

  const existing = (existingRaw ?? []).map((b: any) => ({
    ...b,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  }))

  // Build the full candidate list (weekend x slot), ranked by this
  // tournament's own slot balance (least-used slot first), then soonest
  // date first as a tie-break.
  type Candidate = { game_date: string; slot_time: SlotTime; format: GameFormat; day: 'Sat' | 'Sun' }
  const candidates: Candidate[] = []
  for (let week = 0; week < HORIZON_WEEKS; week++) {
    const sat = addDays(firstSat, week * 7)
    const sun = addDays(sat, 1)
    for (const [date, day] of [[sat, 'Sat'], [sun, 'Sun']] as const) {
      for (const slotDef of SLOT_DEFS) {
        const candidateFormats = activeFormats.length
          ? slotDef.validFor.filter(f => activeFormats.includes(f))
          : slotDef.validFor
        if (candidateFormats.length === 0) continue
        candidates.push({
          game_date: toISODate(date),
          slot_time: slotDef.time,
          format: candidateFormats[0],
          day,
        })
      }
    }
  }
  // Incremental selection — re-ranked before EVERY pick, not sorted once up
  // front. ownSlotCounts is mutated as each suggestion is accepted, so two
  // slots tied at (say) 0 games each get suggested once before either gets
  // suggested a second time — otherwise a static one-time sort just finds
  // "the single least-used slot" and keeps handing out that same slot_time
  // for all 3 suggestions, which defeats the point of spreading league games
  // across every available slot at least once.
  const working = [...existing]
  const suggestions: Candidate[] = []
  const remaining = [...candidates]

  while (suggestions.length < MAX_SUGGESTIONS && remaining.length > 0) {
    remaining.sort((a, b) => {
      const aCount = ownSlotCounts[a.slot_time] ?? 0
      const bCount = ownSlotCounts[b.slot_time] ?? 0
      if (aCount !== bCount) return aCount - bCount
      return a.game_date.localeCompare(b.game_date)
    })

    const pickedIndex = remaining.findIndex(candidate => {
      const body: CreateBookingRequest = {
        game_date: candidate.game_date,
        slot_time: candidate.slot_time,
        format: candidate.format,
        tournament_id: params.id,
      }
      const result = validateBooking(body, working, captainName, tournamentName, thisTournamentCaptainId)
      return result.errors.length === 0 && result.warnings.length === 0
    })

    if (pickedIndex === -1) break // nothing left in the horizon is valid at all

    const [picked] = remaining.splice(pickedIndex, 1)
    suggestions.push(picked)
    ownSlotCounts[picked.slot_time] = (ownSlotCounts[picked.slot_time] ?? 0) + 1
    working.push({
      id: `candidate-${suggestions.length}`,
      game_date: picked.game_date,
      slot_time: picked.slot_time,
      format: picked.format,
      venue: null,
      tournament_id: params.id,
      status: 'confirmed',
      block_reason: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tournament: { captain_id: thisTournamentCaptainId } as any,
    } as any)
  }

  return NextResponse.json({ suggestions })
}
