'use client'
// /admin/records — admin-only inbox of club records broken by freshly-synced
// scorecards. For each one the admin chooses: share to the club WhatsApp group
// (opens a pre-filled wa.me message and marks it shared) or ignore. Nothing is
// ever shown to players unless the admin shares it. See
// .claude/rules/features/record-breaking.md.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Status = 'pending' | 'shared' | 'ignored'
type BookEntry = {
  format: string; scopeKey: string; scopeLabel: string; year: string | null
  recordKey: string; title: string; holder: string; display: string
  bookingId: string; gameDate: string; opponentName: string; entries: number; armed: boolean
}
type RecordBreakRow = {
  id: string; booking_id: string; title: string; scope_label: string
  holder: string; display: string; prev_holder: string | null; prev_display: string | null
  game_date: string; opponent_name: string | null; message: string; status: Status
}

const TABS: { key: Status; label: string }[] = [
  { key: 'pending', label: 'To review' },
  { key: 'shared', label: 'Shared' },
  { key: 'ignored', label: 'Ignored' },
]

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminRecordsPage() {
  const [rows, setRows] = useState<RecordBreakRow[]>([])
  const [tab, setTab] = useState<Status | 'book'>('pending')
  const [book, setBook] = useState<BookEntry[] | null>(null)
  const [bookLoading, setBookLoading] = useState(false)
  const [bookFmt, setBookFmt] = useState<'T20' | 'T30'>('T20')
  const [bookScope, setBookScope] = useState<string>('alltime')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/record-breaks')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load')
      setRows(json.breaks ?? [])
      setError(null)
    } catch (e: any) {
      setError(e.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (tab !== 'book' || book) return
    setBookLoading(true)
    fetch('/api/admin/record-book')
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Failed to load'); setBook(j.records ?? []) })
      .catch(e => setError(e.message ?? 'Failed to load records'))
      .finally(() => setBookLoading(false))
  }, [tab, book])

  async function decide(id: string, status: Status) {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/record-breaks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      setRows(rs => rs.map(r => (r.id === id ? { ...r, status } : r)))
      setError(null)
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setBusy(null)
    }
  }

  function share(r: RecordBreakRow) {
    // Destination-free wa.me link: admin picks the club group in WhatsApp.
    window.open(`https://wa.me/?text=${encodeURIComponent(r.message)}`, '_blank', 'noopener,noreferrer')
    decide(r.id, 'shared')
  }

  async function copy(r: RecordBreakRow) {
    try {
      await navigator.clipboard.writeText(r.message)
      setCopied(r.id)
      setTimeout(() => setCopied(c => (c === r.id ? null : c)), 2000)
    } catch { /* clipboard blocked — the WhatsApp button still works */ }
  }

  const counts: Record<Status, number> = { pending: 0, shared: 0, ignored: 0 }
  for (const r of rows) counts[r.status] += 1
  const visible = tab === 'book' ? [] : rows.filter(r => r.status === tab)
  const bookYears = Array.from(new Set((book ?? []).filter(b => b.format === bookFmt && b.year).map(b => b.year as string))).sort().reverse()
  const bookRows = (book ?? []).filter(b => b.format === bookFmt && (bookScope === 'alltime' ? b.year === null : b.year === bookScope))
  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-full font-rajdhani text-xs font-bold tracking-wide border ${
      active
        ? 'bg-amber-600 text-white border-amber-600 dark:bg-gold dark:text-ink dark:border-gold'
        : 'bg-white text-[#44403C] border-[#D4C9B0] dark:bg-ink-3 dark:text-zinc-400 dark:border-ink-5'
    }`

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h1 className="font-cinzel text-xl font-bold text-amber-700 dark:text-gold">Records</h1>
        <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500 mt-1">
          Club records broken by a newly synced scorecard. Only you see these — share the ones worth
          celebrating to the club WhatsApp group, ignore the rest.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={pill(tab === t.key)}>
            {t.label} ({counts[t.key]})
          </button>
        ))}
        <button onClick={() => setTab('book')} className={pill(tab === 'book')}>Current records</button>
      </div>

      {error && <p className="font-rajdhani text-sm text-red-700 dark:text-red-400 mb-3">{error}</p>}
      {tab === 'book' && (
        <div className="mb-4">
          <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mb-3">
            Every standing record — this is the baseline each new scorecard is checked against. A record only
            alerts once its scope has at least 5 earlier entries; ones with fewer show as &ldquo;not armed&rdquo;.
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            {(['T20', 'T30'] as const).map(f => (
              <button key={f} onClick={() => { setBookFmt(f); setBookScope('alltime') }} className={pill(bookFmt === f)}>{f}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => setBookScope('alltime')} className={pill(bookScope === 'alltime')}>All-time</button>
            {bookYears.map(y => (
              <button key={y} onClick={() => setBookScope(y)} className={pill(bookScope === y)}>{y}</button>
            ))}
          </div>
          {bookLoading && <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500">Computing records…</p>}
          {!bookLoading && book && bookRows.length === 0 && (
            <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500">No records in this scope yet.</p>
          )}
          <div className="space-y-2">
            {bookRows.map(b => (
              <div key={b.scopeKey + b.recordKey} className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-cinzel text-sm font-bold text-[#1C1917] dark:text-parchment">{b.title}</p>
                  <p className="font-cinzel text-base font-bold text-amber-700 dark:text-gold whitespace-nowrap">{b.display}</p>
                </div>
                <p className="font-rajdhani text-sm text-[#44403C] dark:text-zinc-300">{b.holder}</p>
                <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">
                  vs {b.opponentName} · {formatDate(b.gameDate)} ·{' '}
                  <Link href={`/matches/history/${b.bookingId}`} className="underline hover:text-amber-700 dark:hover:text-gold">scorecard</Link>
                  {' · '}{b.entries} {b.entries === 1 ? 'entry' : 'entries'}
                  {!b.armed && <span className="ml-1 text-amber-700 dark:text-amber-400 font-bold">· not armed yet</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {loading && <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500">Loading…</p>}
      {!loading && tab !== 'book' && visible.length === 0 && (
        <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500">
          {tab === 'pending' ? 'Nothing to review. You’ll get a push when a record is broken.' : 'Nothing here yet.'}
        </p>
      )}

      <div className="space-y-3">
        {visible.map(r => (
          <div key={r.id} className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500">
                  {r.scope_label}
                </p>
                <p className="font-cinzel text-base font-bold text-[#1C1917] dark:text-parchment">🏆 {r.title}</p>
              </div>
              <p className="font-cinzel text-lg font-bold text-amber-700 dark:text-gold whitespace-nowrap">{r.display}</p>
            </div>
            <p className="font-rajdhani text-sm text-[#44403C] dark:text-zinc-300 mt-1">{r.holder}</p>
            <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mt-1">
              {r.prev_display ? `Beat ${r.prev_display}${r.prev_holder ? ` (${r.prev_holder})` : ''} · ` : ''}
              vs {r.opponent_name ?? 'opponent'} · {formatDate(r.game_date)} ·{' '}
              <Link href={`/matches/history/${r.booking_id}`} className="underline hover:text-amber-700 dark:hover:text-gold">scorecard</Link>
            </p>

            <details className="mt-2">
              <summary className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 cursor-pointer">Preview message</summary>
              <pre className="mt-1 whitespace-pre-wrap font-rajdhani text-xs bg-parchment-2 dark:bg-ink-4 border border-[#D4C9B0] dark:border-ink-5 rounded p-2 text-[#1C1917] dark:text-zinc-200">{r.message}</pre>
            </details>

            <div className="flex flex-wrap gap-2 mt-3">
              {r.status !== 'shared' && (
                <button
                  disabled={busy === r.id}
                  onClick={() => share(r)}
                  className="px-3 py-1.5 rounded font-rajdhani text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  📲 Share on WhatsApp
                </button>
              )}
              <button
                onClick={() => copy(r)}
                className="px-3 py-1.5 rounded font-rajdhani text-xs font-bold border border-[#D4C9B0] dark:border-ink-5 text-[#44403C] dark:text-zinc-300"
              >
                {copied === r.id ? 'Copied ✓' : 'Copy text'}
              </button>
              {r.status === 'pending' && (
                <button
                  disabled={busy === r.id}
                  onClick={() => decide(r.id, 'ignored')}
                  className="px-3 py-1.5 rounded font-rajdhani text-xs font-bold border border-[#D4C9B0] dark:border-ink-5 text-[#78716C] dark:text-zinc-400 disabled:opacity-50"
                >
                  Ignore
                </button>
              )}
              {r.status !== 'pending' && (
                <button
                  disabled={busy === r.id}
                  onClick={() => decide(r.id, 'pending')}
                  className="px-3 py-1.5 rounded font-rajdhani text-xs font-bold border border-[#D4C9B0] dark:border-ink-5 text-[#78716C] dark:text-zinc-400 disabled:opacity-50"
                >
                  Move back to review
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
