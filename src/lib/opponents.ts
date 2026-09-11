// Opponent master helpers — see features/team-stats.md §5.
//
// bookings.opponent_name is free text typed by an admin (or copied from a
// CricHeroes scorecard). `opponents` is the canonical identity;
// `opponent_aliases` maps every raw spelling ever confirmed to one. This
// module is the single place that turns a raw spelling into an
// opponents.id, used by POST /api/bookings, PATCH /api/bookings/[id] (so a
// booking typed with an already-known spelling resolves on save) and by
// POST /api/opponents/link (the manual reconciliation path).
//
// Server-only — reads the Hub DB via the service-role client.

import type { SupabaseClient } from '@supabase/supabase-js'

// Same normalisation the DB's unique indexes use (lower(btrim(...))), so a
// JS-side lookup and the DB constraint can never disagree on what "the
// same spelling" means.
export function normaliseOpponentName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

// Resolves a raw opponent spelling to an opponents.id, or null if no
// opponent or alias matches. Exact (normalised) match only — never fuzzy.
// Fuzzy suggestions exist purely to populate the /opponents picker UI, and
// always require a human to confirm (same posture as player-identity
// resolution's suggestPlayers()).
export async function resolveOpponentIdByName(
  supabase: SupabaseClient,
  rawName: string | null | undefined
): Promise<string | null> {
  if (!rawName || !rawName.trim()) return null
  const key = normaliseOpponentName(rawName)

  const { data: alias } = await supabase
    .from('opponent_aliases')
    .select('opponent_id')
    .ilike('alias', key)
    .limit(1)
    .maybeSingle()
  if (alias?.opponent_id) return alias.opponent_id

  const { data: opp } = await supabase
    .from('opponents')
    .select('id')
    .ilike('name', key)
    .limit(1)
    .maybeSingle()
  return opp?.id ?? null
}

export class AliasConflictError extends Error {}

// Links a raw spelling to a canonical opponent: writes opponent_aliases
// (future bookings resolve on save) and back-fills bookings.opponent_id on
// every confirmed booking currently carrying that spelling with no opponent
// yet. Idempotent; a spelling already aliased to a *different* opponent
// throws AliasConflictError (fix the master list first, never silently
// re-point history). Used by POST/PATCH /api/opponents and
// POST /api/opponents/link. Returns the number of bookings back-filled.
export async function linkSpellingToOpponent(
  supabase: SupabaseClient,
  opponentId: string,
  rawSpelling: string,
  createdBy: string | null
): Promise<number> {
  const key = normaliseOpponentName(rawSpelling)
  if (!key) return 0

  const { data: existing } = await supabase
    .from('opponent_aliases')
    .select('opponent_id')
    .ilike('alias', key)
    .limit(1)
    .maybeSingle()
  if (existing && existing.opponent_id !== opponentId) {
    throw new AliasConflictError('That spelling is already linked to a different opponent')
  }
  if (!existing) {
    const { error } = await supabase
      .from('opponent_aliases')
      .insert({ opponent_id: opponentId, alias: key, created_by: createdBy })
    // 23505 = raced with a concurrent identical insert — harmless
    if (error && error.code !== '23505') throw new Error(error.message)
  }

  // Back-fill bookings. Filter in JS on the normalised spelling — the DB
  // unique index uses lower(btrim()) but PostgREST can't express that, and
  // the confirmed-bookings table is small.
  const { data: candidates, error: cErr } = await supabase
    .from('bookings')
    .select('id, opponent_name')
    .eq('status', 'confirmed')
    .is('opponent_id', null)
    .not('opponent_name', 'is', null)
    .range(0, 4999)
  if (cErr) throw new Error(cErr.message)
  const ids = (candidates ?? []).filter(b => normaliseOpponentName(b.opponent_name) === key).map(b => b.id)
  if (ids.length === 0) return 0
  const { error: uErr } = await supabase.from('bookings').update({ opponent_id: opponentId }).in('id', ids)
  if (uErr) throw new Error(uErr.message)
  return ids.length
}

