import type { DateChipGroup } from '@/components/ui/DateChipSlider'

function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay() // 0 = Sun, 6 = Sat
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
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
