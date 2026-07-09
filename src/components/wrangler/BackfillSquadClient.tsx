'use client'

import { useState, useMemo } from 'react'

type Role = 'C' | 'VC' | 'WK'
type ResolvedVia = 'fixtures_link' | 'match_id' | 'date_format_fallback' | 'unresolved'

interface ParsedPlayer {
  name:              string
  roles:             Role[]
  matched_player_id: string | null
  suggestions?:      string[]
}

interface RosterPlayer {
  id:   string
  name: string
}

interface BookingCandidate {
  id:            string
  game_date:     string
  format:        string
  opponent_name: string | null
}

interface ParseResponse {
  booking_id:           string | null
  resolved_via:         ResolvedVia
  candidates?:          BookingCandidate[]
  date_raw:             string | null
  format_raw:           string | null
  players:              ParsedPlayer[]
  roster:               RosterPlayer[]
  availability:         Record<string, string>
  existing_squad_count: number
}

// Row state as edited in the UI — starts from the parsed entry, but the
// resolved player_id can be overridden via the dropdown.
interface RowState {
  name:       string
  roles:      Role[]
  player_id:  string | null
}

const RESOLVED_VIA_LABEL: Record<ResolvedVia, string> = {
  fixtures_link:        'Resolved via /fixtures link',
  match_id:              'Resolved via CricHeroes match link',
  date_format_fallback:  'Resolved via date + format match',
  unresolved:            'Could not resolve automatically',
}

export function BackfillSquadClient() {
  const [text,    setText]    = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsed,  setParsed]  = useState<ParseResponse | null>(null)
  const [rows,    setRows]    = useState<RowState[]>([])
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)
  const [manualOverwriteNeeded, setManualOverwriteNeeded] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const rosterById = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of parsed?.roster ?? []) map.set(p.id, p.name)
    return map
  }, [parsed])

  async function handleParse() {
    setParsing(true)
    setParseError('')
    setToast(null)
    try {
      const res  = await fetch('/api/wrangler/parse-announcement', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setParseError(data.error ?? 'Failed to parse announcement')
        setParsed(null)
        setRows([])
        return
      }
      setParsed(data)
      setRows(data.players.map((p: ParsedPlayer) => ({
        name:      p.name,
        roles:     p.roles,
        player_id: p.matched_player_id,
      })))
      setSelectedBookingId(data.booking_id)
      setOverwriteConfirmed(false)
      setManualOverwriteNeeded(false)
    } catch {
      setParseError('Network error while parsing')
    } finally {
      setParsing(false)
    }
  }

  function updateRowPlayer(index: number, playerId: string) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, player_id: playerId || null } : r))
  }

  function handleSelectCandidate(id: string) {
    setSelectedBookingId(id || null)
    // A different match than what the server resolved — the availability/
    // existing-squad check below was computed against the auto-resolved
    // booking (if any), not this one, so re-arm the overwrite gate and
    // let the server's own 409 check be the real safety net (see handleSave).
    setOverwriteConfirmed(false)
    setManualOverwriteNeeded(false)
  }

  // True once we know for certain (from the parse response) that squad rows
  // already exist for the booking that was auto-resolved at parse time.
  const knownExistingSquad = parsed?.booking_id === selectedBookingId && (parsed?.existing_squad_count ?? 0) > 0
  const needsOverwriteGate = knownExistingSquad || manualOverwriteNeeded
  const allResolved = rows.length > 0 && rows.every(r => r.player_id)
  const canSave = !!selectedBookingId && allResolved && (!needsOverwriteGate || overwriteConfirmed)

  // Availability data (for the per-row flag) is only meaningful for the
  // booking the server actually resolved and fetched at parse time — a
  // manually picked candidate has no availability data behind it yet.
  const hasAvailabilityData = !!parsed?.booking_id && parsed.booking_id === selectedBookingId

  async function handleSave() {
    if (!selectedBookingId) return
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch('/api/wrangler/backfill-squad', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: selectedBookingId,
          players:    rows.map(r => ({ player_id: r.player_id, roles: r.roles })),
          overwrite:  needsOverwriteGate ? overwriteConfirmed : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          // Server knows better than we do (e.g. a manually picked candidate
          // that turned out to already have squad rows) — surface the same
          // overwrite gate and let the wrangler confirm and retry.
          setManualOverwriteNeeded(true)
          setToast({ kind: 'error', message: 'Squad rows already exist for this match — check "Overwrite existing rows" and save again.' })
        } else {
          setToast({ kind: 'error', message: data.error ?? 'Failed to save squad' })
        }
        return
      }
      setToast({ kind: 'success', message: `Saved ${data.count} squad rows for the match.` })
      // Clear the form for the next paste
      setText('')
      setParsed(null)
      setRows([])
      setSelectedBookingId(null)
      setOverwriteConfirmed(false)
      setManualOverwriteNeeded(false)
    } catch {
      setToast({ kind: 'error', message: 'Network error while saving' })
    } finally {
      setSaving(false)
    }
  }

  const ambiguousFallback = parsed?.resolved_via === 'date_format_fallback' && parsed.booking_id === null
  const unresolved        = parsed?.resolved_via === 'unresolved'

  return (
    <div className="space-y-5">
      {/* Paste box */}
      <div className="bg-ink-3 border border-ink-5 rounded p-4">
        <label className="form-label">WhatsApp announcement text</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          placeholder="Paste the full WhatsApp squad announcement here…"
          className="form-input font-mono text-xs w-full"
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleParse}
            disabled={parsing || !text.trim()}
            className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
            {parsing ? 'Parsing…' : 'Parse'}
          </button>
          {parseError && <p className="font-rajdhani text-xs text-red-400">{parseError}</p>}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`font-rajdhani text-sm px-4 py-2.5 rounded border ${
          toast.kind === 'success'
            ? 'bg-emerald-950/40 border-emerald-700 text-emerald-400'
            : 'bg-red-950/40 border-red-800 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {parsed && (
        <div className="space-y-4">
          {/* Booking / date context */}
          <div className="font-rajdhani text-xs text-zinc-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Booking:{' '}
              {selectedBookingId
                ? <span className="text-zinc-300">{selectedBookingId}</span>
                : <span className="text-red-400">Not resolved</span>}
            </span>
            <span className={parsed.booking_id ? 'text-emerald-400' : 'text-amber-400'}>
              {RESOLVED_VIA_LABEL[parsed.resolved_via]}
            </span>
            {parsed.date_raw   && <span>Date in text: <span className="text-zinc-300">{parsed.date_raw}</span></span>}
            {parsed.format_raw && <span>Format in text: <span className="text-zinc-300">{parsed.format_raw}</span></span>}
            <span>Parsed players: <span className="text-zinc-300">{rows.length}</span></span>
          </div>

          {/* Manual booking picker — ambiguous date+format fallback */}
          {ambiguousFallback && (
            <div className="bg-amber-950/40 border border-amber-700 rounded p-3">
              <p className="font-rajdhani text-sm text-amber-300">
                {parsed.candidates?.length
                  ? `Couldn't confidently match this to one booking — ${parsed.candidates.length} bookings share this date and format. Pick the correct match:`
                  : 'No booking found matching this date and format — pick the correct match manually if you know it, or double-check the pasted text.'}
              </p>
              {!!parsed.candidates?.length && (
                <select
                  value={selectedBookingId ?? ''}
                  onChange={e => handleSelectCandidate(e.target.value)}
                  className="form-input text-xs mt-2">
                  <option value="">— Select the correct match —</option>
                  {parsed.candidates.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.game_date} · {c.format}{c.opponent_name ? ` vs ${c.opponent_name}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Fully unresolved — no signal to even attempt a match */}
          {unresolved && (
            <div className="bg-red-950/40 border border-red-800 rounded p-3">
              <p className="font-rajdhani text-sm text-red-400">
                Couldn't resolve a booking from this message — no /fixtures link, no CricHeroes match
                link, and no parseable date + format line. Nothing to save automatically.
              </p>
            </div>
          )}

          {/* Manually selected a candidate different from the auto-resolved one — no availability/existing-squad data behind it yet */}
          {selectedBookingId && parsed.booking_id !== selectedBookingId && (
            <div className="bg-sky-950/40 border border-sky-700 rounded p-3">
              <p className="font-rajdhani text-sm text-sky-300">
                Manually selected match — availability flags below are unavailable for it, and we
                won't know if it already has a squad until you save. If one exists, saving will
                prompt you to confirm overwrite.
              </p>
            </div>
          )}

          {/* Overwrite warning */}
          {needsOverwriteGate && (
            <div className="bg-amber-950/40 border border-amber-700 rounded p-3">
              <p className="font-rajdhani text-sm text-amber-300">
                ⚠️ Squad rows already exist for this booking
                {knownExistingSquad ? ` (${parsed.existing_squad_count} row${parsed.existing_squad_count === 1 ? '' : 's'})` : ''}.
                Saving will delete and replace them.
              </p>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwriteConfirmed}
                  onChange={e => setOverwriteConfirmed(e.target.checked)}
                  className="w-4 h-4 accent-crimson"
                />
                <span className="font-rajdhani text-sm text-amber-200">Overwrite existing rows</span>
              </label>
            </div>
          )}

          {/* Preview table */}
          <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink-5 bg-ink-4">
                    {['Name', 'Role', 'Matched Player', 'Flag'].map(h => (
                      <th key={h} className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const parsedEntry = parsed.players[i]
                    const resolvedName = row.player_id ? rosterById.get(row.player_id) : null
                    const response = row.player_id ? parsed.availability[row.player_id] : undefined

                    const flagLabel = !row.player_id
                      ? 'unmatched'
                      : !hasAvailabilityData
                        ? 'no data'
                        : response === 'L'
                          ? 'marked L'
                          : !response
                            ? 'no response'
                            : null

                    return (
                      <tr key={i} className="border-b border-ink-4">
                        <td className="px-4 py-2.5 font-rajdhani text-sm text-parchment whitespace-nowrap">{row.name}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1 flex-wrap">
                            {row.roles.map(r => (
                              <span key={r} className="font-rajdhani text-[10px] font-bold bg-gold/10 border border-gold-dim text-gold px-1.5 py-0.5 rounded">
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {parsedEntry?.matched_player_id ? (
                            <span className="font-rajdhani text-sm text-emerald-400">{resolvedName}</span>
                          ) : (
                            <select
                              value={row.player_id ?? ''}
                              onChange={e => updateRowPlayer(i, e.target.value)}
                              className="form-input text-xs">
                              <option value="">— Select player —</option>
                              {(parsedEntry?.suggestions?.length
                                ? parsed.roster.filter(p => parsedEntry.suggestions!.includes(p.name))
                                : parsed.roster
                              ).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {flagLabel && (
                            <span className="font-rajdhani text-[9px] font-bold bg-amber-950/40 border border-amber-700 text-amber-400 px-1.5 py-0.5 rounded">
                              {flagLabel}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
            {saving ? 'Saving…' : 'Confirm & Save'}
          </button>
          {!selectedBookingId && (
            <p className="font-rajdhani text-xs text-red-400">Cannot save — no booking resolved for this announcement.</p>
          )}
          {selectedBookingId && !allResolved && (
            <p className="font-rajdhani text-xs text-amber-400">Resolve every player to a roster match before saving.</p>
          )}
        </div>
      )}
    </div>
  )
}
