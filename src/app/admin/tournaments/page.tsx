'use client'

import { useState, useEffect } from 'react'

type Ground = { id: string; name: string }
type Tournament = {
  id: string
  name: string
  organiser_name: string | null
  organiser_contact: string | null
  ball_type: 'red' | 'white' | 'pink'
  ground_id: string | null
  active: boolean
  created_at: string
}

const BALL_LABELS = { red: '🔴 Red', white: '⚪ White', pink: '🩷 Pink' }

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [grounds,     setGrounds]     = useState<Ground[]>([])
  const [loading,     setLoading]     = useState(true)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editForm,    setEditForm]    = useState<Partial<Tournament>>({})
  const [showAdd,     setShowAdd]     = useState(false)
  const [addForm,     setAddForm]     = useState({ name: '', organiser_name: '', organiser_contact: '', ball_type: 'white' as 'red'|'white'|'pink', ground_id: '' })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/tournaments').then(r => r.json()),
      fetch('/api/grounds').then(r => r.json()),
    ]).then(([t, g]) => {
      setTournaments(t.tournaments ?? [])
      setGrounds(g.grounds ?? [])
      setLoading(false)
    })
  }, [])

  function startEdit(t: Tournament) {
    setEditingId(t.id)
    setEditForm({ name: t.name, organiser_name: t.organiser_name ?? '', organiser_contact: t.organiser_contact ?? '', ball_type: t.ball_type, ground_id: t.ground_id ?? '', active: t.active })
    setError('')
  }

  async function saveEdit(id: string) {
    setSaving(true)
    setError('')
    const res = await fetch('/api/tournaments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm, ground_id: editForm.ground_id || null }),
    })
    if (res.ok) {
      const d = await res.json()
      setTournaments(prev => prev.map(t => t.id === id ? d.tournament : t))
      setEditingId(null)
    } else {
      setError('Failed to save.')
    }
    setSaving(false)
  }

  async function toggleActive(t: Tournament) {
    const res = await fetch('/api/tournaments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, active: !t.active }),
    })
    if (res.ok) {
      const d = await res.json()
      setTournaments(prev => prev.map(x => x.id === t.id ? d.tournament : x))
    }
  }

  async function handleAdd() {
    if (!addForm.name.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...addForm, ground_id: addForm.ground_id || null }),
    })
    if (res.ok) {
      const d = await res.json()
      setTournaments(prev => [d.tournament, ...prev])
      setShowAdd(false)
      setAddForm({ name: '', organiser_name: '', organiser_contact: '', ball_type: 'white', ground_id: '' })
    } else {
      setError('Failed to add tournament.')
    }
    setSaving(false)
  }

  const groundName = (id: string | null) => grounds.find(g => g.id === id)?.name ?? '—'

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-cinzel text-xl font-bold text-gold">Tournaments</h1>
          <p className="font-rajdhani text-zinc-500 text-sm mt-1">Manage tournaments — ball type, ground, organiser details.</p>
        </div>
        <button onClick={() => { setShowAdd(v => !v); setError('') }}
          className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark text-white px-3 py-1.5 rounded transition-colors">
          {showAdd ? '✕ Cancel' : '＋ Add Tournament'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-6 space-y-4">
          <h2 className="font-cinzel text-sm text-gold font-semibold">New Tournament</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Tournament Name <span className="text-crimson">*</span></label>
              <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Lakeview RCG Edition 12" className="form-input" />
            </div>
            <div>
              <label className="form-label">Organiser Name</label>
              <input value={addForm.organiser_name} onChange={e => setAddForm(f => ({ ...f, organiser_name: e.target.value }))}
                placeholder="e.g. Ravi Kumar" className="form-input" />
            </div>
            <div>
              <label className="form-label">Organiser WhatsApp</label>
              <input value={addForm.organiser_contact} onChange={e => setAddForm(f => ({ ...f, organiser_contact: e.target.value }))}
                placeholder="e.g. 919876543210" className="form-input" />
            </div>
            <div>
              <label className="form-label">Ground</label>
              <select value={addForm.ground_id} onChange={e => setAddForm(f => ({ ...f, ground_id: e.target.value }))} className="form-input">
                <option value="">None</option>
                {grounds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Ball Type</label>
              <div className="flex gap-2">
                {(['red', 'white', 'pink'] as const).map(b => (
                  <button key={b} onClick={() => setAddForm(f => ({ ...f, ball_type: b }))}
                    className={`flex-1 py-2 rounded border font-rajdhani text-xs font-bold uppercase tracking-wide transition-colors
                      ${addForm.ball_type === b ? 'border-gold bg-gold/10 text-gold' : 'border-ink-5 bg-ink-4 text-zinc-500 hover:border-gold-dim'}`}>
                    {BALL_LABELS[b]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="font-rajdhani text-xs text-red-400">{error}</p>}
          <button onClick={handleAdd} disabled={!addForm.name.trim() || saving}
            className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
            {saving ? 'Adding...' : '＋ Add Tournament'}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-5 bg-ink-4">
                {['Tournament', 'Organiser', 'Ball', 'Ground', 'Status', ''].map(h => (
                  <th key={h} className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">Loading...</td></tr>
              )}
              {!loading && tournaments.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">No tournaments yet.</td></tr>
              )}
              {tournaments.map(t => (
                <tr key={t.id} className="border-b border-ink-4 hover:bg-ink-4 transition-colors">
                  {editingId === t.id ? (
                    <td colSpan={6} className="px-4 py-4">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="form-label">Name</label>
                          <input value={editForm.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="form-input" />
                        </div>
                        <div>
                          <label className="form-label">Organiser Name</label>
                          <input value={editForm.organiser_name ?? ''} onChange={e => setEditForm(f => ({ ...f, organiser_name: e.target.value }))} className="form-input" />
                        </div>
                        <div>
                          <label className="form-label">Organiser WhatsApp</label>
                          <input value={editForm.organiser_contact ?? ''} onChange={e => setEditForm(f => ({ ...f, organiser_contact: e.target.value }))} className="form-input" />
                        </div>
                        <div>
                          <label className="form-label">Ground</label>
                          <select value={editForm.ground_id ?? ''} onChange={e => setEditForm(f => ({ ...f, ground_id: e.target.value }))} className="form-input">
                            <option value="">None</option>
                            {grounds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Ball Type</label>
                          <div className="flex gap-2">
                            {(['red', 'white', 'pink'] as const).map(b => (
                              <button key={b} onClick={() => setEditForm(f => ({ ...f, ball_type: b }))}
                                className={`flex-1 py-2 rounded border font-rajdhani text-xs font-bold uppercase tracking-wide transition-colors
                                  ${editForm.ball_type === b ? 'border-gold bg-gold/10 text-gold' : 'border-ink-5 bg-ink-4 text-zinc-500 hover:border-gold-dim'}`}>
                                {BALL_LABELS[b]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {error && <p className="font-rajdhani text-xs text-red-400 mt-2">{error}</p>}
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => saveEdit(t.id)} disabled={saving}
                          className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-1.5 rounded transition-colors">
                          {saving ? 'Saving...' : '✓ Save'}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 border border-ink-5 px-4 py-1.5 rounded transition-colors">
                          Cancel
                        </button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-rajdhani font-semibold text-sm text-parchment max-w-[180px] truncate">{t.name}</td>
                      <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{t.organiser_name ?? '—'}</td>
                      <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{BALL_LABELS[t.ball_type] ?? '—'}</td>
                      <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{groundName(t.ground_id)}</td>
                      <td className="px-4 py-3">
                        <span className={`font-rajdhani text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-sm border
                          ${t.active ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}>
                          {t.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(t)}
                            className="font-rajdhani text-xs text-zinc-600 hover:text-gold border border-ink-5 hover:border-gold-dim px-2 py-1 rounded transition-colors">
                            Edit
                          </button>
                          <button onClick={() => toggleActive(t)}
                            className="font-rajdhani text-xs text-zinc-600 hover:text-zinc-300 border border-ink-5 px-2 py-1 rounded transition-colors">
                            {t.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}