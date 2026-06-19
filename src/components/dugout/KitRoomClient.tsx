'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type OrderStatus = 'pending' | 'submitted' | 'delivered' | 'received' | 'cancelled'

type Order = {
  id: string
  jersey_name: string
  jersey_number: string
  jersey_size: string | null
  jersey_half_sleeve_size: string | null
  jersey_full_sleeve_size: string | null
  tracks_size: string | null
  jersey_name_override: string | null
  notes: string | null
  status: OrderStatus
  created_at: string
}

type Props = {
  orders: Order[]
  batchDate: string | null
  jerseyName: string | null
  jerseyNumber: string | null
  isExpelled: boolean
}

const JERSEY_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   'Pending',
  submitted: 'Submitted',
  delivered: 'Delivered',
  received:  'Received',
  cancelled: 'Cancelled',
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending:   'bg-amber-50 text-amber-700 border border-amber-200',
  submitted: 'bg-blue-50 text-blue-700 border border-blue-200',
  delivered: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  received:  'bg-stone-100 text-stone-500 border border-stone-200',
  cancelled: 'bg-stone-100 text-stone-400 border border-stone-200',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function OrderItems({ order }: { order: Order }) {
  const isLegacy = order.jersey_size !== null && order.jersey_size !== undefined

  if (isLegacy) {
    return (
      <p className="font-rajdhani text-stone-700 text-sm">
        Jersey: <span className="font-semibold">{order.jersey_size}</span>{' '}
        <span className="text-stone-400">(legacy)</span>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {order.jersey_half_sleeve_size && (
        <p className="font-rajdhani text-stone-700 text-sm">
          Half Sleeve: <span className="font-semibold">{order.jersey_half_sleeve_size}</span>
        </p>
      )}
      {order.jersey_full_sleeve_size && (
        <p className="font-rajdhani text-stone-700 text-sm">
          Full Sleeve: <span className="font-semibold">{order.jersey_full_sleeve_size}</span>
        </p>
      )}
      {order.tracks_size && (
        <p className="font-rajdhani text-stone-700 text-sm">
          Tracks: <span className="font-semibold">{order.tracks_size}</span>
        </p>
      )}
    </div>
  )
}

export function KitRoomClient({ orders, batchDate, jerseyName, jerseyNumber, isExpelled }: Props) {
  const router = useRouter()

  const [nameInput, setNameInput]         = useState<string>(jerseyName ?? '')
  const [updateProfileName, setUpdateProfileName] = useState(false)

  const [halfSleeve, setHalfSleeve]       = useState(false)
  const [fullSleeve, setFullSleeve]       = useState(false)
  const [sleeveSize, setSleeveSize]       = useState<string>('M')

  const [addTracks, setAddTracks]         = useState(false)
  const [tracksSize, setTracksSize]       = useState<string>('M')

  const [notes, setNotes]                 = useState<string>('')
  const [submitting, setSubmitting]       = useState(false)
  const [formError, setFormError]         = useState<string | null>(null)
  const [marking, setMarking]             = useState(false)
  const [pastOpen, setPastOpen]           = useState(false)
  const [cancelledOpen, setCancelledOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  // Edit mode state
  const [editMode, setEditMode]               = useState(false)
  const [editHalf, setEditHalf]               = useState(false)
  const [editFull, setEditFull]               = useState(false)
  const [editTracks, setEditTracks]           = useState(false)
  const [editSleeveSize, setEditSleeveSize]   = useState('M')
  const [editTracksSize, setEditTracksSize]   = useState('M')
  const [editName, setEditName]               = useState('')
  const [editUpdateProfile, setEditUpdateProfile] = useState(false)
  const [editNotes, setEditNotes]             = useState('')
  const [editSubmitting, setEditSubmitting]   = useState(false)
  const [editError, setEditError]             = useState<string | null>(null)

  const nameChanged = nameInput.trim().toLowerCase() !== (jerseyName ?? '').toLowerCase()
  const anySleeveChecked = halfSleeve || fullSleeve

  const editAnySleeveChecked = editHalf || editFull

  const activeOrder = orders.find(o =>
    o.status === 'pending' || o.status === 'submitted' || o.status === 'delivered'
  ) ?? null

  const pastOrders      = orders.filter(o => o.status === 'received')
  const cancelledOrders = orders.filter(o => o.status === 'cancelled')

  const editNameChanged = editName.trim().toLowerCase() !== (
    activeOrder?.jersey_name_override ?? activeOrder?.jersey_name ?? ''
  ).toLowerCase()

  // Reset confirmation and edit state whenever the active order changes
  useEffect(() => {
    setConfirmCancel(false)
    setEditMode(false)
  }, [activeOrder?.id])

  function openEdit() {
    if (!activeOrder) return
    setEditHalf(!!activeOrder.jersey_half_sleeve_size)
    setEditFull(!!activeOrder.jersey_full_sleeve_size)
    setEditTracks(!!activeOrder.tracks_size)
    setEditSleeveSize(
      activeOrder.jersey_half_sleeve_size ??
      activeOrder.jersey_full_sleeve_size ?? 'M'
    )
    setEditTracksSize(activeOrder.tracks_size ?? 'M')
    setEditName(activeOrder.jersey_name_override ?? activeOrder.jersey_name ?? '')
    setEditNotes(activeOrder.notes ?? '')
    setEditUpdateProfile(false)
    setEditError(null)
    setEditMode(true)
  }

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

  async function handleCancelOrder(orderId: string) {
    try {
      const res = await fetch(`/api/dugout/kit-room/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        console.error(d.error ?? 'Failed to cancel order')
        return
      }
      router.refresh()
    } catch {
      console.error('Network error')
    }
  }

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!halfSleeve && !fullSleeve && !addTracks) {
      setFormError('Select at least one item to order')
      return
    }

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        half_sleeve:         halfSleeve,
        full_sleeve:         fullSleeve,
        tracks:              addTracks,
        jersey_name_input:   nameInput.trim(),
        update_profile_name: updateProfileName,
        notes:               notes.trim() || undefined,
      }

      if (anySleeveChecked) {
        payload.jersey_size_selected = sleeveSize
      }

      if (addTracks) {
        payload.tracks_size = tracksSize
      }

      const res = await fetch('/api/dugout/kit-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    setEditError(null)

    if (!editHalf && !editFull && !editTracks) {
      setEditError('Select at least one item to order')
      return
    }

    if (!activeOrder) return

    setEditSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        half_sleeve:         editHalf,
        full_sleeve:         editFull,
        tracks:              editTracks,
        jersey_name_input:   editName.trim(),
        update_profile_name: editUpdateProfile,
        notes:               editNotes.trim() || null,
      }

      if (editAnySleeveChecked) {
        payload.jersey_size_selected = editSleeveSize
      }

      if (editTracks) {
        payload.tracks_size = editTracksSize
      }

      const res = await fetch(`/api/dugout/kit-room/${activeOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setEditError(d.error ?? 'Failed to save changes')
        return
      }
      setEditMode(false)
      router.refresh()
    } catch {
      setEditError('Network error — please try again')
    } finally {
      setEditSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Batch date notice */}
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

      {/* Active order status card */}
      {activeOrder && (
        <div className="bg-parchment-2 border border-[#D4C9B0] rounded-lg p-4 flex flex-col gap-3">
          <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
            Your Current Order
          </p>

          {editMode ? (
            /* ── Edit form ── */
            <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">

              {/* Jersey Name input */}
              <div className="flex flex-col gap-1">
                <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 flex items-center gap-1">
                  Jersey Name <span className="text-stone-400 normal-case font-normal tracking-normal">✏️</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => {
                    setEditName(e.target.value)
                    if (!e.target.value.trim() || e.target.value.trim().toLowerCase() === (activeOrder.jersey_name ?? '').toLowerCase()) {
                      setEditUpdateProfile(false)
                    }
                  }}
                  maxLength={10}
                  className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none"
                />
                <span className="font-rajdhani text-xs text-stone-400">
                  {editName.length}/10
                </span>
                {editNameChanged && (
                  <label className="flex items-center gap-2 font-rajdhani text-sm text-stone-700 cursor-pointer mt-0.5">
                    <input
                      type="checkbox"
                      checked={editUpdateProfile}
                      onChange={e => setEditUpdateProfile(e.target.checked)}
                      className="rounded"
                    />
                    Also update my profile with this name
                  </label>
                )}
              </div>

              {/* Apparel selection */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
                    Apparel Selection
                  </span>
                  <button
                    type="button"
                    onClick={() => window.open('https://www.tyka.com/sizechart', '_blank', 'noopener,noreferrer')}
                    className="font-rajdhani text-xs text-amber-600 hover:text-amber-700 hover:underline underline-offset-2"
                  >
                    Size guide ↗
                  </button>
                </div>
                <label className="flex items-center gap-2 font-rajdhani text-sm text-stone-700 cursor-pointer">
                  <input type="checkbox" checked={editHalf}
                    onChange={e => setEditHalf(e.target.checked)} className="rounded" />
                  Half Sleeve Jersey
                </label>
                <label className="flex items-center gap-2 font-rajdhani text-sm text-stone-700 cursor-pointer">
                  <input type="checkbox" checked={editFull}
                    onChange={e => setEditFull(e.target.checked)} className="rounded" />
                  Full Sleeve Jersey
                </label>
                <label className="flex items-center gap-2 font-rajdhani text-sm text-stone-700 cursor-pointer">
                  <input type="checkbox" checked={editTracks}
                    onChange={e => setEditTracks(e.target.checked)} className="rounded" />
                  Tracks
                </label>
                {editAnySleeveChecked && (
                  <div className="flex flex-col gap-1 mt-1">
                    <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
                      Jersey Size
                    </label>
                    <select value={editSleeveSize} onChange={e => setEditSleeveSize(e.target.value)}
                      className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none">
                      {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {editTracks && (
                  <div className="flex flex-col gap-1 mt-1">
                    <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
                      Tracks Size
                    </label>
                    <select value={editTracksSize} onChange={e => setEditTracksSize(e.target.value)}
                      className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none">
                      {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1">
                <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
                  Notes <span className="normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Any special requests…"
                  className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none resize-none placeholder:text-stone-400"
                />
              </div>

              {editError && (
                <p className="font-rajdhani text-sm text-red-600">{editError}</p>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={editSubmitting || (!editHalf && !editFull && !editTracks)}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-rajdhani font-bold px-6 py-2 rounded disabled:opacity-60 transition-colors"
                >
                  {editSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="font-rajdhani text-xs text-stone-500 hover:text-stone-700 hover:underline"
                >
                  Cancel Edit
                </button>
              </div>
            </form>
          ) : (
            /* ── Order display ── */
            <>
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-cinzel font-bold text-lg text-stone-900">
                    {activeOrder.jersey_name_override ?? activeOrder.jersey_name}
                  </span>
                  <span className="font-rajdhani text-stone-500 text-sm">
                    #{activeOrder.jersey_number}
                  </span>
                </div>
                <OrderItems order={activeOrder} />
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
              {activeOrder.status === 'pending' && (
                <p className="font-rajdhani text-xs text-stone-400">
                  Your order has been received. The coordinator will review and submit it in the next batch.
                </p>
              )}
              {activeOrder.status === 'submitted' && (
                <p className="font-rajdhani text-xs text-stone-400">
                  Your order has been submitted to the vendor. We'll notify you once it's ready for collection.
                </p>
              )}
              {activeOrder.status === 'delivered' && (
                <p className="font-rajdhani text-xs text-stone-400">
                  Your kit has arrived! Please confirm receipt once you've collected it.
                </p>
              )}
              {/* Edit / Cancel — only available while pending */}
              {activeOrder.status === 'pending' && (
                <div className="flex items-center gap-4">
                  <button
                    onClick={openEdit}
                    className="font-rajdhani text-xs text-amber-600 hover:text-amber-700 hover:underline"
                  >
                    Edit order
                  </button>
                  {confirmCancel ? (
                    <span className="font-rajdhani text-xs text-stone-600">
                      Are you sure?{' '}
                      <button
                        onClick={() => handleCancelOrder(activeOrder.id)}
                        className="text-red-600 font-semibold hover:underline"
                      >
                        Yes, cancel
                      </button>
                      <button
                        onClick={() => setConfirmCancel(false)}
                        className="text-stone-500 hover:underline ml-3"
                      >
                        Keep order
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmCancel(true)}
                      className="font-rajdhani text-xs text-red-500 hover:text-red-700 hover:underline"
                    >
                      Cancel order
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Place new order form */}
      {!isExpelled && !activeOrder && (
        <>
          {(!jerseyName || !jerseyNumber || jerseyNumber.trim() === '') ? (
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
                Place an Order
              </p>
              <form onSubmit={handleSubmitOrder} className="flex flex-col gap-4">

                {/* Jersey Name input */}
                <div className="flex flex-col gap-1">
                  <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500 flex items-center gap-1">
                    Jersey Name <span className="text-stone-400 normal-case font-normal tracking-normal">✏️</span>
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={e => {
                      setNameInput(e.target.value)
                      if (!e.target.value.trim() || e.target.value.trim().toLowerCase() === (jerseyName ?? '').toLowerCase()) {
                        setUpdateProfileName(false)
                      }
                    }}
                    maxLength={10}
                    className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none"
                  />
                  <span className="font-rajdhani text-xs text-stone-400">
                    {nameInput.length}/10
                  </span>
                  {nameChanged && (
                    <label className="flex items-center gap-2 font-rajdhani text-sm text-stone-700 cursor-pointer mt-0.5">
                      <input
                        type="checkbox"
                        checked={updateProfileName}
                        onChange={e => setUpdateProfileName(e.target.checked)}
                        className="rounded"
                      />
                      Also update my profile with this name
                    </label>
                  )}
                </div>

                {/* Jersey Number (read-only) */}
                <div className="flex flex-col gap-1">
                  <span className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">Jersey Number</span>
                  <span className="font-rajdhani text-stone-900 text-sm font-semibold">#{jerseyNumber}</span>
                </div>

                {/* Apparel selection */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
                      Apparel Selection
                    </span>
                    <button
                      type="button"
                      onClick={() => window.open('https://www.tyka.com/sizechart', '_blank', 'noopener,noreferrer')}
                      className="font-rajdhani text-xs text-amber-600 hover:text-amber-700 hover:underline underline-offset-2"
                    >
                      Size guide ↗
                    </button>
                  </div>
                  <label className="flex items-center gap-2 font-rajdhani text-sm text-stone-700 cursor-pointer">
                    <input type="checkbox" checked={halfSleeve}
                      onChange={e => setHalfSleeve(e.target.checked)} className="rounded" />
                    Half Sleeve Jersey
                  </label>
                  <label className="flex items-center gap-2 font-rajdhani text-sm text-stone-700 cursor-pointer">
                    <input type="checkbox" checked={fullSleeve}
                      onChange={e => setFullSleeve(e.target.checked)} className="rounded" />
                    Full Sleeve Jersey
                  </label>
                  <label className="flex items-center gap-2 font-rajdhani text-sm text-stone-700 cursor-pointer">
                    <input type="checkbox" checked={addTracks}
                      onChange={e => setAddTracks(e.target.checked)} className="rounded" />
                    Tracks
                  </label>
                  {anySleeveChecked && (
                    <div className="flex flex-col gap-1 mt-1">
                      <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
                        Jersey Size
                      </label>
                      <select value={sleeveSize} onChange={e => setSleeveSize(e.target.value)}
                        className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none">
                        {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  {addTracks && (
                    <div className="flex flex-col gap-1 mt-1">
                      <label className="font-rajdhani text-xs font-bold tracking-widest uppercase text-stone-500">
                        Tracks Size
                      </label>
                      <select value={tracksSize} onChange={e => setTracksSize(e.target.value)}
                        className="bg-parchment-3 border border-[#D4C9B0] text-stone-900 rounded px-3 py-2 font-rajdhani text-sm focus:outline-none">
                        {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                {/* Notes */}
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
                  disabled={submitting || (!halfSleeve && !fullSleeve && !addTracks)}
                  className="self-start bg-amber-600 hover:bg-amber-700 text-white font-rajdhani font-bold px-6 py-2 rounded disabled:opacity-60 transition-colors"
                >
                  {submitting ? 'Placing Order…' : 'Place Order'}
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {/* Past orders */}
      {pastOrders.length > 0 && (
        <div>
          <button
            onClick={() => setPastOpen(v => !v)}
            className="text-amber-600 text-sm font-rajdhani hover:text-amber-700 transition-colors"
          >
            {pastOpen ? 'Hide past orders' : `View past orders (${pastOrders.length})`}
          </button>
          {pastOpen && (
            <div className="mt-3 flex flex-col gap-2">
              {pastOrders.map(o => (
                <div key={o.id} className="flex flex-col gap-0.5">
                  <p className="font-rajdhani text-stone-600 text-sm font-semibold">
                    {o.jersey_name_override ?? o.jersey_name} · #{o.jersey_number} · {formatDate(o.created_at)}
                  </p>
                  <OrderItems order={o} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cancelled orders */}
      {cancelledOrders.length > 0 && (
        <div>
          <button
            onClick={() => setCancelledOpen(v => !v)}
            className="text-red-400 text-sm font-rajdhani hover:text-red-600 transition-colors"
          >
            {cancelledOpen ? 'Hide cancelled orders' : `View cancelled orders (${cancelledOrders.length})`}
          </button>
          {cancelledOpen && (
            <div className="mt-3 flex flex-col gap-2">
              {cancelledOrders.map(o => (
                <div key={o.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-rajdhani text-stone-500 text-sm">
                      {o.jersey_name_override ?? o.jersey_name} · #{o.jersey_number} · {formatDate(o.created_at)}
                    </p>
                    <span className={`font-rajdhani text-xs font-semibold px-2.5 py-0.5 rounded ${STATUS_BADGE.cancelled}`}>
                      {STATUS_LABELS.cancelled}
                    </span>
                  </div>
                  <OrderItems order={o} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
