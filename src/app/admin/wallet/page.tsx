'use client'
// /admin/wallet — the single hub for everything money-related that used to
// require bouncing between /admin/players (top-up a wallet) and hunting
// through /admin/bookings/[id] one match at a time (apply fees). See
// features/wallet-ledger.md.
//
// Three sections, most-actionable first:
//   1. Pending Fee Applications — every booking whose scorecard has synced
//      with a fee configured and a squad announced, but no fee applied yet
//      (reuses the same resolver the fee-reminder push/modal already use —
//      see src/lib/feeReminders.ts). Each row still links out to
//      /admin/bookings/[id] to actually apply the fee — that flow has real
//      per-player unit-override complexity that belongs on the booking
//      page, not duplicated here. This section just means an admin no
//      longer has to remember which matches need it or go looking.
//   2. Player Wallet — search any player, see (and correct) their full
//      statement, or record a quick top-up/debit — all via the same
//      WalletStatementClient the player-facing /wallet page uses, just
//      with `admin` turned on.
//   3. Recent Transactions (club-wide) — a live feed across every player.
//      Clicking a row selects that player into section 2 rather than
//      duplicating the edit UI a second time here.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { WalletStatementClient } from '@/components/wallet/WalletStatementClient'

type PlayerOption = { id: string; name: string; wallet_balance: number }

type PendingFeeBooking = {
  booking_id: string
  game_date: string
  slot_time: string
  opponent_name: string | null
  tournament_name: string | null
  fee: number
  squad_count: number
}

type LedgerRow = {
  id: string
  player_id: string
  player_name: string | null
  type: 'credit' | 'debit'
  amount: number
  reason: string
  notes: string | null
  created_at: string
  booking_id: string | null
  edited_at: string | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function AdminWalletPage() {
  const [players, setPlayers] = useState<PlayerOption[]>([])
  const [search, setSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerOption | null>(null)

  const [pending, setPending] = useState<PendingFeeBooking[] | null>(null)

  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [ledgerCursor, setLedgerCursor] = useState<{ created_at: string; id: string } | null>(null)
  const [ledgerHasMore, setLedgerHasMore] = useState(true)
  const [ledgerLoading, setLedgerLoading] = useState(true)
  const [ledgerLoadingMore, setLedgerLoadingMore] = useState(false)

  useEffect(() => {
    fetch('/api/players').then(r => r.json()).then(d => setPlayers(
      (d.players ?? []).map((p: any) => ({ id: p.id, name: p.name, wallet_balance: p.wallet_balance }))
    ))
    fetch('/api/admin/fee-reminders').then(r => r.json()).then(d => setPending(d.bookings ?? []))
    loadLedger(null)
  }, [])

  async function loadLedger(cursor: { created_at: string; id: string } | null) {
    if (cursor) setLedgerLoadingMore(true); else setLedgerLoading(true)
    const params = new URLSearchParams({ scope: 'all' })
    if (cursor) { params.set('cursor_created_at', cursor.created_at); params.set('cursor_id', cursor.id) }
    const res = await fetch(`/api/wallet/transactions?${params.toString()}`)
    if (res.ok) {
      const d = await res.json()
      setLedger(prev => cursor ? [...prev, ...(d.transactions ?? [])] : (d.transactions ?? []))
      setLedgerHasMore(!!d.has_more)
      setLedgerCursor(d.next_cursor ?? null)
    }
    setLedgerLoading(false)
    setLedgerLoadingMore(false)
  }

  function selectPlayer(p: PlayerOption) {
    setSelectedPlayer(p)
    setSearch('')
  }

  const filtered = search.trim()
    ? players.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : []

  return (
    <div>
      <h1 className="font-cinzel text-xl font-bold text-gold mb-1">Wallet</h1>
      <p className="font-rajdhani text-zinc-500 text-sm mb-6">
        Player payments, match fee debits, and corrections — all in one place.
      </p>

      {/* ── Pending Fee Applications ── */}
      <section className="mb-8">
        <h2 className="font-cinzel text-sm text-gold font-semibold mb-3">
          ⚠ Pending Fee Applications {pending && pending.length > 0 && `(${pending.length})`}
        </h2>
        {pending === null && (
          <p className="font-rajdhani text-sm text-zinc-600">Loading...</p>
        )}
        {pending?.length === 0 && (
          <p className="font-rajdhani text-sm text-zinc-600">Nothing pending — every synced match's fees are applied or not applicable.</p>
        )}
        {pending && pending.length > 0 && (
          <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden divide-y divide-ink-4">
            {pending.map(b => (
              <Link key={b.booking_id} href={`/admin/bookings/${b.booking_id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-4 transition-colors">
                <div className="min-w-0">
                  <p className="font-rajdhani text-sm text-parchment truncate">
                    vs {b.opponent_name ?? 'TBD'} {b.tournament_name ? `· ${b.tournament_name}` : ''}
                  </p>
                  <p className="font-rajdhani text-xs text-zinc-500">
                    {formatDate(b.game_date)} · {b.slot_time} · {b.squad_count} in squad
                  </p>
                </div>
                <span className="font-rajdhani text-sm font-bold text-amber-400 flex-shrink-0">₹{b.fee} →</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Player Wallet — search, view/correct statement, quick top-up ── */}
      <section className="mb-8">
        <h2 className="font-cinzel text-sm text-gold font-semibold mb-3">Player Wallet</h2>

        {!selectedPlayer ? (
          <div className="relative max-w-sm">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search a player by name..."
              className="form-input" />
            {filtered.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-ink-3 border border-ink-5 rounded shadow-xl overflow-hidden">
                {filtered.map(p => (
                  <button key={p.id} onClick={() => selectPlayer(p)}
                    className="w-full text-left px-4 py-2.5 font-rajdhani text-sm text-zinc-300 hover:bg-ink-4 hover:text-gold transition-colors flex items-center justify-between">
                    <span>{p.name}</span>
                    <span className={p.wallet_balance < 0 ? 'text-amber-400' : 'text-zinc-500'}>₹{p.wallet_balance}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <button onClick={() => setSelectedPlayer(null)}
              className="font-rajdhani text-xs text-gold-dim hover:text-gold mb-3 transition-colors">
              ← Search a different player
            </button>
            <WalletStatementClient playerId={selectedPlayer.id} admin />
          </div>
        )}
      </section>

      {/* ── Club-wide Recent Transactions ── */}
      <section>
        <h2 className="font-cinzel text-sm text-gold font-semibold mb-3">Recent Transactions</h2>
        {ledgerLoading && <p className="font-rajdhani text-sm text-zinc-600">Loading...</p>}
        {!ledgerLoading && ledger.length === 0 && (
          <p className="font-rajdhani text-sm text-zinc-600">No transactions recorded yet.</p>
        )}
        {ledger.length > 0 && (
          <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden divide-y divide-ink-4">
            {ledger.map(t => {
              const player = players.find(p => p.id === t.player_id)
              return (
                <div key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => player ? selectPlayer(player) : setSelectedPlayer({ id: t.player_id, name: t.player_name ?? 'Unknown', wallet_balance: 0 })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      player ? selectPlayer(player) : setSelectedPlayer({ id: t.player_id, name: t.player_name ?? 'Unknown', wallet_balance: 0 })
                    }
                  }}
                  className="w-full text-left flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-4 transition-colors cursor-pointer">
                  <div className="min-w-0">
                    <p className="font-rajdhani text-sm text-parchment truncate">
                      {t.player_name ?? 'Unknown'} <span className="text-zinc-500">· {t.reason}</span>
                      {t.edited_at && (
                        <span className="ml-2 font-rajdhani text-[10px] font-bold uppercase tracking-wide text-sky-500 border border-sky-800 rounded px-1.5 py-0.5">
                          edited
                        </span>
                      )}
                    </p>
                    <p className="font-rajdhani text-xs text-zinc-600">
                      {formatDate(t.created_at)}
                      {t.booking_id && (
                        <>
                          {' · '}
                          <Link href={`/matches/history/${t.booking_id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-gold-dim hover:text-gold transition-colors">
                            📊 View Scorecard
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span className={`font-rajdhani text-sm font-bold flex-shrink-0 ${t.type === 'credit' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {t.type === 'credit' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {ledgerHasMore && (
          <button onClick={() => loadLedger(ledgerCursor)} disabled={ledgerLoadingMore}
            className="mt-3 w-full font-rajdhani text-xs font-bold tracking-wide border border-ink-5 hover:border-gold-dim text-zinc-400 hover:text-gold disabled:opacity-40 px-4 py-2.5 rounded transition-colors">
            {ledgerLoadingMore ? 'Loading...' : 'Load Older Transactions'}
          </button>
        )}
      </section>
    </div>
  )
}
