'use client'

import { useState, useEffect } from 'react'

type FeeExemption = {
  id: string
  reason: string
  start_date: string
  end_date: string | null
  notes: string | null
}

type Player = {
  id: string
  name: string
  gmail_id: string | null
  whatsapp: string | null
  dob: string | null
  jersey_name: string | null
  jersey_number: number | null
  blood_group: string | null
  primary_skill: string | null
  secondary_skill: string | null
  referred_by: string | null
  inducted_on: string | null
  wallet_balance: number
  active: boolean
  dues_override: boolean
  is_captain: boolean
  status: 'active' | 'inactive' | 'expelled'
  cricheroes_url: string | null
  fee_exemptions?: FeeExemption[]
}

const SKILLS = ['Batsman', 'Bowler', 'All-rounder', 'Wicket Keeper']
const EXEMPTION_REASONS = ['student', 'sabbatical', 'job_search', 'medical', 'other']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

function isCurrentlyExempt(exemptions: FeeExemption[] = []): FeeExemption | null {
  const today = new Date().toISOString().split('T')[0]
  return exemptions.find(e =>
    e.start_date <= today && (e.end_date === null || e.end_date >= today)
  ) ?? null
}

export default function AdminPlayersPage() {
  const [players,     setPlayers]     = useState<Player[]>([])
  const [loading,     setLoading]     = useState(true)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editForm,    setEditForm]    = useState<Partial<Player>>({})
  const [showAdd,     setShowAdd]     = useState(false)
  const [showExempt,  setShowExempt]  = useState<string | null>(null)
  const [exemptForm,  setExemptForm]  = useState({ reason: 'student', start_date: new Date().toISOString().split('T')[0], end_date: '', notes: '' })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [search,      setSearch]      = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive' | 'expelled'>('active')

  const [addForm, setAddForm] = useState({
    name: '', gmail_id: '', whatsapp: '', dob: '', jersey_name: '',
    jersey_number: '', blood_group: '', primary_skill: '', secondary_skill: '',
    referred_by: '', inducted_on: '', wallet_balance: '0', cricheroes_url: '',
  })

  useEffect(() => {
    fetch('/api/players')
      .then(r => r.json())
      .then(d => { setPlayers(d.players ?? []); setLoading(false) })
  }, [])

  const filtered = players
    .filter(p => {
      if (filterActive === 'all') return true
      if (filterActive === 'expelled') return p.status === 'expelled'
      if (filterActive === 'active') return p.active && p.status !== 'expelled'
      if (filterActive === 'inactive') return !p.active && p.status !== 'expelled'
      return true
    })
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.whatsapp?.includes(search) || p.gmail_id?.toLowerCase().includes(search.toLowerCase()))

  function startEdit(p: Player) {
    setEditingId(p.id)
    setEditForm({ ...p })
    setError('')
  }

  async function saveEdit(id: string) {
    setSaving(true)
    setError('')
    const res = await fetch('/api/players', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm }),
    })
    if (res.ok) {
      const d = await res.json()
      setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...d.player } : p))
      setEditingId(null)
    } else {
      setError('Failed to save.')
    }
    setSaving(false)
  }

  async function handleAdd() {
    if (!addForm.name.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...addForm,
        jersey_number: addForm.jersey_number ? parseInt(addForm.jersey_number) : null,
        wallet_balance: parseFloat(addForm.wallet_balance) || 0,
      }),
    })
    if (res.ok) {
      const d = await res.json()
      setPlayers(prev => [d.player, ...prev])
      setShowAdd(false)
      setAddForm({ name: '', gmail_id: '', whatsapp: '', dob: '', jersey_name: '',
        jersey_number: '', blood_group: '', primary_skill: '', secondary_skill: '',
        referred_by: '', inducted_on: '', wallet_balance: '0', cricheroes_url: '' })
    } else {
      setError('Failed to add player.')
    }
    setSaving(false)
  }

  async function addExemption(playerId: string) {
    setSaving(true)
    setError('')
    const res = await fetch('/api/players/exemptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_id: playerId,
        reason: exemptForm.reason,
        start_date: exemptForm.start_date,
        end_date: exemptForm.end_date || null,
        notes: exemptForm.notes || null,
      }),
    })
    if (res.ok) {
      const d = await res.json()
      setPlayers(prev => prev.map(p => p.id === playerId
        ? { ...p, fee_exemptions: [...(p.fee_exemptions ?? []), d.exemption] }
        : p
      ))
      setShowExempt(null)
      setExemptForm({ reason: 'student', start_date: new Date().toISOString().split('T')[0], end_date: '', notes: '' })
    } else {
      setError('Failed to add exemption.')
    }
    setSaving(false)
  }

  async function expelPlayer(id: string, name: string) {
    if (!confirm(`Are you sure you want to expel ${name}? This cannot be undone easily.`)) return
    const res = await fetch('/api/players', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'expelled', active: false }),
    })
    if (res.ok) {
      setPlayers(prev => prev.map(p => p.id === id ? { ...p, status: 'expelled', active: false } : p))
    }
  }

  async function endExemption(playerId: string, exemptionId: string) {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch('/api/players/exemptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: exemptionId, end_date: today }),
    })
    if (res.ok) {
      setPlayers(prev => prev.map(p => p.id === playerId
        ? { ...p, fee_exemptions: p.fee_exemptions?.map(e => e.id === exemptionId ? { ...e, end_date: today } : e) }
        : p
      ))
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-cinzel text-xl font-bold text-gold">Players</h1>
          <p className="font-rajdhani text-zinc-500 text-sm mt-1">
            {players.filter(p => p.active).length} active players · {players.filter(p => isCurrentlyExempt(p.fee_exemptions)).length} currently fee-exempt
          </p>
        </div>
        <button onClick={() => { setShowAdd(v => !v); setError('') }}
          className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark text-white px-3 py-1.5 rounded transition-colors">
          {showAdd ? '✕ Cancel' : '＋ Add Player'}
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email or phone..."
          className="form-input flex-1 min-w-[200px]" />
        <div className="flex border border-ink-5 rounded overflow-hidden">
          {(['active', 'inactive', 'expelled', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilterActive(f)}
              className={`px-3 py-1.5 font-rajdhani text-xs font-bold uppercase tracking-wide transition-colors
                ${filterActive === f ? 'bg-gold-dim text-gold' : 'bg-ink-4 text-zinc-500 hover:text-zinc-300'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-6">
          <h2 className="font-cinzel text-sm text-gold font-semibold mb-4">New Player</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'Full Name *', key: 'name', type: 'text' },
              { label: 'Gmail ID', key: 'gmail_id', type: 'email' },
              { label: 'WhatsApp', key: 'whatsapp', type: 'tel' },
              { label: 'Date of Birth', key: 'dob', type: 'date' },
              { label: 'Jersey Name', key: 'jersey_name', type: 'text' },
              { label: 'Jersey Number', key: 'jersey_number', type: 'number' },
              { label: 'Inducted On', key: 'inducted_on', type: 'date' },
              { label: 'Referred By', key: 'referred_by', type: 'text' },
              { label: 'Wallet Balance', key: 'wallet_balance', type: 'number' },
              { label: 'CricHeroes URL', key: 'cricheroes_url', type: 'text' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="form-label">{label}</label>
                <input type={type} value={(addForm as any)[key]}
                  onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                  className="form-input" />
              </div>
            ))}
            <div>
              <label className="form-label">Blood Group</label>
              <select value={addForm.blood_group} onChange={e => setAddForm(f => ({ ...f, blood_group: e.target.value }))} className="form-input">
                <option value="">Select...</option>
                {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Primary Skill</label>
              <select value={addForm.primary_skill} onChange={e => setAddForm(f => ({ ...f, primary_skill: e.target.value }))} className="form-input">
                <option value="">Select...</option>
                {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Secondary Skill</label>
              <select value={addForm.secondary_skill} onChange={e => setAddForm(f => ({ ...f, secondary_skill: e.target.value }))} className="form-input">
                <option value="">Select...</option>
                {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="font-rajdhani text-xs text-red-400 mt-3">{error}</p>}
          <button onClick={handleAdd} disabled={!addForm.name.trim() || saving}
            className="mt-4 font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
            {saving ? 'Adding...' : '＋ Add Player'}
          </button>
        </div>
      )}

      {/* Players table */}
      <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-5 bg-ink-4">
                {['Player', 'Contact', 'Skills', 'Blood Grp', 'Wallet', 'Status', ''].map(h => (
                  <th key={h} className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">Loading...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">No players found.</td></tr>
              )}
              {filtered.map(p => {
                const exempt = isCurrentlyExempt(p.fee_exemptions)
                const hasDues = p.wallet_balance < 0

                if (editingId === p.id) {
                  return (
                    <tr key={p.id} className="border-b border-ink-4 bg-ink-4">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {[
                            { label: 'Name', key: 'name', type: 'text' },
                            { label: 'Gmail', key: 'gmail_id', type: 'email' },
                            { label: 'WhatsApp', key: 'whatsapp', type: 'tel' },
                            { label: 'Jersey Name', key: 'jersey_name', type: 'text' },
                            { label: 'Jersey No', key: 'jersey_number', type: 'number' },
                            { label: 'Wallet Balance', key: 'wallet_balance', type: 'number' },
                            { label: 'CricHeroes URL', key: 'cricheroes_url', type: 'text' },
                            { label: 'Referred By', key: 'referred_by', type: 'text' },
                          ].map(({ label, key, type }) => (
                            <div key={key}>
                              <label className="form-label">{label}</label>
                              <input type={type} value={(editForm as any)[key] ?? ''}
                                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                                className="form-input" />
                            </div>
                          ))}
                          <div>
                            <label className="form-label">Primary Skill</label>
                            <select value={editForm.primary_skill ?? ''} onChange={e => setEditForm(f => ({ ...f, primary_skill: e.target.value }))} className="form-input">
                              <option value="">Select...</option>
                              {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Secondary Skill</label>
                            <select value={editForm.secondary_skill ?? ''} onChange={e => setEditForm(f => ({ ...f, secondary_skill: e.target.value }))} className="form-input">
                              <option value="">Select...</option>
                              {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        {/* Toggles */}
                        <div className="flex gap-4 mt-3">
                          {[
                            { key: 'active', label: 'Active' },
                            { key: 'is_captain', label: 'Captain' },
                          ].map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={(editForm as any)[key] ?? false}
                                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.checked }))}
                                className="w-4 h-4 accent-gold" />
                              <span className="font-rajdhani text-sm text-zinc-400">{label}</span>
                            </label>
                          ))}
                        </div>
                        {error && <p className="font-rajdhani text-xs text-red-400 mt-2">{error}</p>}
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => saveEdit(p.id)} disabled={saving}
                            className="font-rajdhani text-xs font-bold bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-1.5 rounded transition-colors">
                            {saving ? 'Saving...' : '✓ Save'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 border border-ink-5 px-4 py-1.5 rounded transition-colors">
                            Cancel
                          </button>
                        </div>

                        {/* Fee exemptions */}
                        <div className="mt-4 border-t border-ink-5 pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-cinzel text-xs text-gold">Fee Exemptions</p>
                            <button onClick={() => setShowExempt(showExempt === p.id ? null : p.id)}
                              className="font-rajdhani text-xs text-gold-dim hover:text-gold transition-colors">
                              {showExempt === p.id ? '✕ Cancel' : '＋ Add Exemption'}
                            </button>
                          </div>

                          {/* Existing exemptions */}
                          {(p.fee_exemptions ?? []).length > 0 && (
                            <div className="space-y-1 mb-3">
                              {p.fee_exemptions!.map(e => {
                                const active = e.start_date <= new Date().toISOString().split('T')[0] && (e.end_date === null || e.end_date >= new Date().toISOString().split('T')[0])
                                return (
                                  <div key={e.id} className={`flex items-center justify-between px-3 py-2 rounded border text-xs font-rajdhani
                                    ${active ? 'bg-amber-950/30 border-amber-800 text-amber-300' : 'bg-ink-4 border-ink-5 text-zinc-600'}`}>
                                    <span>{e.reason} · {e.start_date} → {e.end_date ?? 'ongoing'}{e.notes ? ` · ${e.notes}` : ''}</span>
                                    {active && (
                                      <button onClick={() => endExemption(p.id, e.id)}
                                        className="ml-3 text-zinc-500 hover:text-zinc-300 transition-colors">End</button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Add exemption form */}
                          {showExempt === p.id && (
                            <div className="grid sm:grid-cols-2 gap-3 bg-ink-4 p-3 rounded border border-ink-5">
                              <div>
                                <label className="form-label">Reason</label>
                                <select value={exemptForm.reason} onChange={e => setExemptForm(f => ({ ...f, reason: e.target.value }))} className="form-input">
                                  {EXEMPTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="form-label">Start Date</label>
                                <input type="date" value={exemptForm.start_date} onChange={e => setExemptForm(f => ({ ...f, start_date: e.target.value }))} className="form-input" />
                              </div>
                              <div>
                                <label className="form-label">End Date <span className="text-zinc-600">(leave blank if ongoing)</span></label>
                                <input type="date" value={exemptForm.end_date} onChange={e => setExemptForm(f => ({ ...f, end_date: e.target.value }))} className="form-input" />
                              </div>
                              <div>
                                <label className="form-label">Notes</label>
                                <input type="text" value={exemptForm.notes} onChange={e => setExemptForm(f => ({ ...f, notes: e.target.value }))}
                                  placeholder="e.g. Sponsored by Harsha" className="form-input" />
                              </div>
                              <div className="sm:col-span-2">
                                <button onClick={() => addExemption(p.id)} disabled={saving}
                                  className="font-rajdhani text-xs font-bold bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
                                  {saving ? 'Saving...' : '＋ Add Exemption'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={p.id} className="border-b border-ink-4 hover:bg-ink-4 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-rajdhani font-semibold text-sm text-parchment">{p.name}</p>
                          <p className="font-rajdhani text-xs text-zinc-600">{p.jersey_name ?? ''}{p.jersey_number ? ` #${p.jersey_number}` : ''}</p>
                        </div>
                        {p.is_captain && <span className="font-rajdhani text-[9px] font-bold bg-gold/10 border border-gold-dim text-gold px-1.5 py-0.5 rounded">CAP</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-rajdhani text-xs text-zinc-400">{p.whatsapp ?? '—'}</p>
                      <p className="font-rajdhani text-xs text-zinc-600 truncate max-w-[140px]">{p.gmail_id ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-rajdhani text-xs text-zinc-400 max-w-[120px] truncate">{p.primary_skill ?? '—'}</p>
                      {p.secondary_skill && <p className="font-rajdhani text-xs text-zinc-600 max-w-[120px] truncate">{p.secondary_skill}</p>}
                    </td>
                    <td className="px-4 py-3 font-rajdhani text-xs text-zinc-400">{p.blood_group ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-rajdhani text-xs font-bold ${hasDues ? 'text-amber-400' : 'text-zinc-400'}`}>
                        ₹{p.wallet_balance}
                      </span>
                      {exempt && (
                        <span className="ml-2 font-rajdhani text-[9px] font-bold bg-amber-950 border border-amber-800 text-amber-400 px-1.5 py-0.5 rounded">
                          EXEMPT · {exempt.reason}
                        </span>
                      )}
                      {hasDues && (
                        <button
                          onClick={async () => {
                            const next = !p.dues_override
                            const res = await fetch('/api/players/dues-override', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ player_id: p.id, override: next }),
                            })
                            if (res.ok) {
                              setPlayers(prev => prev.map(x =>
                                x.id === p.id ? { ...x, dues_override: next } : x
                              ))
                            }
                          }}
                          title={p.dues_override ? 'Remove override — player will be blocked from self-updating availability' : 'Allow player to self-update availability despite dues'}
                          className={`mt-1 block font-rajdhani text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                            p.dues_override
                              ? 'bg-green-950/40 border-green-700 text-green-400'
                              : 'bg-amber-950/40 border-amber-700 text-amber-400'
                          }`}>
                          {p.dues_override ? 'Self-update allowed ✓' : 'Allow self-update'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-rajdhani text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-sm border
                        ${p.status === 'expelled' ? 'bg-red-950 border-red-800 text-red-400' :
                          p.active ? 'bg-emerald-950 border-emerald-800 text-emerald-400' :
                          'bg-zinc-900 border-zinc-700 text-zinc-500'}`}>
                        {p.status === 'expelled' ? 'Expelled' : p.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(p)}
                          className="font-rajdhani text-xs text-zinc-600 hover:text-gold border border-ink-5 hover:border-gold-dim px-2 py-1 rounded transition-colors">
                          Edit
                        </button>
                        {p.status !== 'expelled' && (
                          <button onClick={() => expelPlayer(p.id, p.name)}
                            className="font-rajdhani text-xs text-zinc-600 hover:text-red-400 border border-ink-5 hover:border-red-800 px-2 py-1 rounded transition-colors">
                            Expel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
