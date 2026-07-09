'use client'

import { useState, useMemo } from 'react'

type Role = 'C' | 'VC' | 'WK' | null

interface ParsedPlayer {
  name:              string
  role:              Role
  matched_player_id: string | null
  suggestions?:      string[]
}

interface RosterPlayer {
  id:   string
  name: string
}

interface ParseResponse {
  booking_id:           string | null
  date_raw:             string | null
  players:              ParsedPlayer[]
  roster:               RosterPlayer[]
  availability:         Record<string, string>
  existing_squad_count: number
}

// Row state as edited in the UI — starts from the parsed entry, but the
// resolved player_id can be overridden via the dropdown.
interface RowState {
  name:       string
  role:       Role
  player_id:  string | null
}

export function BackfillSquadClient() {
  const [text,    setText]    = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsed,  setParsed]  = useState<ParseResponse | null>(null)
  const [rows,    setRows]    = useState<RowState[]>([])
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)
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
        role:      p.role,
        player_id: p.matched_player_id,
      })))
      setOverwriteConfirmed(false)
    } catch {
      setParseError('Network error while parsing')
    } finally {
      setParsing(false)
    }
  }

  function updateRowPlayer(index: number, playerId: string) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, player_id: playerId || null } : r))
  }

  const needsOverwriteGate = (parsed?.existing_squad_count ?? 0) > 0
  const allResolved = rows.length > 0 && rows.every(r => r.player_id)
  const canSave = !!parsed?.booking_id && allResolved && (!needsOverwriteGate || overwriteConfirmed)

  async function handleSave() {
    if (!parsed?.booking_id) return
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch('/api/wrangler/backfill-squad', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: parsed.booking_id,
          players:    rows.map(r => ({ player_id: r.player_id, role: r.role })),
          overwrite:  needsOverwriteGate ? overwriteConfirmed : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setToast({ kind: 'error', message: data.error ?? 'Failed to save squad' })
        return
      }
      setToast({ kind: 'success', message: `Saved ${data.count} squad rows for the match.` })
      // Clear the form for the next paste
      setText('')
      setParsed(null)
      setRows([])
      setOverwriteConfirmed(false)
    } catch {
      setToast({ kind: 'error', message: 'Network error while saving' })
    } finally {
      setSaving(false)
    }
  }

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
              {parsed.booking_id
                ? <span className="text-zinc-300">{parsed.booking_id}</span>
                : <span className="text-red-400">Not found — no /fixtures/&lt;id&gt; link in text</span>}
            </span>
            {parsed.date_raw && <span>Date in text: <span className="text-zinc-300">{parsed.date_raw}</span></span>}
            <span>Parsed players: <span className="text-zinc-300">{rows.length}</span></span>
          </div>

          {/* Overwrite warning */}
          {needsOverwriteGate && (
            <div className="bg-amber-950/40 border border-amber-700 rounded p-3">
              <p className="font-rajdhani text-sm text-amber-300">
                ⚠️ Squad rows already exist for this booking ({parsed.existing_squad_count} row
                {parsed.existing_squad_count === 1 ? '' : 's'}). Saving will delete and replace them.
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
                    const flagged = !row.player_id || response === 'L' || !response

                    return (
                      <tr key={i} className="border-b border-ink-4">
                        <td className="px-4 py-2.5 font-rajdhani text-sm text-parchment whitespace-nowrap">{row.name}</td>
                        <td className="px-4 py-2.5">
                          {row.role && (
                            <span className="font-rajdhani text-[10px] font-bold bg-gold/10 border border-gold-dim text-gold px-1.5 py-0.5 rounded">
                              {row.role}
                            </span>
                          )}
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
                          {flagged && (
                            <span className="font-rajdhani text-[9px] font-bold bg-amber-950/40 border border-amber-700 text-amber-400 px-1.5 py-0.5 rounded">
                              {!row.player_id ? 'unmatched' : response === 'L' ? 'marked L' : 'no response'}
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
          {!parsed.booking_id && (
            <p className="font-rajdhani text-xs text-red-400">Cannot save — no booking_id found in the pasted text.</p>
          )}
          {parsed.booking_id && !allResolved && (
            <p className="font-rajdhani text-xs text-amber-400">Resolve every player to a roster match before saving.</p>
          )}
        </div>
      )}
    </div>
  )
}
