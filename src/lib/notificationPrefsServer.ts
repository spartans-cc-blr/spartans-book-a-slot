// Server-side readers for notification_preferences. Service role only.
// Reads fail OPEN: if the table can't be read, the player is treated as
// opted in, so a preferences outage can never silence squad or wallet alerts.

import { createServiceClient } from '@/lib/supabase'
import { LOCKED_GROUPS, PREF_DEFS, isValidPrefKey, type MutedSet } from '@/lib/notificationPrefs'

type Supabase = ReturnType<typeof createServiceClient>

const LOCKED_KEYS = new Set(PREF_DEFS.filter(d => LOCKED_GROUPS.has(d.group)).map(d => d.key))

export async function getMutedKeys(supabase: Supabase, playerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('key')
    .eq('player_id', playerId)
    .eq('enabled', false)
  if (error) { console.error('[notification-prefs] read failed:', error.message); return new Set() }
  return new Set((data ?? []).map(r => r.key as string).filter(k => !LOCKED_KEYS.has(k)))
}

// One query for many players. Chunked so a large roster can't hit URL limits.
export async function getMutedKeysForPlayers(
  supabase: Supabase,
  playerIds: string[]
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  for (let i = 0; i < playerIds.length; i += 200) {
    const chunk = playerIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('player_id, key')
      .in('player_id', chunk)
      .eq('enabled', false)
    if (error) { console.error('[notification-prefs] batch read failed:', error.message); continue }
    for (const r of data ?? []) {
      const set = out.get(r.player_id) ?? new Set<string>()
      set.add(r.key as string)
      out.set(r.player_id, set)
    }
  }
  return out
}

export async function setPreferences(
  supabase: Supabase,
  playerId: string,
  changes: { key: string; enabled: boolean }[]
) {
  const rows = changes
    .filter(c => isValidPrefKey(c.key) && !LOCKED_KEYS.has(c.key))
    .map(c => ({ player_id: playerId, key: c.key, enabled: c.enabled, updated_at: new Date().toISOString() }))
  if (!rows.length) return { error: null as null | { message: string } }
  const { error } = await supabase.from('notification_preferences').upsert(rows, { onConflict: 'player_id,key' })
  return { error }
}

export type { MutedSet }
