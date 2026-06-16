'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type OrderStatus = 'pending' | 'submitted' | 'delivered' | 'received'

type AdminOrder = {
  id: string
  jersey_name: string
  jersey_number: number
  jersey_size: string
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
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   'Pending',
  submitted: 'Submitted',
  delivered: 'Delivered',
  received:  'Received',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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

export function AdminKitRoomClient({ orders, batchDate, isAdmin }: Props) {
  const router = useRouter()

  const [activeTab, setActiveTab]       = useState<FilterTab>('all')
  const [batchInput, setBatchInput]     = useState<string>(batchDate ?? '')
  const [savingBatch, setSavingBatch]   = useState(false)
  const [batchError, setBatchError]     = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const filtered = activeTab === 'all'
    ? orders
    : orders.filter(o => o.status === activeTab)

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
      router.refresh()
    } catch {
      console.error('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Section A — Batch date control (admin only) */}
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

      {/* Section B — Filter tabs */}
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

      {/* Section C — Orders table */}
      <div className="bg-parchment-2 border border-[#D4C9B0] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-parchment-3">
                {['Player', 'Jersey Name', '#', 'Size', 'Notes', 'Status', 'Date', ...(isAdmin ? ['Actions'] : [])].map(col => (
                  <th
                    key={col}
                    className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 px-4 py-3 text-left whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 8 : 7}
                    className="font-rajdhani text-stone-500 text-sm px-4 py-6 text-center"
                  >
                    No orders found.
                  </td>
                </tr>
              ) : (
                filtered.map((order, i) => (
                  <tr
                    key={order.id}
                    className={`border-t border-[#D4C9B0] ${i % 2 === 1 ? 'bg-parchment' : ''}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <PlayerLink
                        name={order.player_name}
                        cricHeroesUrl={order.player_cricheroes_url}
                      />
                    </td>
                    <td className="px-4 py-3 font-rajdhani text-sm text-stone-900 whitespace-nowrap">
                      {order.jersey_name}
                    </td>
                    <td className="px-4 py-3 font-rajdhani text-sm text-stone-700 whitespace-nowrap">
                      {order.jersey_number}
                    </td>
                    <td className="px-4 py-3 font-rajdhani text-sm text-stone-700 whitespace-nowrap">
                      {order.jersey_size}
                    </td>
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
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'submitted')}
                            disabled={actionLoading === order.id}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-rajdhani font-bold text-xs px-3 py-1.5 rounded disabled:opacity-60 transition-colors"
                          >
                            {actionLoading === order.id ? '…' : 'Submit'}
                          </button>
                        )}
                        {order.status === 'submitted' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'delivered')}
                            disabled={actionLoading === order.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-rajdhani font-bold text-xs px-3 py-1.5 rounded disabled:opacity-60 transition-colors"
                          >
                            {actionLoading === order.id ? '…' : 'Delivered'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
