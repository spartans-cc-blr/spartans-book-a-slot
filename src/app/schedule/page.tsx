'use client'

import { useState, useEffect, useMemo } from 'react'
import { SiteNav } from '@/components/ui/SiteNav'
import type { WeekAvailability, SlotTime, GameFormat, SlotStatus } from '@/types'

const SLOTS: SlotTime[] = ['07:30', '10:30', '12:30', '14:30']

// Valid organiser formats per slot — mirrors validation.ts
const SLOT_FORMATS: Record<SlotTime, GameFormat[]> = {
  '07:30': ['T20', 'T30'],
  '10:30': ['T20'],
  '12:30': ['T30'],
  '14:30': ['T20'],
}

const WA_NUMBER = '919972009777'

function buildWALink(dayLabel: string, slot: SlotTime, fmt: GameFormat) {
  const text = encodeURIComponent(
    `Hi Spartans! I'd like to book the *${slot} ${fmt}* slot on *${dayLabel}*. Please confirm availability.`
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

export default function SchedulePage() {
  const [weeks, setWeeks] = useState<WeekAvailability[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/availability?weeks=15')
      .then(r => r.json())
      .then(d => { setWeeks(d.weeks ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Flatten all days, filter to only days with at least one open/t20only slot
  const days = useMemo(() => {
    return weeks.flatMap(w => w.days).filter(day =>
      day.slots.some(s => s.status === 'open' || s.status === 't20only')
    )
  }, [weeks])

  // Build lookup: date → slotTime → status
  const slotMap = useMemo(() => {
    const map = new Map<string, Map<SlotTime, SlotStatus>>()
    weeks.flatMap(w => w.days).forEach(day => {
      const bySlot = new Map<SlotTime, SlotStatus>()
      day.slots.forEach(s => bySlot.set(s.time, s.status))
      map.set(day.date, bySlot)
    })
    return map
  }, [weeks])

  // Month groups for header labels
  const monthGroups = useMemo(() => {
    const groups: { month: string; days: typeof days }[] = []
    days.forEach(day => {
      const month = new Date(day.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      if (!groups.length || groups[groups.length - 1].month !== month) {
        groups.push({ month, days: [day] })
      } else {
        groups[groups.length - 1].days.push(day)
      }
    })
    return groups
  }, [days])

  // Last booked month for subtitle
  const lastBookedMonth = useMemo(() => {
    const allDays = weeks.flatMap(w => w.days)
    for (let i = allDays.length - 1; i >= 0; i--) {
      if (allDays[i].slots.some(s => s.status === 'booked')) {
        return new Date(allDays[i].date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      }
    }
    return ''
  }, [weeks])

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
          Open slots{lastBookedMonth ? ` through ${lastBookedMonth}` : ''}. Tap a format to enquire via WhatsApp.
        </p>
      </div>

      {/* Legend */}
      <div className="px-5 md:px-8 lg:px-10 py-3 border-b border-ink-4 flex items-center gap-5 font-rajdhani text-xs text-zinc-500 overflow-x-auto">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span style={{ display: 'inline-block', width: '36px', textAlign: 'center', padding: '2px 0', borderRadius: '4px', border: '1px solid #C9A84C', background: 'rgba(201,168,76,0.08)', color: '#C9A84C', fontSize: '10px', fontWeight: 700 }}>T20</span>
          Tap to book
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span style={{ display: 'inline-block', width: '36px', textAlign: 'center', padding: '2px 0', borderRadius: '4px', border: '1px solid #9a3412', background: 'rgba(154,52,18,0.12)', color: '#fb923c', fontSize: '10px', fontWeight: 700 }}>T30</span>
          Tap to book
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span style={{ display: 'inline-block', width: '36px', textAlign: 'center', padding: '2px 0', borderRadius: '4px', border: '1px solid #374151', background: '#111827', color: '#4B5563', fontSize: '10px', fontWeight: 700 }}>—</span>
          Taken / N/A
        </span>
      </div>

      {/* Matrix */}
      <div className="px-4 md:px-8 lg:px-10 py-6">
        {loading ? (
          <MatrixSkeleton />
        ) : days.length === 0 ? (
          <p className="font-rajdhani text-zinc-500 text-sm py-8 text-center">No open slots at the moment.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginLeft: '-1rem', marginRight: '-1rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '360px', width: '100%' }}>
              <thead>
                <tr>
                  {/* Slot column header */}
                  <th style={{
                    position: 'sticky', left: 0, zIndex: 20,
                    background: '#0D1117',
                    borderBottom: '1px solid #1F2937',
                    borderRight: '1px solid #1F2937',
                    padding: '8px 12px',
                    textAlign: 'left',
                    minWidth: '56px',
                  }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#374151' }}>Slot</span>
                  </th>
                  {monthGroups.flatMap(group =>
                    group.days.map((day, di) => {
                      // Parse label e.g. "Saturday 9 Aug" → "SAT" + "9 Aug"
                      const parts = day.label.split(' ')
                      const dayAbbr = parts[0]?.slice(0, 3).toUpperCase() ?? ''
                      const dateShort = parts.slice(1).join(' ')
                      return (
                        <th key={day.date} style={{
                          borderBottom: '1px solid #1F2937',
                          borderRight: '1px solid #1F2937',
                          padding: '6px 6px 8px',
                          textAlign: 'center',
                          minWidth: '68px',
                          verticalAlign: 'bottom',
                        }}>
                          {di === 0 && (
                            <span style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#C9A84C', marginBottom: '2px' }}>
                              {group.month}
                            </span>
                          )}
                          <span style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            {dayAbbr}
                          </span>
                          <span style={{ display: 'block', fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 700, color: '#F9FAFB' }}>
                            {dateShort}
                          </span>
                        </th>
                      )
                    })
                  )}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((slot, si) => (
                  <tr key={slot} style={{ background: si % 2 === 0 ? '#0D1117' : '#111827' }}>
                    {/* Slot label */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 10,
                      background: si % 2 === 0 ? '#0D1117' : '#111827',
                      borderBottom: '1px solid #1F2937',
                      borderRight: '1px solid #1F2937',
                      padding: '6px 12px',
                      whiteSpace: 'nowrap',
                    }}>
                      <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 700, color: '#8B7340' }}>{slot}</span>
                    </td>
                    {days.map(day => {
                      const status = slotMap.get(day.date)?.get(slot) ?? 'na'
                      const isOpen = status === 'open'
                      const isT20Only = status === 't20only'
                      const availableFmts = isOpen
                        ? SLOT_FORMATS[slot]
                        : isT20Only
                        ? (['T20'] as GameFormat[]).filter(f => SLOT_FORMATS[slot].includes(f))
                        : []

                      const parts = day.label.split(' ')
                      const dayAbbr = parts[0]?.slice(0, 3).toUpperCase() ?? ''
                      const dateShort = parts.slice(1).join(' ')
                      const labelForWA = `${dayAbbr} ${dateShort}`

                      return (
                        <td key={day.date} style={{
                          borderBottom: '1px solid #1F2937',
                          borderRight: '1px solid #1F2937',
                          padding: '5px 4px',
                          textAlign: 'center',
                          verticalAlign: 'middle',
                        }}>
                          {availableFmts.length === 0 ? (
                            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: '#1F2937' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                              {availableFmts.map(fmt => (
                                <a
                                  key={fmt}
                                  href={buildWALink(labelForWA, slot, fmt)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'center',
                                    padding: '3px 6px',
                                    borderRadius: '5px',
                                    border: `1px solid ${fmt === 'T20' ? '#C9A84C' : '#9a3412'}`,
                                    background: fmt === 'T20' ? 'rgba(201,168,76,0.08)' : 'rgba(154,52,18,0.12)',
                                    color: fmt === 'T20' ? '#C9A84C' : '#fb923c',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    fontFamily: "'DM Sans', sans-serif",
                                    textDecoration: 'none',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {fmt}
                                </a>
                              ))}
                            </div>
                          )}
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