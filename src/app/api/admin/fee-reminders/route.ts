// GET /api/admin/fee-reminders
// Admin only. Feeds FeeReminderModal (src/components/admin/FeeReminderModal.tsx)
// — every currently fee-pending booking (scorecard synced, fee configured,
// squad announced, not yet applied/externally-reconciled). Shown on next
// admin page load as the in-app fallback for the immediate push notification
// already fired by notifyFeeReminderIfPending() at sync time — see
// src/lib/feeReminders.ts and features/fee-reminders.md.
//
// Read-only, no rate limit — same convention as the other admin-only GET
// panels (e.g. /api/admin/matches/[id]/post-match).

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPendingFeeBookings } from '@/lib/feeReminders'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const bookings = await getPendingFeeBookings()
  return NextResponse.json({ bookings })
}
