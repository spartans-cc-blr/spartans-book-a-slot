import { NextRequest, NextResponse } from 'next/server'
import { checkAndSendReservationExpiryReminders } from '@/lib/reservationExpiryReminders'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Runs hourly (see .github/workflows/cron-reservation-expiry-reminders.yml
// — Vercel Hobby only supports one cron invocation per day per job, which
// can't give the 24h/12h/1h lead times this route needs, so GitHub Actions
// is the real trigger here; the vercel.json entry is best-effort coverage
// only, same "safe to double-fire" posture as every other cron in this
// app). Alerts admins before a soft_block reservation's reserved_until
// deadline — see features/reservation-expiry-reminders.md.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.trim() !== `Bearer ${process.env.CRON_SECRET?.trim()}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const result = await checkAndSendReservationExpiryReminders()
  return NextResponse.json(result)
}
