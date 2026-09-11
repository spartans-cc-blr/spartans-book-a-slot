'use client'
// Opponent master list + reconciliation queue — see features/team-stats.md §5.
//
// Two sections:
//   1. "Unlinked spellings" — every distinct opponent_name on a confirmed
//      booking that has no opponents.id yet, most-played first, each with
//      fuzzy suggestions (src/lib/nameMatch.ts) to link in one tap, a
//      free pick from the master list, or "create as new opponent".
//   2. "Master list" — every canonical opponent: marquee star, match
//      count, known spellings, inline edit of name / CricHeroes team URL /
//      notes.
// All writes go through /api/opponents and /api/opponents/link, which
// re-check the captain/GC/wrangler/admin gate server-side.

import { useEffect, useState } from 'react'

interface OpponentRow {
  id: string
  name: string
  is_marquee: boolean
  cricheroes_team_url: string | null
  notes: string | null
  aliases: string[]
  matches: number
}
interface Unlinked {
  name: string
  count: number
  last_played: string
  suggestions: { id: string; name: string; dist: number }[]
}

const CARD = 'bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded-lg'
const INPUT = 'form-input font-rajdhani text-sm py-1.5 bg-[var(--stats-card-bg)] dark:bg-zinc-900 border-[var(--stats-card-border)] dark:border-zinc-700 text-[var(--stats-text)] dark:text-zinc-100'
const BTN = 'font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors disabled:opacity-50'
const BTN_GOLD = `${BTN} bg-[var(--stats-badge-bg)] dark:bg-gold/20 border-[var(--stats-accent-dim)] dark:border-gold-dim text-[var(--stats-accent)] dark:text-gold hover:bg-[var(--stats-accent)] hover:text-white dark:hover:text-ink`
const BTN_PLAIN = `${BTN} border-[var(--stats-card-border)] dark:border-ink-5 text-[var(--stats-text-muted)] dark:text-zinc-400 hover:text-[var(--stats-text)] dark:hover:text-zinc-100`

export function OpponentsClient() {
  const [opponents, setOpponents] = useState<OpponentRow[]>([])
  const [unlinked,  setUnlinked]  = useState<Unlinked[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [busy,      setBusy]      = useState<string | null>(null)
  const [showAdd,   setShowAdd]   = useState(false)
  const [addForm,   setAddForm]   = useState({ name: '', is_marquee: false, cricheroes_team_url: '', notes: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm,  setEditForm]  = useState({ name: '', cricheroes_team_url: '', notes: '' })
  const [search,    setSearch]    = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/opponents')
    const d = await res.json()
    if (!res.ok) { setError(d.error ?? 'Failed to load'); setLoading(false); return }
    setOpponents(d.opponents ?? [])
    setUnlinked(d.unlinked ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function call(url: string, method: string, body: any, key: string): Promise<boolean> {
    setBusy(key); setError('')
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(d.error ?? 'Request failed'); return false }
    return true
  }

  async function link(name: string, opponentId: string) {
    if (await call('/api/opponents/link', 'POST', { opponent_id: opponentId, name }, `link:${name}`)) await load()
  }
  async function createFromQueue(name: string) {
    if (await call('/api/opponents', 'POST', { name, link_name: name }, `create:${name}`)) await load()
  }
  async function toggleMarquee(o: OpponentRow) {
    if (await call('/api/opponents', 'PATCH', { id: o.id, is_marquee: !o.is_marquee }, `marquee:${o.id}`)) {
      setOpponents(prev => prev.map(x => x.id === o.id ? { ...x, is_marquee: !o.is_marquee } : x))
    }
  }
  async function handleAdd() {
    const body: any = { name: addForm.name.trim(), is_marquee: addForm.is_marquee }
    if (addForm.cricheroes_team_url.trim()) body.cricheroes_team_url = addForm.cricheroes_team_url.trim()
    if (addForm.notes.trim()) body.notes = addForm.notes.trim()
    if (await call('/api/opponents', 'POST', body, 'add')) {
      setShowAdd(false)
      setAddForm({ name: '', is_marquee: false, cricheroes_team_url: '', notes: '' })
      await load()
    }
  }
  function startEdit(o: OpponentRow) {
    setEditingId(o.id)
    setEditForm({ name: o.name, cricheroes_team_url: o.cricheroes_team_url ?? '', notes: o.notes ?? '' })
  }
  async function saveEdit(id: string) {
    const body: any = { id, name: editForm.name.trim(), cricheroes_team_url: editForm.cricheroes_team_url.trim() || null, notes: editForm.notes.trim() || null }
    if (await call('/api/opponents', 'PATCH', body, `edit:${id}`)) { setEditingId(null); await load() }
  }

  const visible = opponents.filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.aliases.some(a => a.includes(search.toLowerCase())))

  if (loading) return <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500">Loading…</p>

  return (
    <div className="space-y-8">
      {error && (
        <p className="font-rajdhani text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded px-3 py-2">{error}</p>
      )}

      {/* ── Unlinked queue ── */}
      <section>
        <h2 className="font-rajdhani text-xs font-bold tracking-[3px] uppercase text-[var(--stats-text-muted)] dark:text-zinc-500 mb-2">
          Unlinked spellings <span className="text-[var(--stats-accent)] dark:text-gold">({unlinked.length})</span>
        </h2>
        {unlinked.length === 0 ? (
          <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500">Every booked opponent is linked. 🎉</p>
        ) : (
          <ul className={`${CARD} divide-y divide-[var(--stats-divider)] dark:divide-ink-4`}>
            {unlinked.map(u => (
              <li key={u.name} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-rajdhani text-sm font-semibold text-[var(--stats-text)] dark:text-parchment truncate">{u.name}</p>
                  <p className="font-rajdhani text-[11px] text-[var(--stats-text-faint)] dark:text-zinc-600">{u.count} match{u.count === 1 ? '' : 'es'} · last {u.last_played}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {u.suggestions.map(s => (
                    <button key={s.id} disabled={busy !== null} onClick={() => link(u.name, s.id)} className={BTN_GOLD} title={`Link to ${s.name}`}>
                      → {s.name}
                    </button>
                  ))}
                  <select className={`${INPUT} w-auto py-1`} defaultValue="" disabled={busy !== null}
                    onChange={e => { if (e.target.value) link(u.name, e.target.value); e.target.value = '' }}>
                    <option value="">Link to…</option>
                    {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button disabled={busy !== null} onClick={() => createFromQueue(u.name)} className={BTN_PLAIN}>＋ New opponent</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Master list ── */}
      <section>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h2 className="font-rajdhani text-xs font-bold tracking-[3px] uppercase text-[var(--stats-text-muted)] dark:text-zinc-500">
            Master list <span className="text-[var(--stats-accent)] dark:text-gold">({opponents.length})</span>
          </h2>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className={`${INPUT} w-40 ml-auto`} />
          <button onClick={() => setShowAdd(v => !v)} className={BTN_GOLD}>{showAdd ? 'Cancel' : '＋ Add opponent'}</button>
        </div>

        {showAdd && (
          <div className={`${CARD} p-4 mb-3 grid grid-cols-1 md:grid-cols-2 gap-2`}>
            <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Club name" className={INPUT} />
            <input value={addForm.cricheroes_team_url} onChange={e => setAddForm(f => ({ ...f, cricheroes_team_url: e.target.value }))} placeholder="CricHeroes team URL (optional)" className={INPUT} />
            <input value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className={`${INPUT} md:col-span-2`} />
            <label className="flex items-center gap-2 font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-2)] dark:text-zinc-300">
              <input type="checkbox" checked={addForm.is_marquee} onChange={e => setAddForm(f => ({ ...f, is_marquee: e.target.checked }))} className="accent-[var(--stats-accent)] dark:accent-gold" />
              Marquee opponent
            </label>
            <div className="md:text-right">
              <button disabled={busy !== null || addForm.name.trim().length < 2} onClick={handleAdd} className={BTN_GOLD}>Save</button>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500">No opponents yet — link the spellings above or add one.</p>
        ) : (
          <ul className={`${CARD} divide-y divide-[var(--stats-divider)] dark:divide-ink-4`}>
            {visible.map(o => (
              <li key={o.id} className="px-4 py-3">
                {editingId === o.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={INPUT} />
                    <input value={editForm.cricheroes_team_url} onChange={e => setEditForm(f => ({ ...f, cricheroes_team_url: e.target.value }))} placeholder="CricHeroes team URL" className={INPUT} />
                    <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" className={`${INPUT} md:col-span-2`} />
                    <div className="flex gap-2 md:col-span-2 md:justify-end">
                      <button onClick={() => setEditingId(null)} className={BTN_PLAIN}>Cancel</button>
                      <button disabled={busy !== null} onClick={() => saveEdit(o.id)} className={BTN_GOLD}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggleMarquee(o)} disabled={busy !== null} title={o.is_marquee ? 'Marquee — tap to unstar' : 'Tap to mark as marquee'}
                      className={`text-lg leading-none mt-0.5 ${o.is_marquee ? 'text-[var(--stats-accent)] dark:text-gold' : 'text-[var(--stats-text-faint)] dark:text-zinc-600 hover:text-[var(--stats-accent)]'}`}>
                      {o.is_marquee ? '★' : '☆'}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-rajdhani text-sm font-semibold text-[var(--stats-text)] dark:text-parchment flex items-center gap-2 flex-wrap">
                        <a href={`/team-stats?by=opponent&opponent=id:${o.id}`} className="hover:text-[var(--stats-accent)] dark:hover:text-gold underline decoration-dotted underline-offset-2">{o.name}</a>
                        <span className="font-normal text-[11px] text-[var(--stats-text-faint)] dark:text-zinc-600">{o.matches} match{o.matches === 1 ? '' : 'es'}</span>
                        {o.cricheroes_team_url && (
                          <a href={o.cricheroes_team_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--stats-accent)] dark:text-gold">CricHeroes ↗</a>
                        )}
                      </p>
                      {o.aliases.length > 0 && (
                        <p className="font-rajdhani text-[11px] text-[var(--stats-text-faint)] dark:text-zinc-600 truncate" title={o.aliases.join(' · ')}>
                          Spellings: {o.aliases.join(' · ')}
                        </p>
                      )}
                      {o.notes && <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 mt-0.5">{o.notes}</p>}
                    </div>
                    <button onClick={() => startEdit(o)} className={BTN_PLAIN}>Edit</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
