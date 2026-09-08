import type { DateChipGroup } from '@/components/ui/DateChipSlider'

function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay() // 0 = Sun, 6 = Sat
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  // Read the result back via local Y/M/D components, not toISOString()
  // (which formats in UTC) — for any positive-offset timezone (IST,
  // UTC+5:30, is what this club's users are in), a UTC round-trip lands
  // back on the *same* calendar date as the input, since local midnight
  // + 1 day is still within the previous UTC day. That silently made
  // nextDay(saturday) === saturday, so every Saturday matched its own
  // "Sunday" check and paired with itself (a real reported bug — a chip
  // rendered "SAT–SAT · 5–5 · SEP" instead of combining with the actual
  // Sunday, or just standing alone as one date).
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Groups a list of ISO `game_date` strings into date-chip groups: a
// Saturday whose very next calendar day (Sunday) is also present in the
// list combines into one weekend chip; every other date (an orphan Sat/Sun
// with no same-weekend counterpart, or a plain weekday) gets its own
// single-date chip. Mirrors the same Sat+Sun pairing `/fixtures`'
// `validationGroupKey()` already applies at the booking level, but works
// from a plain date list so a caller with no per-booking grouping of its
// own (e.g. Match History, where every match is an independent card) can
// reuse the same "combined weekend chip" UX without re-deriving booking
// groups it doesn't have. See `features/player-availability.md` §10.1.
export function groupDatesIntoChips(dates: string[]): DateChipGroup[] {
  const sorted = Array.from(new Set(dates)).sort()
  const dateSet = new Set(sorted)
  const consumed = new Set<string>()
  const groups: DateChipGroup[] = []

  for (const date of sorted) {
    if (consumed.has(date)) continue

    if (dayOfWeek(date) === 6) {
      const sunday = nextDay(date)
      if (dateSet.has(sunday)) {
        consumed.add(date)
        consumed.add(sunday)
        groups.push({ key: date, dates: [date, sunday] })
        continue
      }
    }

    consumed.add(date)
    groups.push({ key: date, dates: [date] })
  }

  return groups
}
