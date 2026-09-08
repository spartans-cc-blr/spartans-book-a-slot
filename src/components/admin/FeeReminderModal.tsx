'use client'

// Admin-only reminder modal — every booking whose scorecard has synced but
// whose match fee hasn't been applied yet (see src/lib/feeReminders.ts for
// the exact eligibility rule and features/fee-reminders.md for the full
// feature writeup). This is the in-app fallback for the immediate push
// notification notifyFeeReminderIfPending() already fires the moment a
// scorecard syncs — an admin who missed the push, wasn't subscribed, or is
// just opening the Hub days later still gets nagged here.
//
// Mounted once via GlobalFeeReminderModal in the root layout, same pattern
// as MilestoneCelebrationModal/BirthdayWishesModal.
//
// Dismissal is a plain localStorage flag, not a server-persisted cursor —
// deliberately, since the underlying "fee pending" fact isn't a one-time
// event to mark seen (like a milestone) but an ongoing state that should
// keep nagging until actually resolved. The flag is keyed on today's date
// plus the sorted set of pending booking IDs, so: dismissing today doesn't
// suppress tomorrow's reminder for the same unresolved bookings, and a
// *newly* fee-pending booking appearing today re-opens the modal even if
// today's earlier (smaller) set was already dismissed.

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Dialog } from '@/components/ui/Dialog'

interface PendingFeeBooking {
  booking_id:      string
  game_date:       string
  slot_time:       string
  opponent_name:   string | null
  tournament_name: string | null
  fee:             number
  squad_count:     number
}

function dismissKey(bookings: PendingFeeBooking[]): string {
  const today = new Date().toISOString().split('T')[0]
  const ids = bookings.map(b => b.booking_id).sort().join(',')
  return `feeReminderDismissed:${today}:${ids}`
}

function formatDate(gameDate: string): string {
  return new Date(gameDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function FeeReminderModal() {
  const { status } = useSession()
  const [bookings, setBookings] = useState<PendingFeeBooking[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    fetch('/api/admin/fee-reminders')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data?.bookings?.length) return
        const key = dismissKey(data.bookings)
        let alreadyDismissed = false
        try {
          alreadyDismissed = window.localStorage.getItem(key) === '1'
        } catch { /* private browsing / storage blocked — never show worse, just don't suppress */ }
        setBookings(data.bookings)
        if (!alreadyDismissed) setOpen(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [status])

  function dismiss() {
    setOpen(false)
    try {
      window.localStorage.setItem(dismissKey(bookings), '1')
    } catch { /* best-effort only */ }
  }

  if (!open || bookings.length === 0) return null

  const totalPending = bookings.reduce((sum, b) => sum + b.fee, 0)

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      title="💰 Match Fees Pending"
      actions={
        <button
          onClick={dismiss}
          className="font-rajdhani text-xs font-bold uppercase tracking-wide bg-gold text-ink px-4 py-2 rounded hover:bg-gold-light transition-colors"
        >
          Remind me tomorrow
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="font-rajdhani text-sm text-parchment leading-snug">
          {bookings.length} synced match{bookings.length === 1 ? '' : 'es'} — ₹{totalPending} not yet applied.
        </p>
        <div className="flex flex-col gap-2">
          {bookings.map(b => (
            <a
              key={b.booking_id}
              href={`/admin/bookings/${b.booking_id}`}
              className="block bg-ink-4 border border-ink-5 rounded p-2.5 hover:border-gold-dim transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-rajdhani text-sm text-parchment truncate">
                  {b.opponent_name ? `vs ${b.opponent_name}` : 'Match'}
                  {b.tournament_name ? ` · ${b.tournament_name}` : ''}
                </span>
                <span className="font-rajdhani text-sm font-bold text-gold shrink-0">₹{b.fee}</span>
              </div>
              <p className="font-rajdhani text-[11px] text-zinc-500 mt-0.5">
                {formatDate(b.game_date)} · {b.slot_time} · {b.squad_count} in squad
              </p>
            </a>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
