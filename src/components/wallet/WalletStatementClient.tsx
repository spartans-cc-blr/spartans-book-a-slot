'use client'
// Bank-statement-style paginated wallet view — see features/wallet-ledger.md.
//
// Reused in two places:
//   - /wallet (player's own statement, read-only)
//   - /admin/wallet (admin drilling into any one player's statement,
//     `admin` prop enables inline correction + a quick add-entry form)
//
// Running balance is computed entirely client-side: the server only ever
// returns `current_balance` (the account's live balance) plus a page of
// transactions newest-first — walking that list from the top, each row's
// "balance after" is the previous row's "balance before" (starting from
// current_balance for the very first/most-recent row), so there's nothing
// for the server to keep in sync across pages. Recomputed from scratch on
// every render over the full accumulated list — cheap at this app's scale
// (a club statement, not a high-volume ledger) and avoids any drift bugs
// from trying to carry a running total across "Load older" clicks.

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type Transaction = {
  id: string
  type: 'credit' | 'debit'
  amount: number
  reason: string
  notes: string | null
  created_by: string | null
  created_at: string
  booking_id: string | null
  edited_at: string | null
  edited_by: string | null
}

type OpeningBalance = {
  amount: number
  is_override: boolean
  computed_amount: number
  note: string | null
  set_by: string | null
  set_at: string | null
}

type Cursor = { created_at: string; id: string }

interface WalletStatementClientProps {
  playerId?: string
  admin?: boolean
}

function formatSigned(n: number) {
  return `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function WalletStatementClient({ playerId, admin }: WalletStatementClientProps) {
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [currentBalance, setCurrentBalance] = useState<number | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null)
  const [openingBalance, setOpeningBalance] = useState<OpeningBalance | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ type: 'credit' | 'debit'; amount: string; reason: string; notes: string; created_at: string; edit_reason: string }>({
    type: 'credit', amount: '', reason: '', notes: '', created_at: '', edit_reason: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ type: 'credit' as 'credit' | 'debit', amount: '', reason: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const [openingEditing, setOpeningEditing] = useState(false)
  const [openingForm, setOpeningForm] = useState({ amount: '', note: '' })
  const [openingSaving, setOpeningSaving] = useState(false)
  const [openingError, setOpeningError] = useState('')

  const [showSponsor, setShowSponsor] = useState(false)
  const [sponsorCandidates, setSponsorCandidates] = useState<{ id: string; name: string }[]>([])
  const [sponsorSearch, setSponsorSearch] = useState('')
  const [sponsorBeneficiary, setSponsorBeneficiary] = useState<{ id: string; name: string } | null>(null)
  const [sponsorForm, setSponsorForm] = useState({ amount: '', reason: '' })
  const [sponsorSaving, setSponsorSaving] = useState(false)
  const [sponsorError, setSponsorError] = useState('')

  const fetchPage = useCallback(async (cursor: Cursor | null) => {
    const params = new URLSearchParams()
    if (playerId) params.set('player_id', playerId)
    if (cursor) {
      params.set('cursor_created_at', cursor.created_at)
      params.set('cursor_id', cursor.id)
    }
    const res = await fetch(`/api/wallet/transactions?${params.toString()}`)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'Failed to load statement')
    }
    return res.json()
  }, [playerId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetchPage(null)
      .then(d => {
        if (cancelled) return
        setTransactions(d.transactions ?? [])
        setCurrentBalance(d.current_balance ?? 0)
        setPlayerName(d.player_name ?? null)
        setHasMore(!!d.has_more)
        setNextCursor(d.next_cursor ?? null)
        setOpeningBalance(d.opening_balance ?? null)
      })
      .catch(err => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [fetchPage])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const d = await fetchPage(nextCursor)
      setTransactions(prev => [...prev, ...(d.transactions ?? [])])
      setHasMore(!!d.has_more)
      setNextCursor(d.next_cursor ?? null)
      setOpeningBalance(d.opening_balance ?? null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  function startEdit(t: Transaction) {
    setEditingId(t.id)
    setEditError('')
    setEditForm({
      type: t.type,
      amount: String(t.amount),
      reason: t.reason,
      notes: t.notes ?? '',
      created_at: t.created_at.slice(0, 10),
      edit_reason: '',
    })
  }

  async function saveEdit(id: string) {
    const amount = parseFloat(editForm.amount)
    if (!amount || amount <= 0 || !editForm.reason.trim() || !editForm.edit_reason.trim()) {
      setEditError('Amount, reason, and a reason for the edit are all required.')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch('/api/wallet/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          type: editForm.type,
          amount,
          reason: editForm.reason.trim(),
          notes: editForm.notes.trim() || null,
          created_at: new Date(editForm.created_at + 'T12:00:00').toISOString(),
          edit_reason: editForm.edit_reason.trim(),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setEditError(d.error ?? 'Failed to save correction.')
        return
      }
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...d.transaction } : t))
      if (d.player) setCurrentBalance(d.player.wallet_balance)
      setEditingId(null)
    } finally {
      setEditSaving(false)
    }
  }

  async function submitAdd() {
    const amount = parseFloat(addForm.amount)
    if (!amount || amount <= 0 || !addForm.reason.trim()) {
      setAddError('Amount and reason are required.')
      return
    }
    setAddSaving(true)
    setAddError('')
    try {
      const res = await fetch('/api/wallet/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: playerId,
          type: addForm.type,
          amount,
          reason: addForm.reason.trim(),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setAddError(d.error ?? 'Failed to record transaction.')
        return
      }
      setTransactions(prev => [d.transaction, ...prev])
      setCurrentBalance(d.player.wallet_balance)
      setAddForm({ type: 'credit', amount: '', reason: '' })
      setShowAdd(false)
    } finally {
      setAddSaving(false)
    }
  }

  async function toggleSponsor() {
    const next = !showSponsor
    setShowSponsor(next)
    setSponsorError('')
    if (next && sponsorCandidates.length === 0) {
      const res = await fetch('/api/players')
      if (res.ok) {
        const d = await res.json()
        setSponsorCandidates(
          (d.players ?? [])
            .filter((p: any) => p.id !== playerId)
            .map((p: any) => ({ id: p.id, name: p.name }))
        )
      }
    }
  }

  async function submitSponsor() {
    const amount = parseFloat(sponsorForm.amount)
    if (!sponsorBeneficiary || !amount || amount <= 0 || !sponsorForm.reason.trim()) {
      setSponsorError('Pick a beneficiary, an amount, and a reason.')
      return
    }
    setSponsorSaving(true)
    setSponsorError('')
    try {
      const res = await fetch('/api/wallet/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sponsor_player_id: playerId,
          beneficiary_player_id: sponsorBeneficiary.id,
          amount,
          reason: sponsorForm.reason.trim(),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setSponsorError(d.error ?? 'Failed to record sponsorship.')
        return
      }
      setTransactions(prev => [d.sponsor_transaction, ...prev])
      setCurrentBalance(d.sponsor_player.wallet_balance)
      setSponsorForm({ amount: '', reason: '' })
      setSponsorBeneficiary(null)
      setSponsorSearch('')
      setShowSponsor(false)
    } finally {
      setSponsorSaving(false)
    }
  }

  function startOpeningEdit() {
    setOpeningEditing(true)
    setOpeningError('')
    setOpeningForm({
      amount: openingBalance?.is_override ? String(openingBalance.amount) : '',
      note: openingBalance?.note ?? '',
    })
  }

  async function saveOpeningBalance() {
    if (!playerId) return
    const trimmed = openingForm.amount.trim()
    const amount = trimmed === '' ? null : parseFloat(trimmed)
    if (trimmed !== '' && (amount === null || isNaN(amount))) {
      setOpeningError('Enter a valid amount, or leave blank to reset to the computed default.')
      return
    }
    setOpeningSaving(true)
    setOpeningError('')
    try {
      const res = await fetch('/api/wallet/opening-balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, amount, note: openingForm.note.trim() || undefined }),
      })
      const d = await res.json()
      if (!res.ok) {
        setOpeningError(d.error ?? 'Failed to update opening balance.')
        return
      }
      setOpeningBalance(prev => prev ? {
        ...prev,
        amount: amount != null ? amount : prev.computed_amount,
        is_override: amount != null,
        note: amount != null ? (openingForm.note.trim() || null) : null,
      } : prev)
      setOpeningEditing(false)
    } finally {
      setOpeningSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-14 bg-ink-3 rounded border border-ink-5" />)}
      </div>
    )
  }

  if (error && transactions.length === 0) {
    return <p className="font-rajdhani text-sm text-red-400">{error}</p>
  }

  // Walk the accumulated list newest-first, deriving each row's post-
  // transaction balance from the account's current live balance.
  let carry = currentBalance ?? 0
  const rows = transactions.map(t => {
    const balanceAfter = carry
    const delta = t.type === 'credit' ? Number(t.amount) : -Number(t.amount)
    carry = balanceAfter - delta
    return { ...t, balanceAfter }
  })

  const balanceTone = (currentBalance ?? 0) >= 0 ? 'text-emerald-400' : 'text-amber-400'

  return (
    <div>
      {/* Header — current balance */}
      <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          {playerName && admin && (
            <p className="font-rajdhani text-xs text-zinc-500 mb-1">{playerName}</p>
          )}
          <p className="font-rajdhani text-xs font-bold tracking-wide uppercase text-zinc-500">Current Balance</p>
          <p className={`font-cinzel text-2xl font-bold ${balanceTone}`}>{formatSigned(currentBalance ?? 0)}</p>
        </div>
        {admin && playerId && (
          <div className="flex gap-2">
            <button onClick={() => { setShowAdd(v => !v); setAddError('') }}
              className="font-rajdhani text-xs font-bold tracking-wide bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded transition-colors">
              {showAdd ? '✕ Cancel' : '＋ Add Entry'}
            </button>
            <button onClick={toggleSponsor}
              className="font-rajdhani text-xs font-bold tracking-wide border border-gold-dim text-gold hover:bg-gold/10 px-3 py-1.5 rounded transition-colors">
              {showSponsor ? '✕ Cancel' : '🎁 Sponsor'}
            </button>
          </div>
        )}
      </div>

      {admin && showSponsor && (
        <div className="bg-ink-3 border border-ink-5 rounded p-4 mb-4">
          <p className="font-rajdhani text-xs text-zinc-500 mb-3">
            Debits {playerName ?? 'this player'}'s wallet and credits the beneficiary's by the same amount.
          </p>
          {!sponsorBeneficiary ? (
            <div className="relative">
              <label className="form-label">Beneficiary</label>
              <input value={sponsorSearch} onChange={e => setSponsorSearch(e.target.value)}
                placeholder="Search a player to sponsor..." className="form-input" />
              {sponsorSearch.trim() && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-ink-4 border border-ink-5 rounded shadow-xl max-h-48 overflow-y-auto">
                  {sponsorCandidates
                    .filter(p => p.name.toLowerCase().includes(sponsorSearch.trim().toLowerCase()))
                    .slice(0, 8)
                    .map(p => (
                      <button key={p.id} onClick={() => { setSponsorBeneficiary(p); setSponsorSearch('') }}
                        className="w-full text-left px-3 py-2 font-rajdhani text-sm text-zinc-300 hover:bg-ink-3 hover:text-gold transition-colors">
                        {p.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between mb-3">
              <p className="font-rajdhani text-sm text-parchment">
                Sponsoring <span className="text-gold font-bold">{sponsorBeneficiary.name}</span>
              </p>
              <button onClick={() => setSponsorBeneficiary(null)}
                className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Change
              </button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="form-label">Amount (₹)</label>
              <input type="number" min="0" step="1" value={sponsorForm.amount}
                onChange={e => setSponsorForm(f => ({ ...f, amount: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">Reason</label>
              <input type="text" value={sponsorForm.reason} placeholder="e.g. Q3 membership fee"
                onChange={e => setSponsorForm(f => ({ ...f, reason: e.target.value }))} className="form-input" />
            </div>
          </div>
          {sponsorError && <p className="font-rajdhani text-xs text-red-400 mt-2">{sponsorError}</p>}
          <button onClick={submitSponsor} disabled={sponsorSaving}
            className="mt-3 font-rajdhani text-xs font-bold bg-gold-dim hover:bg-gold disabled:opacity-40 text-ink-2 px-4 py-2 rounded transition-colors">
            {sponsorSaving ? 'Saving...' : '✓ Record Sponsorship & Notify Both'}
          </button>
        </div>
      )}

      {admin && showAdd && (
        <div className="bg-ink-3 border border-ink-5 rounded p-4 mb-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="form-label">Type</label>
              <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value as 'credit' | 'debit' }))} className="form-input">
                <option value="credit">Credit (add)</option>
                <option value="debit">Debit (deduct)</option>
              </select>
            </div>
            <div>
              <label className="form-label">Amount (₹)</label>
              <input type="number" min="0" step="1" value={addForm.amount}
                onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">Reason</label>
              <input type="text" value={addForm.reason} placeholder="e.g. Top-up via UPI"
                onChange={e => setAddForm(f => ({ ...f, reason: e.target.value }))} className="form-input" />
            </div>
          </div>
          {addError && <p className="font-rajdhani text-xs text-red-400 mt-2">{addError}</p>}
          <button onClick={submitAdd} disabled={addSaving}
            className="mt-3 font-rajdhani text-xs font-bold bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
            {addSaving ? 'Saving...' : '✓ Apply & Notify Player'}
          </button>
        </div>
      )}

      {/* Statement rows */}
      <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
        {rows.length === 0 && !openingBalance && (
          <p className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">No transactions yet.</p>
        )}

        {rows.map(t => (
          <div key={t.id} className="border-b border-ink-4 last:border-b-0">
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-rajdhani text-sm text-parchment truncate">
                  {t.reason}
                  {t.edited_at && (
                    <span className="ml-2 font-rajdhani text-[10px] font-bold uppercase tracking-wide text-sky-500 border border-sky-800 rounded px-1.5 py-0.5">
                      edited
                    </span>
                  )}
                </p>
                {t.notes && <p className="font-rajdhani text-xs text-zinc-500 truncate">{t.notes}</p>}
                <p className="font-rajdhani text-[10px] text-zinc-600 mt-0.5">
                  {formatDate(t.created_at)}
                  {t.booking_id && (
                    <>
                      {' · '}
                      <Link href={`/matches/history/${t.booking_id}`}
                        className="text-gold-dim hover:text-gold transition-colors">
                        📊 View Scorecard
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-rajdhani text-sm font-bold ${t.type === 'credit' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {t.type === 'credit' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}
                </p>
                <p className="font-rajdhani text-xs text-zinc-500">Bal {formatSigned(t.balanceAfter)}</p>
              </div>
              {admin && (
                <button onClick={() => editingId === t.id ? setEditingId(null) : startEdit(t)}
                  className="font-rajdhani text-xs text-gold-dim hover:text-gold transition-colors flex-shrink-0">
                  {editingId === t.id ? '✕' : 'Edit'}
                </button>
              )}
            </div>

            {admin && editingId === t.id && (
              <div className="bg-ink-4 mx-4 mb-3 p-3 rounded border border-ink-5">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Type</label>
                    <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value as 'credit' | 'debit' }))} className="form-input">
                      <option value="credit">Credit</option>
                      <option value="debit">Debit</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Amount (₹)</label>
                    <input type="number" min="0" step="1" value={editForm.amount}
                      onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} className="form-input" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="form-label">Reason</label>
                    <input type="text" value={editForm.reason}
                      onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))} className="form-input" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="form-label">Notes</label>
                    <input type="text" value={editForm.notes}
                      onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Date</label>
                    <input type="date" value={editForm.created_at}
                      onChange={e => setEditForm(f => ({ ...f, created_at: e.target.value }))} className="form-input" />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="form-label">Why are you correcting this? *</label>
                  <input type="text" value={editForm.edit_reason} placeholder="e.g. Fixed wrong amount — was 500, should be 250"
                    onChange={e => setEditForm(f => ({ ...f, edit_reason: e.target.value }))} className="form-input" />
                </div>
                {editError && <p className="font-rajdhani text-xs text-red-400 mt-2">{editError}</p>}
                <button onClick={() => saveEdit(t.id)} disabled={editSaving}
                  className="mt-3 font-rajdhani text-xs font-bold bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-1.5 rounded transition-colors">
                  {editSaving ? 'Saving...' : '✓ Save Correction'}
                </button>
              </div>
            )}
          </div>
        ))}

        {!hasMore && openingBalance && (
          <div className="bg-ink-4/60">
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-rajdhani text-sm font-bold text-zinc-400">
                  Brought Forward
                  {openingBalance.is_override && (
                    <span className="ml-2 font-rajdhani text-[10px] font-bold uppercase tracking-wide text-sky-500 border border-sky-800 rounded px-1.5 py-0.5">
                      adjusted
                    </span>
                  )}
                </p>
                <p className="font-rajdhani text-xs text-zinc-600">
                  {openingBalance.is_override
                    ? (openingBalance.note || 'Manually set by an admin')
                    : 'Balance carried over from before this statement began'}
                </p>
              </div>
              <div className="text-right flex-shrink-0 flex items-center gap-3">
                <p className="font-rajdhani text-sm font-bold text-zinc-400">
                  {formatSigned(openingBalance.amount)}
                </p>
                {admin && playerId && (
                  <button onClick={() => openingEditing ? setOpeningEditing(false) : startOpeningEdit()}
                    className="font-rajdhani text-xs text-gold-dim hover:text-gold transition-colors">
                    {openingEditing ? '✕' : 'Adjust'}
                  </button>
                )}
              </div>
            </div>

            {admin && openingEditing && (
              <div className="bg-ink-4 mx-4 mb-3 p-3 rounded border border-ink-5">
                <p className="font-rajdhani text-xs text-zinc-500 mb-2">
                  Computed default: {formatSigned(openingBalance.computed_amount)}. Leave amount blank to reset to this.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Amount (₹)</label>
                    <input type="number" step="1" value={openingForm.amount}
                      placeholder={String(openingBalance.computed_amount)}
                      onChange={e => setOpeningForm(f => ({ ...f, amount: e.target.value }))} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Note</label>
                    <input type="text" value={openingForm.note} placeholder="e.g. Carried over from legacy tracking"
                      onChange={e => setOpeningForm(f => ({ ...f, note: e.target.value }))} className="form-input" />
                  </div>
                </div>
                {openingError && <p className="font-rajdhani text-xs text-red-400 mt-2">{openingError}</p>}
                <button onClick={saveOpeningBalance} disabled={openingSaving}
                  className="mt-3 font-rajdhani text-xs font-bold bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white px-4 py-1.5 rounded transition-colors">
                  {openingSaving ? 'Saving...' : '✓ Save'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && transactions.length > 0 && (
        <p className="font-rajdhani text-xs text-red-400 mt-2">{error}</p>
      )}

      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore}
          className="mt-4 w-full font-rajdhani text-xs font-bold tracking-wide border border-ink-5 hover:border-gold-dim text-zinc-400 hover:text-gold disabled:opacity-40 px-4 py-2.5 rounded transition-colors">
          {loadingMore ? 'Loading...' : 'Load Older Transactions'}
        </button>
      )}
    </div>
  )
}
