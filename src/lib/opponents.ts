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


// ── Auto-created opponents & merge (opponent-identity.md) ─────────────────

// Display name for an opponent created from a raw spelling: trimmed, whitespace collapsed,
// original casing kept.
export function displayOpponentName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

// Resolves a spelling to an opponent, creating one flagged auto_created when nothing matches,
// so a booking never stays without an opponent_id. Reuses linkSpellingToOpponent() so the alias
// is written and any other unlinked booking with the same spelling is back-filled. Never throws
// and never blocks the caller: on any failure it returns null (the booking just stays unlinked
// and shows in the /opponents queue as before).
export async function resolveOrCreateOpponentIdByName(
  supabase: SupabaseClient,
  rawName: string | null | undefined,
  createdBy: string | null = null
): Promise<string | null> {
  try {
    const existing = await resolveOpponentIdByName(supabase, rawName)
    if (existing) return existing
    if (!rawName || !rawName.trim()) return null

    const { data, error } = await supabase
      .from('opponents')
      .insert({ name: displayOpponentName(rawName), auto_created: true, created_by: createdBy })
      .select('id')
      .single()
    if (error) {
      // 23505: a concurrent request (or a differently-cased twin) created it first.
      if (error.code === '23505') return await resolveOpponentIdByName(supabase, rawName)
      console.error('[opponents] auto-create failed:', error.message)
      return null
    }
    try {
      await linkSpellingToOpponent(supabase, data.id, rawName, createdBy)
    } catch (e) {
      console.error('[opponents] auto-create alias failed:', e)
    }
    return data.id
  } catch (e) {
    console.error('[opponents] resolveOrCreate failed:', e)
    return null
  }
}

export interface OpponentFields {
  is_marquee: boolean
  cricheroes_team_url: string | null
  notes: string | null
  auto_created: boolean
}

// Fields the surviving opponent ends up with after a merge: nothing a manager set is lost.
// Marquee if either was; the target's URL wins, else the source's; notes are joined; the result
// counts as reviewed (not auto_created) if either side was reviewed.
export function mergeOpponentFields(target: OpponentFields, source: OpponentFields): OpponentFields {
  const notes = [target.notes, source.notes]
    .map(n => n?.trim())
    .filter((n, i, a): n is string => !!n && a.indexOf(n) === i)
  return {
    is_marquee: target.is_marquee || source.is_marquee,
    cricheroes_team_url: target.cricheroes_team_url ?? source.cricheroes_team_url,
    notes: notes.length ? notes.join(' · ') : null,
    auto_created: target.auto_created && source.auto_created,
  }
}

export class OpponentMergeError extends Error {}

// Folds `sourceId` into `targetId`: every alias and booking moves to the target, the source's own
// name stays resolvable as an alias, the target keeps the union of manager-set fields, and the
// source row is deleted. Steps are ordered so a failure part-way leaves nothing orphaned and a
// retry finishes the job. Returns counts for the UI.
export async function mergeOpponents(
  supabase: SupabaseClient,
  sourceId: string,
  targetId: string,
  actedBy: string | null = null
): Promise<{ aliases_moved: number; bookings_moved: number }> {
  if (sourceId === targetId) throw new OpponentMergeError('Pick a different opponent to merge into')

  const cols = 'id, name, is_marquee, cricheroes_team_url, notes, auto_created'
  const [{ data: source }, { data: target }] = await Promise.all([
    supabase.from('opponents').select(cols).eq('id', sourceId).maybeSingle(),
    supabase.from('opponents').select(cols).eq('id', targetId).maybeSingle(),
  ])
  if (!source) throw new OpponentMergeError('Opponent to merge was not found')
  if (!target) throw new OpponentMergeError('Merge target was not found')

  const { data: movedAliases, error: aErr } = await supabase
    .from('opponent_aliases').update({ opponent_id: targetId }).eq('opponent_id', sourceId).select('id')
  if (aErr) throw new Error(aErr.message)

  const { data: movedBookings, error: bErr } = await supabase
    .from('bookings').update({ opponent_id: targetId }).eq('opponent_id', sourceId).select('id')
  if (bErr) throw new Error(bErr.message)

  // The source's own name must keep resolving (to the target now).
  await linkSpellingToOpponent(supabase, targetId, source.name, actedBy)

  const merged = mergeOpponentFields(target as OpponentFields, source as OpponentFields)
  const { error: uErr } = await supabase
    .from('opponents').update({ ...merged, updated_at: new Date().toISOString() }).eq('id', targetId)
  if (uErr) throw new Error(uErr.message)

  const { error: dErr } = await supabase.from('opponents').delete().eq('id', sourceId)
  if (dErr) throw new Error(dErr.message)

  return { aliases_moved: movedAliases?.length ?? 0, bookings_moved: movedBookings?.length ?? 0 }
}
