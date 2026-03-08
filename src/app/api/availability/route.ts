import { NextRequest, NextResponse } from 'next/server'
import { computeSlotStatus } from '@/lib/validation'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { addDays, format, parseISO, formatDistanceToNow } from 'date-fns'
import type { SlotTime, WeekAvailability, DayAvailability, SlotInfo } from '@/types'

const SLOT_TIMES: SlotTime[] = ['07:30', '10:30', '12:30', '14:30']

const SLOT_LABELS: Record<SlotTime, string> = {
  '07:30': 'T20 / T30',
  '10:30': 'T20 only',
  '12:30': 'T20 / T30',
  '14:30': 'T20 only',
}

function formatExpiryLabel(reserved_until: string): string {
  const expiry = new Date(reserved_until)
  const now = new Date()
  const diffMs = expiry.getTime() - now.getTime()
  if (diffMs <= 0) return 'Expiring soon'
  // Show day + time e.g. "Sat 9:00pm"
  return `Expires ${format(expiry, 'EEE h:mma')}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const fromParam = searchParams.get('from')
  const weeksParam = parseInt(searchParams.get('weeks') ?? '15')

  let from: Date
  if (fromParam) {
    from = parseISO(fromParam)
  } else {
    from = new Date()
    const day = from.getDay()
    if (day === 0) {
      from = addDays(from, -1)
    } else if (day === 6) {
      // today is Saturday — start from today
    } else {
      const daysUntilSat = 6 - day
      from = addDays(from, daysUntilSat)
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const now = new Date().toISOString()
  const response = await fetch(
    `${supabaseUrl}/rest/v1/bookings?status=neq.cancelled&or=(reserved_until.is.null,reserved_until.gt.${now})&order=game_date,slot_time&limit=1000&select=*,tournament:tournaments(name)`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Range-Unit': 'items',
        'Range': '0-999',
        'Prefer': 'count=none',
      },
      cache: 'no-store',
    }
  )
  const bookings = await response.json()
  const error = response.ok ? null : bookings

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const weeks: WeekAvailability[] = []

  for (let w = 0; w < weeksParam; w++) {
    const sat = addDays(from, w * 7)
    const sun = addDays(sat, 1)
    const satStr = format(sat, 'yyyy-MM-dd')
    const sunStr = format(sun, 'yyyy-MM-dd')

    const days: DayAvailability[] = [sat, sun].map((d, di) => {
      const dateStr = di === 0 ? satStr : sunStr
      const dayLabel = format(d, "EEEE d MMM")

      const slots: SlotInfo[] = SLOT_TIMES.map(time => {
        const status = computeSlotStatus(dateStr, time, bookings ?? [])
        const slotInfo: SlotInfo = { time, status }

        if (status === 'open') {
          slotInfo.waLink = buildWhatsAppLink({
            date:   dayLabel,
            time,
            format: SLOT_LABELS[time],
          })
        }

        // Attach reservation details for soft_block (reserved) slots
        if (status === 'soft_block') {
          const booking = (bookings ?? []).find(
            (b: any) => b.game_date === dateStr && b.slot_time === time && b.status === 'soft_block'
          )
          if (booking) {
            slotInfo.reserved_until  = booking.reserved_until ?? null
            slotInfo.organiser_name  = booking.organiser_name ?? null
            slotInfo.tournament_name = booking.tournament?.name ?? null
          }
        }

        if (status === 'booked') {
          const booking = (bookings ?? []).find(
            (b: any) => b.game_date === dateStr && b.slot_time === time && b.status === 'confirmed'
          )
          if (booking?.cricheroes_url) {
            slotInfo.cricheroes_url  = booking.cricheroes_url
            slotInfo.tournament_name = booking.tournament?.name ?? null
          }
        }

        return slotInfo
      })

      return { date: dateStr, label: dayLabel, slots }
    })

    const weekendGameCount = (bookings ?? []).filter(
      (b: any) => (b.game_date === satStr || b.game_date === sunStr) && b.status === 'confirmed'
    ).length

    const satFmt = format(sat, 'd')
    const sunFmt = format(sun, 'd MMM yyyy')
    weeks.push({
      weekStart:   satStr,
      label:       `Weekend of ${satFmt}–${sunFmt}`,
      days,
      weekendFull: weekendGameCount >= 3,
      gamesBooked: weekendGameCount,
    })
  }

  return NextResponse.json(
    { weeks },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
