'use client'

import { useEffect, useState } from 'react'
import { extractMatchIdFromUrl, opponentFromMatchSlug } from '@/lib/cricheroesMatchUrl'
import BookingCaptainSelect, { type CaptainChoice } from '@/components/admin/BookingCaptainSelect'
import { captainRequestFields } from '@/lib/bookingCaptainShared'

interface Tournament {
  id:   string
  name: string
  ground_id:  string | null
  captain_id: string | null
}

interface GroundOption { id: string; name: string }

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

  // Manual fallback — for when CricHeroes can't be reached at all (rate
  // limited, timed out, briefly down) and a preview never comes back. Creates
  // the booking straight from these admin-supplied fields with zero CricHeroes
  // calls, then leaves it for the self-healing backfill-scorecards cron (or a
  // manual /admin/scorecard-backfill run) to actually sync once CricHeroes is
  // reachable again. See features/post-match-scorecard.md §18.
  const [manualMode, setManualMode] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [manualMatchId, setManualMatchId] = useState('')
  const [manualOpponent, setManualOpponent] = useState('')
  const [manualGameDate, setManualGameDate] = useState('')

  // Booking details that used to be missing from every backfilled booking
  // (the admin had to reopen it in the matches panel to add them). Ground and
  // captain default from the tournament; the CricHeroes URL is typed/pasted.
  const [grounds, setGrounds] = useState<GroundOption[]>([])
  const [captains, setCaptains] = useState<CaptainChoice[]>([])
  const [groundId, setGroundId] = useState('')
  const [captainId, setCaptainId] = useState('')
  const [chUrl, setChUrl] = useState('')

  useEffect(() => {
    fetch('/api/tournaments')
      .then(res => res.json())
      .then(data => setTournaments((data.tournaments ?? []).map((t: any) => ({
        id: t.id, name: t.name, ground_id: t.ground_id ?? null, captain_id: t.captain_id ?? null,
      }))))
      .catch(() => {})
    fetch('/api/grounds').then(r => r.json()).then(d => setGrounds(d.grounds ?? [])).catch(() => {})
    fetch('/api/captains?all=true').then(r => r.json()).then(d => setCaptains(d.captains ?? [])).catch(() => {})
  }, [])

  function pickTournament(id: string) {
    setTournamentId(id)
    const t = tournaments.find(x => x.id === id)
    setGroundId(t?.ground_id ?? '')
    setCaptainId(t?.captain_id ?? '')
  }

  function extraFields(url: string) {
    return {
      ...(groundId ? { ground_id: groundId } : {}),
      ...captainRequestFields(captainId),
      ...(url.trim() ? { cricheroes_url: url.trim() } : {}),
    }
  }

  function resetExtras() { setGroundId(''); setCaptainId(''); setChUrl('') }

  // Pure string parsing of the pasted URL — no network call, so this works
  // exactly when CricHeroes itself is unreachable, unlike the Preview button.
  useEffect(() => {
    if (!manualUrl.trim()) return
    const id = extractMatchIdFromUrl(manualUrl.trim())
    if (id) setManualMatchId(id)
    try {
      const parts = new URL(manualUrl.trim()).pathname.split('/').filter(Boolean)
      const slug = parts[parts.length - 1]
      const guess = slug ? opponentFromMatchSlug(slug) : null
      if (guess) setManualOpponent(prev => prev || guess)
    } catch {
      // Not a valid URL yet — ignore until it is
    }
  }, [manualUrl])

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
          ...extraFields(chUrl),
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
      resetExtras()
    } catch {
      setError('Network error')
    } finally {
      setConfirming(false)
    }
  }

  function startManualMode() {
    setManualMode(true)
    setManualMatchId(prev => prev || matchId.trim())
    setError('')
  }

  function cancelManualMode() {
    setManualMode(false)
    setManualUrl('')
    setManualMatchId('')
    setManualOpponent('')
    setManualGameDate('')
  }

  async function confirmManualBackfill() {
    if (!manualMatchId.trim() || !tournamentId || !manualGameDate) return
    setConfirming(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/admin/booking-backfill', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          dry_run:       false,
          manual:        true,
          match_id:      manualMatchId.trim(),
          tournament_id: tournamentId,
          format,
          slot_time:     slotTime,
          game_date:     manualGameDate,
          opponent_name: manualOpponent.trim() || undefined,
          ...extraFields(manualUrl),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Backfill failed'); return }
      setSuccess(
        `Booking created (booking_id ${data.booking_id}) — no CricHeroes fetch was made. It'll sync ` +
        'automatically on the next scheduled run, or you can run it now from Scorecard Backfill.'
      )
      cancelManualMode()
      setMatchId('')
      resetExtras()
    } catch {
      setError('Network error')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-amber-700 dark:text-gold">Booking Backfill</h1>
        <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500 mt-1">
          For a match that was actually played but never got a Hub booking at all — not the same as
          &ldquo;Scorecard Backfill&rdquo;, which only re-syncs an already-existing booking. Enter the
          CricHeroes match_id to preview what would be created before anything is written. If CricHeroes
          itself can&apos;t be reached (rate limited, down), you can create the booking manually instead
          and let the scheduled sync pick it up later.
        </p>
      </div>

      <div className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-4 space-y-3">
        <div>
          <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
            CricHeroes match_id
          </label>
          <div className="flex gap-2 mt-1">
            <input
              value={matchId}
              onChange={e => setMatchId(e.target.value)}
              placeholder="e.g. 22422538"
              className="flex-1 bg-parchment-2 dark:bg-ink-4 border border-[#D4C9B0] dark:border-ink-5 rounded px-3 py-2 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200"
            />
            <button
              onClick={runPreview}
              disabled={previewing || !matchId.trim()}
              className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-gold/10 border border-gold-dim text-amber-700 dark:text-gold hover:bg-gold/20 disabled:opacity-40 px-4 py-2 rounded transition-colors">
              {previewing ? 'Fetching…' : 'Preview'}
            </button>
          </div>
        </div>

        {error && <p className="font-rajdhani text-sm text-red-700 dark:text-red-400">{error}</p>}
        {success && <p className="font-rajdhani text-sm text-emerald-700 dark:text-emerald-400">{success}</p>}

        {error && !preview && !manualMode && (
          <button
            onClick={startManualMode}
            className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50 px-4 py-2 rounded transition-colors">
            Create booking manually instead (no CricHeroes fetch)
          </button>
        )}

        {manualMode && (
          <div className="bg-parchment-2 dark:bg-ink-4 border border-[#D4C9B0] dark:border-ink-5 rounded p-3 space-y-2">
            <p className="font-rajdhani text-xs text-amber-700 dark:text-amber-400">
              Creates the booking straight away with no CricHeroes request at all. It&apos;ll sync
              automatically on the next scheduled backfill run (13:00/19:00 IST), or you can trigger it
              sooner yourself from Scorecard Backfill.
            </p>
            <div>
              <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                CricHeroes match URL <span className="text-[#78716C] dark:text-zinc-700">(optional — saved on the booking, prefills Opponent)</span>
              </label>
              <input
                value={manualUrl}
                onChange={e => setManualUrl(e.target.value)}
                placeholder="https://cricheroes.in/scorecard/22422538/..."
                className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1"
              />
            </div>
            <div>
              <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                Match ID
              </label>
              <input
                value={manualMatchId}
                onChange={e => setManualMatchId(e.target.value)}
                className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  Match date
                </label>
                <input
                  type="date"
                  value={manualGameDate}
                  onChange={e => setManualGameDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1"
                />
              </div>
              <div>
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  Opponent <span className="text-[#78716C] dark:text-zinc-700">(optional)</span>
                </label>
                <input
                  value={manualOpponent}
                  onChange={e => setManualOpponent(e.target.value)}
                  className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1"
                />
              </div>
              <div>
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  Tournament
                </label>
                <select
                  value={tournamentId}
                  onChange={e => pickTournament(e.target.value)}
                  className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1">
                  <option value="">Select…</option>
                  {tournaments.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  Format
                </label>
                <select
                  value={format}
                  onChange={e => setFormat(e.target.value as typeof FORMATS[number])}
                  className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1">
                  {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  Slot label <span className="text-[#78716C] dark:text-zinc-700">(display only — not a real reservation)</span>
                </label>
                <select
                  value={slotTime}
                  onChange={e => setSlotTime(e.target.value as typeof SLOT_TIMES[number])}
                  className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1">
                  {SLOT_TIMES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  Ground
                </label>
                <select
                  value={groundId}
                  onChange={e => setGroundId(e.target.value)}
                  className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1">
                  <option value="">No ground</option>
                  {grounds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  Captain
                </label>
                <div className="mt-1">
                  <BookingCaptainSelect captains={captains} value={captainId} onChange={setCaptainId} gameDate={manualGameDate} />
                </div>
              </div>
              </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={confirmManualBackfill}
                disabled={confirming || !manualMatchId.trim() || !tournamentId || !manualGameDate}
                className="flex-1 font-rajdhani text-sm font-bold tracking-widest uppercase bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 disabled:opacity-40 px-4 py-2 rounded transition-colors">
                {confirming ? 'Creating…' : 'Create Booking (queue for sync)'}
              </button>
              <button
                onClick={cancelManualMode}
                className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 text-[#57534E] dark:text-zinc-400 hover:text-[#1C1917] dark:hover:text-zinc-200 px-4 py-2 rounded transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {preview && (
          <div className="bg-parchment-2 dark:bg-ink-4 border border-[#D4C9B0] dark:border-ink-5 rounded p-3 space-y-2">
            <p className="font-rajdhani text-sm text-[#44403C] dark:text-zinc-300">
              <span className="text-[#78716C] dark:text-zinc-500">Date:</span> {preview.game_date ?? '⚠ could not parse'} ·{' '}
              <span className="text-[#78716C] dark:text-zinc-500">vs</span> {preview.opponent_name ?? 'unknown'}
            </p>
            <p className="font-rajdhani text-sm text-[#57534E] dark:text-zinc-400">
              {preview.ground && <>Ground: {preview.ground} · </>}
              {preview.match_type && <>Type: {preview.match_type} · </>}
              Result: {preview.match_result ?? 'unknown'}
            </p>
            {preview.tournament_name && (
              <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-600">CricHeroes tournament tag: {preview.tournament_name}</p>
            )}

            {(() => {
              const flagged = findEmptyBowlingEntries(preview)
              const likelyBugs = flagged.filter(f => f.likelyBug)
              const probablyFine = flagged.filter(f => !f.likelyBug)
              return (
                <>
                  {likelyBugs.length > 0 && (
                    <p className="font-rajdhani text-xs text-red-700 dark:text-red-400">
                      ⚠ Credited with a wicket in the opponent&apos;s dismissals but their own bowling row is empty —
                      near-certain extraction bug: {likelyBugs.map(f => f.player).join(', ')}
                    </p>
                  )}
                  {probablyFine.length > 0 && (
                    <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-600">
                      On the roster with no bowling figures and not credited with any wicket — most likely just
                      didn&apos;t bowl this match, not flagged as a bug: {probablyFine.map(f => f.player).join(', ')}
                    </p>
                  )}
                </>
              )
            })()}

            {(preview.player_stats || preview.team_lists) && (
              <details className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">
                <summary className="cursor-pointer hover:text-[#44403C] dark:hover:text-zinc-300">Raw player_stats / team_lists (debug)</summary>
                <pre className="mt-1 max-h-64 overflow-auto bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-2 text-[11px] leading-snug whitespace-pre-wrap">
                  {JSON.stringify({ team_lists: preview.team_lists, player_stats: preview.player_stats }, null, 2)}
                </pre>
              </details>
            )}

            {!preview.game_date ? (
              <p className="font-rajdhani text-xs text-amber-700 dark:text-amber-400">
                No parseable date — this match can&apos;t be backfilled from here.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                    Tournament
                  </label>
                  <select
                    value={tournamentId}
                    onChange={e => pickTournament(e.target.value)}
                    className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1">
                    <option value="">Select…</option>
                    {tournaments.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                    Format
                  </label>
                  <select
                    value={format}
                    onChange={e => setFormat(e.target.value as typeof FORMATS[number])}
                    className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1">
                    {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                    Slot label <span className="text-[#78716C] dark:text-zinc-700">(display only — not a real reservation)</span>
                  </label>
                  <select
                    value={slotTime}
                    onChange={e => setSlotTime(e.target.value as typeof SLOT_TIMES[number])}
                    className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1">
                    {SLOT_TIMES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  Ground
                </label>
                <select
                  value={groundId}
                  onChange={e => setGroundId(e.target.value)}
                  className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1">
                  <option value="">No ground</option>
                  {grounds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  Captain
                </label>
                <div className="mt-1">
                  <BookingCaptainSelect captains={captains} value={captainId} onChange={setCaptainId} gameDate={preview.game_date ?? ''} />
                </div>
              </div>
              <div className="col-span-2">
                <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  CricHeroes match URL <span className="text-[#78716C] dark:text-zinc-700">(optional)</span>
                </label>
                <input
                  value={chUrl}
                  onChange={e => setChUrl(e.target.value)}
                  placeholder="https://cricheroes.in/scorecard/..."
                  className="w-full bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded px-2 py-1.5 font-rajdhani text-sm text-[#1C1917] dark:text-zinc-200 mt-1"
                />
              </div>
            </div>

            <button
              onClick={confirmBackfill}
              disabled={confirming || !tournamentId || !preview.game_date}
              className="w-full mt-2 font-rajdhani text-sm font-bold tracking-widest uppercase bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 disabled:opacity-40 px-4 py-2 rounded transition-colors">
              {confirming ? 'Creating…' : 'Create Booking & Sync'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
