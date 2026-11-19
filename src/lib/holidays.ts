// Karnataka general (public) holidays that fall on a weekday (Mon–Fri).
// Saturdays and Sundays are already their own day types wherever this is
// used, so weekend holidays are left out. Client-safe, no imports.
//
// Source: the Karnataka government 2026 general holiday list as reported by
// several news/HR sites (Nov 2026); the official DPAR PDF could not be read
// from the build environment. Only dates the sources agree on are listed.
// The five dates the club actually played on (15 Jan, 26 Jan, 19 Mar, 28 May,
// 14 Sep) are confirmed by the tournament names on those bookings.
//
// Not listed because sources disagreed on the exact date: Mahaveer Jayanti,
// Basava Jayanti, Muharram, Id-Milad, Mahanavami/Ayudha Pooja, Vijayadashami,
// Naraka Chaturdashi, Balipadyami, Kanakadasa Jayanti. Add them once
// confirmed. Add each new year's list here. See
// .claude/rules/features/availability-patterns.md §2.
export const KARNATAKA_WEEKDAY_HOLIDAYS: Record<string, string> = {
  '2026-01-15': 'Makara Sankranti',
  '2026-01-26': 'Republic Day',
  '2026-03-19': 'Ugadi',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. B.R. Ambedkar Jayanti',
  '2026-05-01': 'May Day',
  '2026-05-28': 'Bakrid',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-10-02': 'Gandhi Jayanti',
  '2026-12-25': 'Christmas',
}

export function isWeekdayHoliday(gameDate: string): boolean {
  return gameDate in KARNATAKA_WEEKDAY_HOLIDAYS
}

// A one-day tournament: two or more games of the same format in the same
// tournament on one weekday date. Clubs only stage these on holidays, so the
// date is treated as a holiday even if it is missing from the list above
// (a regional festival, or a date the published lists disagree on). Ordinary
// weekday leagues play one game per date. Pass weekday bookings only, or
// filter the result by weekday afterwards.
export function oneDayTournamentDates(
  bookings: { gameDate: string; tournamentId: string | null; format: string | null }[],
): Set<string> {
  const counts = new Map<string, number>()
  for (const b of bookings) {
    if (!b.tournamentId || !b.format) continue
    const key = `${b.gameDate}|${b.tournamentId}|${b.format}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const dates = new Set<string>()
  counts.forEach((n, key) => { if (n >= 2) dates.add(key.split('|')[0]) })
  return dates
}
