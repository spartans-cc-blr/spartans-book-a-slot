import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { computeSlotStatus, getWeekendDates } from '@/lib/validation'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import type { SlotTime, WeekAvailability, DayAvailability, SlotInfo } from '@/types'

const SLOT_TIMES: SlotTime[] = ['07:30', '10:30', '12:30', '14:30']

const SLOT_LABELS: Record<SlotTime, string> = {
  '07:30': 'T20 / T30',
  '10:30': 'T20 only',
  '12:30': 'T20 / T30',
  '14:30': 'T20 only',
}

/**
 * GET /api/availability?from=YYYY-MM-DD&weeks=13
 * Returns availability grid for N weekends starting from the given date.
 * Public endpoint — no auth required.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const fromParam = searchParams.get('from')
  const weeksParam = parseInt(searchParams.get('weeks') ?? '13')

  // Default: start from next upcoming Saturday
  let from: Date
  if (fromParam) {
    from = parseISO(fromParam)
  } else {
    from = new Date()
    // Find next Saturday
    const day = from.getDay()
    const daysUntilSat = day === 6 ? 0 : (6 - day)
    from = addDays(from, daysUntilSat)
  }

  // Fetch all non-cancelled bookings in the range
  const supabase = createServiceClient()
  const endDate = addDays(from, weeksParam * 7)

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .neq('status', 'cancelled')
    .order('game_date')
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build week-by-week availability
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
        return slotInfo
      })

      return { date: dateStr, label: dayLabel, slots }
    })

    const satFmt = format(sat, 'd')
    const sunFmt = format(sun, 'd MMM yyyy')
    weeks.push({
      weekStart: satStr,
      label:     `Weekend of ${satFmt}–${sunFmt}`,
      days,
    })
  }

 return NextResponse.json(
    { weeks },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
