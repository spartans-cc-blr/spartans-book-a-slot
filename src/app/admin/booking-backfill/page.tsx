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
}

const SLOT_TIMES = ['07:30', '10:30', '12:30', '14:30'] as const
const FORMATS = ['T20', 'T30'] as const

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
