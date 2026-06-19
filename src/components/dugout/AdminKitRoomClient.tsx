'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type OrderStatus = 'pending' | 'submitted' | 'delivered' | 'received' | 'cancelled'

type AdminOrder = {
  id: string
  jersey_name: string
  jersey_number: string
  jersey_size: string | null
  jersey_half_sleeve_size: string | null
  jersey_full_sleeve_size: string | null
  tracks_size: string | null
  jersey_name_override: string | null
  jersey_number_override: string | null
  jersey_half_sleeve_qty: number
  jersey_full_sleeve_qty: number
  tracks_qty: number
  notes: string | null
  status: OrderStatus
  created_at: string
  player_name: string
  player_cricheroes_url: string | null
}

type Props = {
  orders: AdminOrder[]
  batchDate: string | null
  isAdmin: boolean
}

type FilterTab = 'all' | OrderStatus

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'pending',   label: 'Pending' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'received',  label: 'Received' },
]

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending:   'bg-amber-50 text-amber-700 border border-amber-200',
  submitted: 'bg-blue-50 text-blue-700 border border-blue-200',
  delivered: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  received:  'bg-stone-100 text-stone-500 border border-stone-200',
  cancelled: 'bg-stone-100 text-stone-400 border border-stone-200',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   'Pending',
  submitted: 'Submitted',
  delivered: 'Delivered',
  received:  'Received',
  cancelled: 'Cancelled',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatSummaryDate(): string {
  const d = new Date()
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCsvDate(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function PlayerLink({ name, cricHeroesUrl }: { name: string; cricHeroesUrl: string | null }) {
  if (cricHeroesUrl) {
    return (
      <a
        href={cricHeroesUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-rajdhani text-sm text-amber-700 font-semibold hover:underline underline-offset-2"
      >
        {name}
      </a>
    )
  }
  return <span className="font-rajdhani text-sm text-stone-700 font-semibold">{name}</span>
}

// Returns size×qty counts accounting for qty field
function sizeCountsWithQty(
  orders: AdminOrder[],
  sizeField: 'jersey_half_sleeve_size' | 'jersey_full_sleeve_size' | 'tracks_size',
  qtyField: 'jersey_half_sleeve_qty' | 'jersey_full_sleeve_qty' | 'tracks_qty'
): { parts: string[]; total: number } {
  const counts: Record<string, number> = {}
  let total = 0
  for (const o of orders) {
    const val = o[sizeField]
    if (val) {
      const qty = o[qtyField] ?? 1
      counts[val] = (counts[val] ?? 0) + qty
      total += qty
    }
  }
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
  const parts = sizes.filter(s => counts[s]).map(s => `${s}×${counts[s]}`)
  return { parts, total }
}

function formatSizeCell(size: string | null, qty: number): string {
  if (!size) return '—'
  return qty > 1 ? `${size} × ${qty}` : size
}

export function AdminKitRoomClient({ orders, batchDate, isAdmin }: Props) {
  const router = useRouter()

  const [activeTab, setActiveTab]               = useState<FilterTab>('all')
  const [batchInput, setBatchInput]             = useState<string>(batchDate ?? '')
  const [savingBatch, setSavingBatch]           = useState(false)
  const [batchError, setBatchError]             = useState<string | null>(null)
  const [actionLoading, setActionLoading]       = useState<string | null>(null)
  const [copied, setCopied]                     = useState(false)
  const [confirmCancelId, setConfirmCancelId]   = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
  () => new Set(orders.filter(o => o.status === 'pending').map(o => o.id))
  )
  const [bulkSubmitting, setBulkSubmitting] = useState(false)

  const filtered = activeTab === 'all'
    ? orders
    : orders.filter(o => o.status === activeTab)

  // Cancelled orders are hidden from admin view entirely
  const visibleOrders = filtered.filter(o => o.status !== 'cancelled')

  const pendingOrders = visibleOrders.filter(o => o.status === 'pending')
  const allPendingSelected = pendingOrders.length > 0 &&
    pendingOrders.every(o => selectedIds.has(o.id))
  const selectedCount = pendingOrders.filter(o => selectedIds.has(o.id)).length

  const actionableOrders = orders.filter(o => o.status === 'pending' || o.status === 'submitted')

  async function handleBatchSave() {
    setSavingBatch(true)
    setBatchError(null)
    try {
      const res = await fetch('/api/dugout/kit-room/batch-date', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_date: batchInput || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setBatchError(d.error ?? 'Failed to save')
        return
      }
      router.refresh()
    } catch {
      setBatchError('Network error')
    } finally {
      setSavingBatch(false)
    }
  }

  async function handleBatchClear() {
    setSavingBatch(true)
    setBatchError(null)
    try {
      const res = await fetch('/api/dugout/kit-room/batch-date', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_date: null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setBatchError(d.error ?? 'Failed to clear')
        return
      }
      setBatchInput('')
      router.refresh()
    } catch {
      setBatchError('Network error')
    } finally {
      setSavingBatch(false)
    }
  }

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    setActionLoading(orderId)
    try {
      const res = await fetch(`/api/dugout/kit-room/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        console.error(d.error ?? 'Failed to update status')
        return
      }
      setConfirmCancelId(null)
      router.refresh()
    } catch {
      console.error('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleBulkSubmit() {
  const toSubmit = pendingOrders.filter(o => selectedIds.has(o.id))
  if (toSubmit.length === 0) return
  setBulkSubmitting(true)
  try {
    await Promise.all(toSubmit.map(o =>
      fetch(`/api/dugout/kit-room/${o.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'submitted' }),
      })
    ))
    setSelectedIds(new Set())
    router.refresh()
  } catch {
    console.error('Bulk submit failed')
  } finally {
    setBulkSubmitting(false)
  }
}

  function toggleSelectAll() {
    if (allPendingSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        pendingOrders.forEach(o => next.delete(o.id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        pendingOrders.forEach(o => next.add(o.id))
        return next
      })
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleDownloadCsv() {
    const header = [
      'S.No', 'Player Name', 'Jersey Name', 'Jersey Number',
      'Half Sleeve', 'Half Qty', 'Full Sleeve', 'Full Qty',
      'Tracks', 'Tracks Qty', 'Notes',
    ]
    const rows = actionableOrders.map((o, i) => [
      String(i + 1),
      o.player_name,
      o.jersey_name_override ?? o.jersey_name,
      o.jersey_number_override ?? o.jersey_number,
      o.jersey_half_sleeve_size ?? '',
      o.jersey_half_sleeve_size ? String(o.jersey_half_sleeve_qty ?? 1) : '',
      o.jersey_full_sleeve_size ?? '',
      o.jersey_full_sleeve_size ? String(o.jersey_full_sleeve_qty ?? 1) : '',
      o.tracks_size ?? '',
      o.tracks_size ? String(o.tracks_qty ?? 1) : '',
      o.notes ?? '',
    ])

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csvContent = [header, ...rows].map(row => row.map(escape).join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spartans-kit-order-${formatCsvDate()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleCopySummary() {
    const half   = sizeCountsWithQty(actionableOrders, 'jersey_half_sleeve_size', 'jersey_half_sleeve_qty')
    const full   = sizeCountsWithQty(actionableOrders, 'jersey_full_sleeve_size', 'jersey_full_sleeve_qty')
    const tracks = sizeCountsWithQty(actionableOrders, 'tracks_size', 'tracks_qty')

    const halfLine   = half.parts.length   > 0 ? `${half.parts.join(', ')} (${half.total} total)`   : 'None'
    const fullLine   = full.parts.length   > 0 ? `${full.parts.join(', ')} (${full.total} total)`   : 'None'
    const tracksLine = tracks.parts.length > 0 ? `${tracks.parts.join(', ')} (${tracks.total} total)` : 'None'

    const text = [
      `Spartans Kit Order — ${formatSummaryDate()}`,
      `Total orders: ${actionableOrders.length}`,
      '',
      'Jerseys:',
      `  Half Sleeve: ${halfLine}`,
      `  Full Sleeve: ${fullLine}`,
      '',
      `Tracks: ${tracksLine}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('Failed to copy')
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Batch date control (admin only) */}
      {isAdmin && (
        <div className="bg-parchment-2 border border-[#D4C9B0] rounded-lg p-4">
          <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-3">
            Next Batch Date
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={batchInput}
              onChange={e => setBatchInput(e.target.value)}
              className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none"
            />
            <button
              onClick={handleBatchSave}
              disabled={savingBatch}
              className="bg-amber-600 hover:bg-amber-700 text-white font-rajdhani font-bold px-4 py-2 rounded text-sm disabled:opacity-60 transition-colors"
            >
              {savingBatch ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleBatchClear}
              disabled={savingBatch}
              className="bg-parchment-3 border border-[#D4C9B0] text-stone-700 font-rajdhani font-bold px-4 py-2 rounded text-sm disabled:opacity-60 hover:bg-[#D4C9B0] transition-colors"
            >
              Clear
            </button>
          </div>
          {batchError && (
            <p className="font-rajdhani text-sm text-red-600 mt-2">{batchError}</p>
          )}
        </div>
      )}

      {/* CSV + Summary + Bulk Submit actions (admin only) */}
      {isAdmin && (
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={handleBulkSubmit}
            disabled={bulkSubmitting || selectedCount === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-rajdhani font-bold px-4 py-2 rounded text-sm disabled:opacity-60 transition-colors"
          >
            {bulkSubmitting ? 'Submitting…' : `Submit Selected (${selectedCount})`}
          </button>
          <button
            onClick={handleDownloadCsv}
            className="bg-parchment-3 border border-[#D4C9B0] text-stone-700 font-rajdhani font-bold px-4 py-2 rounded text-sm hover:bg-[#D4C9B0] transition-colors"
          >
            Download CSV
          </button>
          <button
            onClick={handleCopySummary}
            className="bg-parchment-3 border border-[#D4C9B0] text-stone-700 font-rajdhani font-bold px-4 py-2 rounded text-sm hover:bg-[#D4C9B0] transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Summary'}
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`font-rajdhani font-semibold text-sm px-3 py-1.5 rounded transition-colors ${
              activeTab === tab.key
                ? 'bg-amber-600 text-white'
                : 'bg-parchment-3 text-stone-700 hover:bg-[#D4C9B0]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div className="bg-parchment-2 border border-[#D4C9B0] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="bg-parchment-3">
              {isAdmin && (
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allPendingSelected}
                    onChange={toggleSelectAll}
                    className="rounded accent-amber-600"
                  />
                </th>
              )}
              {['S.No', 'Player', 'Jersey Name', '#', 'Half', 'Full', 'Tracks', 'Notes', 'Status', 'Date', 'Actions']
                .filter(col => isAdmin || col !== 'Actions')
                .map(col =>
                  col === 'Player' ? (
                    <th key={col} className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 px-4 py-3 text-left whitespace-nowrap sticky left-0 bg-parchment-3 z-10">
                      {col}
                    </th>
                  ) : (
                    <th key={col} className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 px-4 py-3 text-left whitespace-nowrap">
                      {col}
                    </th>
                  )
                )
              }
            </tr>
            </thead>
            <tbody>
              {visibleOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 12 : 10}
                    className="font-rajdhani text-stone-500 text-sm px-4 py-6 text-center"
                  >
                    No orders found.
                  </td>
                </tr>
              ) : (
                visibleOrders.map((order, i) => {
                  const isLegacy = order.jersey_size !== null && order.jersey_size !== undefined
                  return (
                    <tr
                      key={order.id}
                      className={`border-t border-[#D4C9B0] ${i % 2 === 1 ? 'bg-parchment' : ''}`}
                    >
                      <td className="px-4 py-3 font-rajdhani text-xs text-stone-400 whitespace-nowrap">
                        {i + 1}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 w-8">
                          {order.status === 'pending' && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(order.id)}
                              onChange={() => toggleSelect(order.id)}
                              className="rounded accent-amber-600"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-parchment z-10 border-r border-[#D4C9B0]">
                        <PlayerLink
                          name={order.player_name}
                          cricHeroesUrl={order.player_cricheroes_url}
                        />
                      </td>
                      <td className="px-4 py-3 font-rajdhani text-sm text-stone-900 whitespace-nowrap">
                        {order.jersey_name_override ?? order.jersey_name}
                      </td>
                      <td className="px-4 py-3 font-rajdhani text-sm text-stone-700 whitespace-nowrap">
                        {order.jersey_number_override ?? order.jersey_number}
                      </td>
                      {isLegacy ? (
                        <td
                          colSpan={3}
                          className="px-4 py-3 font-rajdhani text-sm text-stone-500 whitespace-nowrap"
                        >
                          {order.jersey_size}{' '}
                          <span className="text-stone-400 text-xs">Size†</span>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-rajdhani text-sm text-stone-700 whitespace-nowrap">
                            {formatSizeCell(order.jersey_half_sleeve_size, order.jersey_half_sleeve_qty ?? 1)}
                          </td>
                          <td className="px-4 py-3 font-rajdhani text-sm text-stone-700 whitespace-nowrap">
                            {formatSizeCell(order.jersey_full_sleeve_size, order.jersey_full_sleeve_qty ?? 1)}
                          </td>
                          <td className="px-4 py-3 font-rajdhani text-sm text-stone-700 whitespace-nowrap">
                            {formatSizeCell(order.tracks_size, order.tracks_qty ?? 1)}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 font-rajdhani text-sm text-stone-500 max-w-[180px] truncate">
                        {order.notes ?? '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`font-rajdhani text-xs font-semibold px-2.5 py-0.5 rounded ${STATUS_BADGE[order.status]}`}>
                          {STATUS_LABELS[order.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-rajdhani text-sm text-stone-500 whitespace-nowrap">
                        {formatDate(order.created_at)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1.5">
                            {order.status === 'submitted' && (
                              <button
                                onClick={() => handleStatusChange(order.id, 'delivered')}
                                disabled={actionLoading === order.id}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-rajdhani font-bold text-xs px-3 py-1.5 rounded disabled:opacity-60 transition-colors"
                              >
                                {actionLoading === order.id ? '…' : 'Delivered'}
                              </button>
                            )}
                            {(order.status === 'pending' || order.status === 'submitted') && (
                              confirmCancelId === order.id ? (
                                <span className="font-rajdhani text-xs text-stone-600">
                                  Sure?{' '}
                                  <button onClick={() => handleStatusChange(order.id, 'cancelled')}
                                    disabled={actionLoading === order.id}
                                    className="text-red-600 font-semibold hover:underline disabled:opacity-60">
                                    Yes
                                  </button>
                                  {' '}
                                  <button onClick={() => setConfirmCancelId(null)}
                                    className="text-stone-500 hover:underline">
                                    No
                                  </button>
                                </span>
                              ) : (
                                <button onClick={() => setConfirmCancelId(order.id)}
                                  className="font-rajdhani text-xs text-red-500 hover:underline text-left">
                                  Cancel
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
