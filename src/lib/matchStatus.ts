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
  const durationHours = format === 'T30' ? 5.5 : 3.5
  end.setTime(end.getTime() + durationHours * 60 * 60 * 1000)
  return end
}

export function hasMatchEnded(gameDate: string, slotTime: string, format: string): boolean {
  return new Date() >= getMatchEndTime(gameDate, slotTime, format)
}
