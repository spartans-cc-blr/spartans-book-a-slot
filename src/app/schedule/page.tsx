'use client'

import { useState, useEffect, useMemo } from 'react'
import { SiteNav } from '@/components/ui/SiteNav'
import type { GameFormat } from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────

const SLOTS = ['07:30', '10:30', '12:30', '14:30'] as const
type SlotTime = typeof SLOTS[number]

// Which formats an organiser can book per slot
const ORGANISER_FORMATS: Record<SlotTime, GameFormat[]> = {
  '07:30': ['T20', 'T30'],
  '10:30': ['T20'],
  '12:30': ['T30'],
  '14:30': ['T20'],
}

const WA_NUMBER = '919880000000' // replace with actual number from env/config

// ── Types (mirrors API response) ─────────────────────────────────────────────

type SlotStatus = 'open' | 'booked' | 'soft_block' | 'blocked'

type SlotData = {
  time: SlotTime
  status: SlotStatus
  format?: GameFormat
}

type DayData = {
  date: string      // 'yyyy-MM-dd'
  dayLabel: string  // 'SAT' | 'SUN'
  dateLabel: string // '9 Aug'
  slots: SlotData[]
}

type WeekData = {
  weekLabel: string // 'Weekend of 9–10 Aug 2026'
  days: DayData[]
  weekendFull: boolean
  gamesBooked: number
}

// ── WhatsApp message builder ─────────────────────────────────────────────────

function buildWALink(dateLabel: string, dayLabel: string, slot: SlotTime, format: GameFormat) {
  const text = encodeURIComponent(
    `Hi Spartans! I'd like to book the *${slot} ${format}* slot on *${dayLabel} ${dateLabel}*. Please confirm availability.`
  )
  return `https://wa.me/${WA_NUMBER}?text=${text}`
}

function MatrixSkeleton() {
  return (
    <div style={{ overflowX: 'auto' }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
          <div style={{ height: '40px', width: '64px', borderRadius: '6px', background: '#1F2937', flexShrink: 0 }} />
          {[...Array(8)].map((_, j) => (
            <div key={j} style={{ height: '40px', width: '72px', borderRadius: '6px', background: '#1F2937' }} />
          ))}
        </div>
      ))}
    </div>
  )
}
// ── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [weeks, setWeeks] = useState<WeekData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/availability')
      .then(r => r.json())
      .then(data => { setWeeks(data ?? []); setLoading(false) })
  }, [])

  // Build a flat, date-keyed lookup from the weeks data
  const { days, slotMap, lastMonth } = useMemo(() => {
    const allDays: DayData[] = []
    const map = new Map<string, Map<SlotTime, SlotData>>()

    for (const week of weeks) {
      for (const day of week.days) {
        allDays.push(day)
        const slotByTime = new Map<SlotTime, SlotData>()
        for (const slot of day.slots) {
          slotByTime.set(slot.time as SlotTime, slot)
        }
        map.set(day.date, slotByTime)
      }
    }

    // Find last month label from last booked day
    let lastMonth = ''
    for (const week of [...weeks].reverse()) {
      const bookedDay = [...week.days].reverse().find(d =>
        d.slots.some(s => s.status === 'booked')
      )
      if (bookedDay) {
        // e.g. "Aug 2026"
        const d = new Date(bookedDay.date)
        lastMonth = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        break
      }
    }

    return { days: allDays, slotMap: map, lastMonth }
  }, [weeks])

  // Group days into month sections for the sticky month headers
  const monthGroups = useMemo(() => {
    const groups: { month: string; days: DayData[] }[] = []
    for (const day of days) {
      const month = new Date(day.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      if (!groups.length || groups[groups.length - 1].month !== month) {
        groups.push({ month, days: [day] })
      } else {
        groups[groups.length - 1].days.push(day)
      }
    }
    return groups
  }, [days])

  return (
    <div className="min-h-screen bg-ink grain">
      <SiteNav activePage="schedule" />

      {/* Hero */}
      <div className="bg-ink-2 border-b border-ink-4 px-5 md:px-8 lg:px-10 py-7 md:py-9 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-gold inline-block" />
          Spartans Cricket Club · Bengaluru
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-parchment mb-2 tracking-wide">
          Available Slots
        </h1>
        <p className="text-muted text-sm md:text-base max-w-xl leading-relaxed font-rajdhani">
          Open slots{lastMonth ? ` through ${lastMonth}` : ''}. Tap a format badge to enquire via WhatsApp.
        </p>
      </div>

      {/* Legend */}
      <div className="px-5 md:px-8 lg:px-10 py-3 border-b border-ink-4 flex items-center gap-5 font-rajdhani text-xs text-zinc-500 overflow-x-auto">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block w-10 rounded border border-gold-dim bg-gold/10 text-gold font-cinzel font-bold text-[10px] text-center py-0.5">T20</span>
          Available — tap to book
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block w-10 rounded border border-orange-800 bg-orange-950/30 text-orange-400 font-cinzel font-bold text-[10px] text-center py-0.5">T30</span>
          Available — tap to book
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block w-10 rounded border border-ink-5 bg-ink-4 text-zinc-600 font-cinzel font-bold text-[10px] text-center py-0.5">—</span>
          Unavailable
        </span>
      </div>

      {/* Matrix */}
      <div className="px-4 md:px-8 lg:px-10 py-6">
        {loading ? (
          <MatrixSkeleton />
        ) : days.length === 0 ? (
          <p className="font-rajdhani text-zinc-500 text-sm py-8 text-center">No open slots found.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="border-separate border-spacing-0 w-full min-w-[360px]">
              <thead>
                <tr>
                  {/* Slot col header */}
                  <th className="sticky left-0 z-20 bg-ink border-b border-r border-ink-4 px-3 py-2 text-left">
                    <span className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600">Slot</span>
                  </th>
                  {monthGroups.map(group => (
                    group.days.map((day, di) => (
                      <th key={day.date}
                        className="border-b border-r border-ink-4 px-2 py-2 text-center min-w-[72px]">
                        {di === 0 && (
                          <span className="block font-rajdhani text-[9px] uppercase tracking-widest text-gold mb-0.5">
                            {group.month}
                          </span>
                        )}
                        <span className="block font-rajdhani text-[10px] text-zinc-500 uppercase tracking-wider">
                          {day.dayLabel}
                        </span>
                        <span className="block font-cinzel text-xs font-bold text-parchment">
                          {day.dateLabel}
                        </span>
                      </th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((slot, si) => (
                  <tr key={slot} className={si % 2 === 0 ? 'bg-ink' : 'bg-ink-2'}>
                    {/* Slot label */}
                    <td className="sticky left-0 z-10 bg-inherit border-b border-r border-ink-4 px-3 py-2 whitespace-nowrap">
                      <span className="font-cinzel text-xs font-bold text-gold-dim">{slot}</span>
                    </td>
                    {days.map(day => {
                      const slotData = slotMap.get(day.date)?.get(slot)
                      return (
                        <td key={day.date}
                          className="border-b border-r border-ink-4 px-1.5 py-1.5 text-center align-middle">
                          <MatrixCell
                            slot={slot}
                            slotData={slotData ?? null}
                            day={day}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Matrix Cell ───────────────────────────────────────────────────────────────

function MatrixCell({
  slot,
  slotData,
  day,
}: {
  slot: SlotTime
  slotData: SlotData | null
  day: DayData
}) {
  const formats = ORGANISER_FORMATS[slot]

  // Booked / blocked / soft_block — show as unavailable
  if (slotData && slotData.status !== 'open') {
    return (
      <span
        style={{
          display: 'block',
          textAlign: 'center',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px',
          color: '#374151',
          padding: '4px 0',
          userSelect: 'none',
        }}
      >
        —
      </span>
    )
  }

  // Open — show each valid format as a WhatsApp tap target
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
      {formats.map(fmt => {
        const href = buildWALink(day.dateLabel, day.dayLabel, slot, fmt)
        const isT20 = fmt === 'T20'
        return (
          <a
            key={fmt}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              padding: '3px 4px',
              borderRadius: '6px',
              border: `1px solid ${isT20 ? '#C9A84C' : '#9a3412'}`,
              background: isT20 ? 'rgba(201,168,76,0.08)' : 'rgba(154,52,18,0.12)',
              color: isT20 ? '#C9A84C' : '#fb923c',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {fmt}
          </a>
        )
      })}
    </div>
  )
}