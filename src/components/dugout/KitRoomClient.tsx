'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type OrderStatus = 'pending' | 'submitted' | 'delivered' | 'received'

type Order = {
  id: string
  jersey_name: string
  jersey_number: number
  jersey_size: string
  notes: string | null
  status: OrderStatus
  created_at: string
}

type Props = {
  orders: Order[]
  batchDate: string | null
  jerseyName: string | null
  jerseyNumber: number | null
  isExpelled: boolean
}

const JERSEY_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   'Pending',
  submitted: 'Submitted',
  delivered: 'Delivered',
  received:  'Received',
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending:   'bg-amber-50 text-amber-700 border border-amber-200',
  submitted: 'bg-blue-50 text-blue-700 border border-blue-200',
  delivered: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  received:  'bg-stone-100 text-stone-500 border border-stone-200',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function KitRoomClient({ orders, batchDate, jerseyName, jerseyNumber, isExpelled }: Props) {
  const router = useRouter()

  const [size, setSize]               = useState<string>('M')
  const [notes, setNotes]             = useState<string>('')
  const [submitting, setSubmitting]   = useState(false)
  const [formError, setFormError]     = useState<string | null>(null)
  const [marking, setMarking]         = useState(false)
  const [pastOpen, setPastOpen]       = useState(false)

  const activeOrder = orders.find(o =>
    o.status === 'pending' || o.status === 'submitted' || o.status === 'delivered'
  ) ?? null

  const pastOrders = orders.filter(o => o.status === 'received')

  async function handleMarkReceived(orderId: string) {
    setMarking(true)
    try {
      const res = await fetch(`/api/dugout/kit-room/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'received' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        console.error(d.error ?? 'Failed to mark as received')
        return
      }
      router.refresh()
    } catch {
      console.error('Network error')
    } finally {
      setMarking(false)
    }
  }

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/dugout/kit-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jersey_size: size, notes: notes.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setFormError(d.error ?? 'Failed to place order')
        return
      }
      router.refresh()
    } catch {
      setFormError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Section A — Batch date notice */}
      {batchDate && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 font-rajdhani text-sm rounded px-4 py-2">
          Next order tentatively submits around {formatDate(batchDate)}
        </div>
      )}

      {/* Expelled message */}
      {isExpelled && (
        <div className="bg-parchment-2 border border-[#D4C9B0] rounded-lg p-4">
          <p className="font-rajdhani text-stone-700 text-sm">
            Your account is suspended. You cannot place kit orders.
          </p>
        </div>
      )}

      {/* Section B — Active order status card */}
      {activeOrder && (
        <div className="bg-parchment-2 border border-[#D4C9B0] rounded-lg p-4 flex flex-col gap-3">
          <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
            Your Current Order
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="font-cinzel font-bold text-lg text-stone-900">
                {activeOrder.jersey_name}
              </span>
              <span className="font-rajdhani text-stone-500 text-sm">
                #{activeOrder.jersey_number}
              </span>
            </div>
            <p className="font-rajdhani text-stone-700 text-sm">
              Size: <span className="font-semibold">{activeOrder.jersey_size}</span>
            </p>
            {activeOrder.notes && (
              <p className="font-rajdhani text-stone-500 text-sm">
                Notes: {activeOrder.notes}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <span className={`font-rajdhani text-xs font-semibold px-2.5 py-0.5 rounded ${STATUS_BADGE[activeOrder.status]}`}>
              {STATUS_LABELS[activeOrder.status]}
            </span>
            {activeOrder.status === 'delivered' && (
              <button
                onClick={() => handleMarkReceived(activeOrder.id)}
                disabled={marking}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-rajdhani font-bold px-6 py-2 rounded disabled:opacity-60 transition-colors"
              >
                {marking ? 'Updating…' : 'Mark as Received'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Section C — Place new order form */}
      {!isExpelled && !activeOrder && (
        <>
          {(!jerseyName || jerseyNumber === null || jerseyNumber === undefined) ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="font-rajdhani text-stone-700 text-sm">
                Complete your jersey details on your profile before placing an order.{' '}
                <a href="/profile" className="text-amber-600 font-semibold hover:text-amber-700">
                  Go to profile
                </a>
              </p>
            </div>
          ) : (
            <div className="bg-parchment-2 border border-[#D4C9B0] rounded-lg p-4">
              <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 mb-4">
                Place a Kit Order
              </p>
              <form onSubmit={handleSubmitOrder} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">Jersey Name</span>
                  <span className="font-rajdhani text-stone-900 text-sm font-semibold">{jerseyName}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">Jersey Number</span>
                  <span className="font-rajdhani text-stone-900 text-sm font-semibold">#{jerseyNumber}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
                    Jersey Size
                  </label>
                  <select
                    value={size}
                    onChange={e => setSize(e.target.value)}
                    className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none"
                  >
                    {JERSEY_SIZES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
                    Notes <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Any special requests…"
                    className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none resize-none placeholder:text-stone-400"
                  />
                </div>
                {formError && (
                  <p className="font-rajdhani text-sm text-red-600">{formError}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="self-start bg-amber-600 hover:bg-amber-700 text-white font-rajdhani font-bold px-6 py-2 rounded disabled:opacity-60 transition-colors"
                >
                  {submitting ? 'Placing Order…' : 'Place Order'}
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {/* Section D — Past orders */}
      {pastOrders.length > 0 && (
        <div>
          <button
            onClick={() => setPastOpen(v => !v)}
            className="text-amber-600 text-sm font-rajdhani hover:text-amber-700 transition-colors"
          >
            {pastOpen ? 'Hide past orders' : `View past orders (${pastOrders.length})`}
          </button>
          {pastOpen && (
            <div className="mt-3 flex flex-col gap-1.5">
              {pastOrders.map(o => (
                <p key={o.id} className="text-stone-500 font-rajdhani text-sm">
                  {o.jersey_name} · #{o.jersey_number} · {o.jersey_size} · {formatDate(o.created_at)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
