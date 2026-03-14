'use client'

import { useState, useEffect } from ‘react’

type Ground = {
id: string
name: string
maps_url: string
hospital_url: string
created_at: string
}

export default function AdminGroundsPage() {
const [grounds,   setGrounds]   = useState<Ground[]>([])
const [loading,   setLoading]   = useState(true)
const [editingId, setEditingId] = useState<string | null>(null)
const [editForm,  setEditForm]  = useState<Partial<Ground>>({})
const [showAdd,   setShowAdd]   = useState(false)
const [addForm,   setAddForm]   = useState({ name: ‘’, maps_url: ‘’, hospital_url: ‘’ })
const [saving,    setSaving]    = useState(false)
const [error,     setError]     = useState(’’)

useEffect(() => {
fetch(’/api/grounds’).then(r => r.json()).then(d => {
setGrounds(d.grounds ?? [])
setLoading(false)
})
}, [])

function startEdit(g: Ground) {
setEditingId(g.id)
setEditForm({ name: g.name, maps_url: g.maps_url, hospital_url: g.hospital_url })
setError(’’)
}

async function saveEdit(id: string) {
setSaving(true)
setError(’’)
const res = await fetch(’/api/grounds’, {
method: ‘PATCH’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify({ id, …editForm }),
})
if (res.ok) {
const d = await res.json()
setGrounds(prev => prev.map(g => g.id === id ? d.ground : g))
setEditingId(null)
} else {
setError(‘Failed to save.’)
}
setSaving(false)
}

async function handleAdd() {
if (!addForm.name.trim() || !addForm.maps_url.trim() || !addForm.hospital_url.trim()) {
setError(‘All three fields are required.’)
return
}
setSaving(true)
setError(’’)
const res = await fetch(’/api/grounds’, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify(addForm),
})
if (res.ok) {
const d = await res.json()
setGrounds(prev => [d.ground, …prev])
setShowAdd(false)
setAddForm({ name: ‘’, maps_url: ‘’, hospital_url: ‘’ })
} else {
setError(‘Failed to add ground.’)
}
setSaving(false)
}

return (
<div>
<div className="mb-6 flex items-center justify-between">
<div>
<h1 className="font-cinzel text-xl font-bold text-gold">Grounds</h1>
<p className="font-rajdhani text-zinc-500 text-sm mt-1">Manage grounds — Google Maps link and nearest hospital link.</p>
</div>
<button onClick={() => { setShowAdd(v => !v); setError(’’) }}
className=“font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark text-white px-3 py-1.5 rounded transition-colors”>
{showAdd ? ‘✕ Cancel’ : ‘＋ Add Ground’}
</button>
</div>

```
  {/* Add form */}
  {showAdd && (
    <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-6 space-y-4">
      <h2 className="font-cinzel text-sm text-gold font-semibold">New Ground</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="form-label">Ground Name <span className="text-crimson">*</span></label>
          <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Chinnaswamy Ground 1" className="form-input" />
        </div>
        <div>
          <label className="form-label">Google Maps URL <span className="text-crimson">*</span></label>
          <input value={addForm.maps_url} onChange={e => setAddForm(f => ({ ...f, maps_url: e.target.value }))}
            placeholder="https://maps.google.com/?q=..." className="form-input" />
          <p className="font-rajdhani text-xs text-zinc-600 mt-1">Open the ground in Google Maps, tap Share → Copy link.</p>
        </div>
        <div>
          <label className="form-label">Nearest Hospital URL <span className="text-crimson">*</span></label>
          <input value={addForm.hospital_url} onChange={e => setAddForm(f => ({ ...f, hospital_url: e.target.value }))}
            placeholder="https://maps.google.com/?q=..." className="form-input" />
          <p className="font-rajdhani text-xs text-zinc-600 mt-1">Search nearest hospital on Google Maps, tap Share → Copy link.</p>
        </div>
      </div>
      {error && <p className="font-rajdhani text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={saving}
          className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
          {saving ? 'Adding...' : '＋ Add Ground'}
        </button>
        {addForm.maps_url && (
          <a href={addForm.maps_url} target="_blank" rel="noopener noreferrer"
            className="font-rajdhani text-xs text-zinc-500 hover:text-gold border border-ink-5 hover:border-gold-dim px-4 py-2 rounded transition-colors">
            Test Maps Link ↗
          </a>
        )}
        {addForm.hospital_url && (
          <a href={addForm.hospital_url} target="_blank" rel="noopener noreferrer"
            className="font-rajdhani text-xs text-zinc-500 hover:text-gold border border-ink-5 hover:border-gold-dim px-4 py-2 rounded transition-colors">
            Test Hospital Link ↗
          </a>
        )}
      </div>
    </div>
  )}

  {/* Table */}
  <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-ink-5 bg-ink-4">
            {['Ground', 'Maps Link', 'Hospital Link', ''].map(h => (
              <th key={h} className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={4} className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">Loading...</td></tr>
          )}
          {!loading && grounds.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">No grounds added yet.</td></tr>
          )}
          {grounds.map(g => (
            <tr key={g.id} className="border-b border-ink-4 hover:bg-ink-4 transition-colors">
              {editingId === g.id ? (
                <td colSpan={4} className="px-4 py-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="form-label">Ground Name</label>
                      <input value={editForm.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Google Maps URL</label>
                      <input value={editForm.maps_url ?? ''} onChange={e => setEditForm(f => ({ ...f, maps_url: e.target.value }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Nearest Hospital URL</label>
                      <input value={editForm.hospital_url ?? ''} onChange={e => setEditForm(f => ({ ...f, hospital_url: e.target.value }))} className="form-input" />
                    </div>
                  </div>
                  {error && <p className="font-rajdhani text-xs text-red-400 mt-2">{error}</p>}
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => saveEdit(g.id)} disabled={saving}
                      className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-1.5 rounded transition-colors">
                      {saving ? 'Saving...' : '✓ Save'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 border border-ink-5 px-4 py-1.5 rounded transition-colors">
                      Cancel
                    </button>
                    {editForm.maps_url && (
                      <a href={editForm.maps_url} target="_blank" rel="noopener noreferrer"
                        className="font-rajdhani text-xs text-zinc-500 hover:text-gold border border-ink-5 hover:border-gold-dim px-3 py-1.5 rounded transition-colors">
                        Test Maps ↗
                      </a>
                    )}
                    {editForm.hospital_url && (
                      <a href={editForm.hospital_url} target="_blank" rel="noopener noreferrer"
                        className="font-rajdhani text-xs text-zinc-500 hover:text-gold border border-ink-5 hover:border-gold-dim px-3 py-1.5 rounded transition-colors">
                        Test Hospital ↗
                      </a>
                    )}
                  </div>
                </td>
              ) : (
                <>
                  <td className="px-4 py-3 font-rajdhani font-semibold text-sm text-parchment">{g.name}</td>
                  <td className="px-4 py-3">
                    <a href={g.maps_url} target="_blank" rel="noopener noreferrer"
                      className="font-rajdhani text-xs text-emerald-500 hover:text-emerald-400 hover:underline">
                      📍 Open Maps ↗
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <a href={g.hospital_url} target="_blank" rel="noopener noreferrer"
                      className="font-rajdhani text-xs text-red-400 hover:text-red-300 hover:underline">
                      🏥 Open Hospital ↗
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => startEdit(g)}
                      className="font-rajdhani text-xs text-zinc-600 hover:text-gold border border-ink-5 hover:border-gold-dim px-2 py-1 rounded transition-colors">
                      Edit
                    </button>
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
```

)
}