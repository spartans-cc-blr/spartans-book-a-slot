// Shared match end-time logic. game_date alone can't tell "starts later
// today" apart from "already finished" — a match's actual end depends on
// slot_time + format duration. Extracted here because /api/matches/history
// needs the same "has this match actually ended" check that
// src/app/fixtures/page.tsx already uses to drop ended games from Upcoming;
// without it, a match played today falls into a gap — dropped from Upcoming
// the moment it ends, but not eligible for Past until game_date < today
// rolls over the next calendar day.

export function getMatchEndTime(gameDate: string, slotTime: string, format: string): Date {
  const end = new Date(`${gameDate}T${slotTime}:00+05:30`)
  // T10/T25 are informal quick games — shorter (T10) or in-between (T25)
  // durations than the T20/T30 grid these estimates were originally tuned for.
  const durationHours = format === 'T30' ? 5.5 : format === 'T25' ? 4.5 : format === 'T10' ? 2 : 3.5
  end.setTime(end.getTime() + durationHours * 60 * 60 * 1000)
  return end
}

export function hasMatchEnded(gameDate: string, slotTime: string, format: string): boolean {
  return new Date() >= getMatchEndTime(gameDate, slotTime, format)
}

// A match only belongs in "past" once it has actually ended — game_date
// alone can't distinguish "starts later today" from "already finished".
// Yesterday-or-earlier is unambiguous; today needs the real end time via
// hasMatchEnded() above. `today` is passed in (rather than derived here)
// so every caller shares one exact "now" snapshot within a single request.
export function isPastMatch(gameDate: string, slotTime: string, format: string, today: string): boolean {
  if (gameDate < today) return true
  if (gameDate > today) return false
  return hasMatchEnded(gameDate, slotTime, format)
}

// Formats a 24h "HH:MM" string as 12h — "07:30" -> "7:30", optionally with
// an AM/PM suffix. Drops a :00 minute the same way the reporting-time
// calc elsewhere in the app already does, for a consistent look.
export function formatTime12h(time: string, withPeriod = false): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  const minute = m > 0 ? `:${String(m).padStart(2, '0')}` : ''
  return withPeriod ? `${hour12}${minute} ${period}` : `${hour12}${minute}`
}

// The time to actually show a captain/GC reviewer: the real kickoff time,
// which an admin can set independently of the nominal 4-slot bucket.
// bookings.match_time is DB-guaranteed non-null (backfilled from slot_time
// and enforced by a trigger + NOT NULL constraint — see
// supabase/migrations/064_backfill_match_time_default.sql), so there is no
// slot_time fallback here anymore — see .claude/rules/architecture.md §8.1.
export function matchDisplayTime(matchTime: string, withPeriod = false): string {
  return formatTime12h(matchTime, withPeriod)
}
