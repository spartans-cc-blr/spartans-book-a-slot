// Birthday-wishes detection — any player whose players.dob crosses today's
// IST calendar month/day. Deliberately no achievement/log table (contrast
// with src/lib/milestones.ts): a birthday recurs every year on the same
// date, so "today's birthdays" is just re-derived fresh on every request
// rather than detected-and-logged once. Per-viewer "already seen today"
// state lives on players.birthday_wishes_seen_date instead (a date, not a
// permanent cursor) — see supabase/migrations/065_birthday_wishes_seen_date.sql.
//
// Month/day comparison is done in application code, not a Postgres
// extract() filter — simplest and safe at this club's roster size, and
// consistent with how the rest of this app avoids hand-rolled raw-SQL
// date filters through supabase-js.

import { createServiceClient } from '@/lib/supabase'

export interface BirthdayPlayer {
  id: string
  name: string
  photo_url: string | null
}

// Same +5.5h IST-shift trick used by the lock-availability cron
// (src/app/api/cron/lock-availability/route.ts's nowIST) — the shifted
// Date's UTC getters then read as IST wall-clock values, with no
// timezone library needed for a plain month/day/date-string comparison.
export function todayIST(): Date {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
}

export function istDateString(d: Date = todayIST()): string {
  return d.toISOString().split('T')[0]
}

export async function getTodaysBirthdays(): Promise<BirthdayPlayer[]> {
  const supabase = createServiceClient()
  const today = todayIST()
  const month = today.getUTCMonth() + 1
  const day = today.getUTCDate()

  // Expelled players are excluded — everyone else (active/inactive) is
  // still a club member worth wishing. dob is nullable (not every player
  // has set one), so only rows with a dob are worth fetching at all.
  const { data, error } = await supabase
    .from('players')
    .select('id, name, photo_url, dob')
    .neq('status', 'expelled')
    .not('dob', 'is', null)

  if (error || !data) return []

  return data
    .filter(p => {
      // p.dob comes back as a plain 'YYYY-MM-DD' string from a Postgres
      // date column — parsed as UTC midnight so the month/day read here
      // never shifts with the server's local timezone.
      const dob = new Date(`${p.dob}T00:00:00Z`)
      return dob.getUTCMonth() + 1 === month && dob.getUTCDate() === day
    })
    .map(p => ({ id: p.id, name: p.name, photo_url: p.photo_url }))
}
