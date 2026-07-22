'use client'

import { useEffect, useState } from 'react'

interface Tournament {
  id:   string
  name: string
}

interface Preview {
  match_id:        string
  opponent_name:   string | null
  ground:          string | null
  tournament_name: string | null
  match_type:      string | null
  game_date:       string | null
  match_result:    string | null
  player_stats:    Record<string, Record<string, any>> | null
  team_lists:      Record<string, string[]> | null
}

const SLOT_TIMES = ['07:30', '10:30', '12:30', '14:30'] as const
const FORMATS = ['T20', 'T30'] as const

// A player with an empty bowling entry is NOT on its own evidence of a bug —
// most of a roster genuinely never bowls in a given match, and that produces
// the identical {} signature as the real first-bowler-row extraction bug
// (see field_extractors.py's _extract_bowling_stats). To tell the two apart
// without needing the actual CricHeroes scorecard, cross-reference the
// OPPOSING team's batting dismissal text: `player_stats[team][player]
// .batting.status` holds the raw CricHeroes dismissal string (e.g. "c
// Fielder b Bowler", "b Bowler", "lbw b Bowler") — the same field
// dismissal_parser.py's DismissalParser parses server-side. If a flagged
// player's name appears as the bowler in any of those, they demonstrably
// took a wicket in the real match, so an empty bowling row for them can only
// mean the extraction dropped it — a genuine bug, not a non-bowler.
function extractBowlerFromDismissal(status: string): string | null {
  const s = (status ?? '').trim()
  if (!s || /not out/i.test(s)) return null
  if (/^lbw\s+b\s+/i.test(s)) return s.replace(/^lbw\s+b\s+/i, '').trim()
  if (/^b\s+/i.test(s)) return s.replace(/^b\s+/i, '').trim()
  let m = s.match(/c\s*&\s*b\s+(.+)/i)
  if (m) return m[1].trim()
  m = s.match(/c\s*†\s*.+?\s+b\s+(.+)/i)
  if (m) return m[1].trim()
  m = s.match(/st\s*†?\s*.+?\s+b\s+(.+)/i)
  if (m) return m[1].trim()
  m = s.match(/^c\s+.+?\s+b\s+(.+)/i)
  if (m) return m[1].trim()
  return null
}

const normName = (n: string) => n.trim().toLowerCase()

interface EmptyBowlingEntry {
  team:   string
  player: string
  // true if the opposing team's batting dismissals name this player as the
  // bowler despite their own bowling row coming back empty — strong
  // evidence of a real extraction bug rather than a player who just never
  // bowled that match.
  likelyBug: boolean
}

function findEmptyBowlingEntries(preview: Preview): EmptyBowlingEntry[] {
  if (!preview.player_stats || !preview.team_lists) return []
  const teams = Object.keys(preview.team_lists)

  // Bowler names mentioned in each team's own batting dismissals — i.e. the
  // bowlers who dismissed THAT team's batsmen, which are the opposing team's
  // bowlers.
  const dismissedByBowlerPerTeam = new Map<string, Set<string>>()
  for (const team of teams) {
    const names = new Set<string>()
    for (const stats of Object.values(preview.player_stats[team] ?? {})) {
      const bowler = extractBowlerFromDismissal((stats as any)?.batting?.status ?? '')
      if (bowler) names.add(normName(bowler))
    }
    dismissedByBowlerPerTeam.set(team, names)
  }

  const flagged: EmptyBowlingEntry[] = []
  for (const [team, roster] of Object.entries(preview.team_lists)) {
    const teamStats = preview.player_stats[team] ?? {}
    const otherTeam = teams.find(t => t !== team)
    const mentionedBowlers = otherTeam ? dismissedByBowlerPerTeam.get(otherTeam) ?? new Set() : new Set<string>()
    for (const player of roster) {
      const bowling = teamStats[player]?.bowling
      if (bowling && Object.keys(bowling).length === 0) {
        flagged.push({ team, player, likelyBug: mentionedBowlers.has(normName(player)) })
      }
    }
  }
  return flagged
}

export default function BookingBackfillPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [matchId, setMatchId] = useState('')
  const [tournamentId, setTournamentId] = useState('')
  const [format, setFormat] = useState<typeof FORMATS[number]>('T20')
  const [slotTime, setSlotTime] = useState<typeof SLOT_TIMES[number]>('07:30')

  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetch('/api/tournaments')
      .then(res => res.json())
      .then(data => setTournaments((data.tournaments ?? []).map((t: any) => ({ id: t.id, name: t.name }))))
      .catch(() => {})
  }, [])

  async function runPreview() {
    if (!matchId.trim()) return
    setPreviewing(true)
    setError('')
    setSuccess('')
    setPreview(null)
    try {
      const res = await fetch('/api/admin/booking-backfill', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dry_run: true, match_id: matchId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Preview failed'); return }
      setPreview(data.preview)
    } catch {
      setError('Network error')
    } finally {
      setPreviewing(false)
    }
  }

  async function confirmBackfill() {
    if (!preview || !tournamentId) return
    setConfirming(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/admin/booking-backfill', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          dry_run: false,
          match_id: preview.match_id,
          tournament_id: tournamentId,
          format,
          slot_time: slotTime,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Backfill failed'); return }
      if (!data.ok) {
        setError(data.backfill?.error ?? data.error ?? 'Booking created, but parse/sync failed — retry from Scorecard Backfill')
      } else {
        setSuccess(`Booking created and synced (booking_id ${data.booking_id})`)
      }
      setPreview(null)
      setMatchId('')
    } catch {
      setError('Network error')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">Booking Backfill</h1>
        <p className="font-rajdhani text-sm text-zinc-500 mt-1">
          For a match that was actually played but never got a Hub booking at all — not the same as
          &ldquo;Scorecard Backfill&rdquo;, which only re-syncs an already-existing booking. Enter the
          CricHeroes match_id to preview what would be created before anything is written.
        </p>
      </div>

      <div className="bg-ink-3 border border-ink-5 rounded p-4 space-y-3">
        <div>
          <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500">
            CricHeroes match_id
          </label>
          <div className="flex gap-2 mt-1">
            <input
              value={matchId}
              onChange={e => setMatchId(e.target.value)}
              placeholder="e.g. 22422538"
              className="flex-1 bg-ink-4 border border-ink-5 rounded px-3 py-2 font-rajdhani text-sm text-zinc-200"
            />
            <button
              onClick={runPreview}
              disabled={previewing || !matchId.trim()}
              className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 disabled:opacity-40 px-4 py-2 rounded transition-colors">
              {previewing ? 'Fetching…' : 'Preview'}
            </button>
          </div>
        </div>

        {error && <p className="font-rajdhani text-sm text-red-400">{error}</p>}
        {success && <p className="font-rajdhani text-sm text-emerald-400">{success}</p>}

        {preview && (
          <div className="bg-ink-4 border border-ink-5 rounded p-3 space-y-2">
            <p className="font-rajdhani text-sm text-zinc-300">
              <span className="text-zinc-500">Date:</span> {preview.game_date ?? '⚠ could not parse'} ·{' '}
              <span className="text-zinc-500">vs</span> {preview.opponent_name ?? 'unknown'}
            </p>
            <p className="font-rajdhani text-sm text-zinc-400">
              {preview.ground && <>Ground: {preview.ground} · </>}
              {preview.match_type && <>Type: {preview.match_type} · </>}
              Result: {preview.match_result ?? 'unknown'}
            </p>
            {preview.tournament_name && (
              <p className="font-rajdhani text-xs text-zinc-600">CricHeroes tournament tag: {preview.tournament_name}</p>
            )}

            {(() => {
              const flagged = findEmptyBowlingEntries(preview)
              const likelyBugs = flagged.filter(f => f.likelyBug)
              const probablyFine = flagged.filter(f => !f.likelyBug)
              return (
                <>
                  {likelyBugs.length > 0 && (
                    <p className="font-rajdhani text-xs text-red-400">
                      ⚠ Credited with a wicket in the opponent&apos;s dismissals but their own bowling row is empty —
                      near-certain extraction bug: {likelyBugs.map(f => f.player).join(', ')}
                    </p>
                  )}
                  {probablyFine.length > 0 && (
                    <p className="font-rajdhani text-xs text-zinc-600">
                      On the roster with no bowling figures and not credited with any wicket — most likely just
                      didn&apos;t bowl this match, not flagged as a bug: {probablyFine.map(f => f.player).join(', ')}
                    </p>
                  )}
                </>
              )
            })()}

            {(preview.player_stats || preview.team_lists) && (
              <details className="font-rajdhani text-xs text-zinc-500">
                <summary className="cursor-pointer hover:text-zinc-300">Raw player_stats / team_lists (debug)</summary>
                <pre className="mt-1 max-h-64 overflow-auto bg-ink-3 border border-ink-5 rounded p-2 text-[11px] leading-snug whitespace-pre-wrap">
                  {JSON.stringify({ team_lists: preview.team_lists, player_stats: preview.player_stats }, null, 2)}
                </pre>
              </details>
            )}

            {!preview.game_date ? (
              <p className="font-rajdhani text-xs text-amber-400">
                No parseable date — this match can&apos;t be backfilled from here.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-zinc-500">
                    Tournament
                  </label>
                  <select
                    value={tournamentId}
                    onChange={e => setTournamentId(e.target.value)}
                    className="w-full bg-ink-3 border border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-zinc-200 mt-1">
                    <option value="">Select…</option>
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-zinc-500">
                    Format
                  </label>
                  <select
                    value={format}
                    onChange={e => setFormat(e.target.value as typeof FORMATS[number])}
                    className="w-full bg-ink-3 border border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-zinc-200 mt-1">
                    {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-zinc-500">
                    Slot label <span className="text-zinc-700">(display only — not a real reservation)</span>
                  </label>
                  <select
                    value={slotTime}
                    onChange={e => setSlotTime(e.target.value as typeof SLOT_TIMES[number])}
                    className="w-full bg-ink-3 border border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-zinc-200 mt-1">
                    {SLOT_TIMES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            <button
              onClick={confirmBackfill}
              disabled={confirming || !tournamentId || !preview.game_date}
              className="w-full mt-2 font-rajdhani text-sm font-bold tracking-widest uppercase bg-emerald-950/40 border border-emerald-800 text-emerald-400 hover:bg-emerald-950/60 disabled:opacity-40 px-4 py-2 rounded transition-colors">
              {confirming ? 'Creating…' : 'Create Booking & Sync'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
