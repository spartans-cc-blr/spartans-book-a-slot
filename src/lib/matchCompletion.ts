// "Is this match over?" — one rule shared by every surface that splits
// matches into upcoming vs past: /fixtures, /matches/history, the admin
// Matches tab (Upcoming / Needs action / Past) and Captains' Corner match
// planning. A match is completed once its estimated end time has passed
// (isPastMatch, src/lib/matchStatus.ts) OR its scorecard has already
// synced, which proves it's over even if it finished early.
// See .claude/rules/features/admin-matches-view.md §2.1.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPastMatch } from '@/lib/matchStatus'

const SYNCED_STATUSES = ['synced', 'fees_applied']

// Today's date in IST (YYYY-MM-DD). game_date is an IST calendar date, so
// a UTC date would be a day behind between 00:00 and 05:30 IST.
export function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function isCompletedMatch(
  b: { id: string; game_date: string; slot_time: string; format?: string | null },
  today: string,
  syncedIds: Set<string>,
): boolean {
  if (syncedIds.has(b.id)) return true
  return isPastMatch(b.game_date, b.slot_time, b.format ?? '', today)
}

// Booking ids (from `ids`) whose scorecard has synced. Only bookings dated
// today can change answer because of this, so callers pass just those.
export async function getSyncedBookingIds(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await supabase
    .from('scorecard_uploads')
    .select('booking_id')
    .in('booking_id', ids)
    .in('status', SYNCED_STATUSES)
  return new Set((data ?? []).map((r: any) => r.booking_id))
}
