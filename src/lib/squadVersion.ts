import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase'

export interface SquadVersionRow {
  player_id:  string
  status:     string
  is_captain: boolean
  is_vc:      boolean
  is_wk:      boolean
  match_role: string | null
}

/**
 * Deterministic fingerprint of a booking's current squad rows — no stored
 * version column needed. Any insert/update/delete on the row set (player
 * added/removed, status flip, role change) changes this string; two reads
 * of the same underlying state always produce the same one.
 */
export function computeSquadVersion(rows: SquadVersionRow[]): string {
  const sorted = [...rows].sort((a, b) => a.player_id.localeCompare(b.player_id))
  const payload = sorted
    .map(r => [r.player_id, r.status, r.is_captain, r.is_vc, r.is_wk, r.match_role ?? ''].join('|'))
    .join('\n')
  return createHash('sha256').update(payload).digest('hex')
}

export const EMPTY_SQUAD_VERSION = computeSquadVersion([])

export async function fetchSquadVersion(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string
): Promise<{ version: string; rows: SquadVersionRow[] }> {
  const { data, error } = await supabase
    .from('squad')
    .select('player_id, status, is_captain, is_vc, is_wk, match_role')
    .eq('booking_id', bookingId)
  if (error) throw error
  const rows = (data ?? []) as SquadVersionRow[]
  return { version: computeSquadVersion(rows), rows }
}
