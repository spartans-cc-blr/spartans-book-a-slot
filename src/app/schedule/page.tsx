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
        <h1 className="font-cinzreturn (
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
          Open slots for the next 3 months. Tap a format to enquire via WhatsApp.
        </p>
      </div>

      {/* Legend */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #1F2937', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        {(['T20', 'T30', 'Any'] as const).map(lbl => {
          const color = lbl === 'T20' ? '#C9A84C' : lbl === 'T30' ? '#fb923c' : '#34d399'
          const border = lbl === 'T20' ? '#C9A84C' : lbl === 'T30' ? '#9a3412' : '#065f46'
          const bg     = lbl === 'T20' ? 'rgba(201,168,76,0.08)' : lbl === 'T30' ? 'rgba(154,52,18,0.12)' : 'rgba(52,211,153,0.08)'
          return (
            <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: "'DM Sans',sans-serif", fontSize: '11px', color: '#6B7280', whiteSpace: 'nowrap' }}>
              <span style={{ padding: '1px 8px', borderRadius: '4px', border: `1px solid ${border}`, background: bg, color, fontSize: '11px', fontWeight: 700 }}>{lbl}</span>
              {lbl === 'Any' ? 'Both T20 & T30 available — tap preferred' : `Only ${lbl} available`}
            </span>
          )
        })}
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: "'DM Sans',sans-serif", fontSize: '11px', color: '#6B7280', whiteSpace: 'nowrap' }}>
          <span style={{ padding: '1px 8px', borderRadius: '4px', border: '1px solid #1F2937', background: '#111827', color: '#374151', fontSize: '11px', fontWeight: 700 }}>—</span>
          Taken / N/A
        </span>
      </div>

      {/* Matrix — dates as rows, slots as columns */}
      <div style={{ overflowY: 'auto' }}>
        {loading ? (
          <MatrixSkeleton />
        ) : (
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: '320px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              <tr>
                {/* Date column header */}
                <th style={{
                  background: '#0D1117', borderBottom: '1px solid #1F2937', borderRight: '1px solid #1F2937',
                  padding: '8px 12px', textAlign: 'left', minWidth: '100px', whiteSpace: 'nowrap',
                }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#374151' }}>Date</span>
                </th>
                {/* One column per slot */}
                {(['07:30', '10:30', '12:30', '14:30'] as SlotTime[]).map(slot => (
                  <th key={slot} style={{
                    background: '#0D1117', borderBottom: '1px solid #1F2937', borderRight: '1px solid #1F2937',
                    padding: '8px 10px', textAlign: 'center', minWidth: '72px', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ display: 'block', fontFamily: "'Cinzel',serif", fontSize: '11px', fontWeight: 700, color: '#8B7340' }}>{slot}</span>
                    <span style={{ display: 'block', fontFamily: "'DM Sans',sans-serif", fontSize: '9px', color: '#374151', marginTop: '1px' }}>
                      {ORGANISER_FORMATS[slot].join('/')}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.flatMap(week =>
                week.days.map((day, dayIdx) => {
                  // Parse label: "Saturday 9 Aug" → abbrev + short date
                  const parts   = day.label.split(' ')
                  const dayAbbr = parts[0]?.slice(0, 3).toUpperCase() ?? ''
                  const dateStr = parts.slice(1).join(' ') // "9 Aug"

                  // Month separator row — show when day is Saturday (first of weekend)
                  const showMonth = dayIdx === 0 || (dayIdx === 0 && week.days[0]?.date === day.date)
                  const monthLabel = new Date(day.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

                  // Build slot status lookup for this day
                  const slotStatus: Record<SlotTime, string> = {
                    '07:30': 'na', '10:30': 'na', '12:30': 'na', '14:30': 'na',
                  }
                  day.slots.forEach(s => { slotStatus[s.time] = s.status })

                  const isSat = new Date(day.date).getDay() === 6
                  const rowBg = isSat ? '#0D1117' : '#111827'

                  return [
                    // Month header row — only on first day of each month
                    dayIdx === 0 ? (
                      <tr key={`month-${week.weekStart}`}>
                        <td colSpan={5} style={{
                          background: '#0a0e17',
                          borderBottom: '1px solid #1F2937',
                          padding: '4px 12px',
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: '9px',
                          fontWeight: 700,
                          letterSpacing: '0.15em',
                          textTransform: 'uppercase',
                          color: '#C9A84C',
                        }}>
                          {monthLabel}
                        </td>
                      </tr>
                    ) : null,

                    // Data row
                    <tr key={day.date} style={{ background: rowBg }}>
                      {/* Date cell */}
                      <td style={{
                        borderBottom: '1px solid #1F2937', borderRight: '1px solid #1F2937',
                        padding: '7px 12px', whiteSpace: 'nowrap', verticalAlign: 'middle',
                      }}>
                        <span style={{ display: 'block', fontFamily: "'DM Sans',sans-serif", fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{dayAbbr}</span>
                        <span style={{ display: 'block', fontFamily: "'Cinzel',serif", fontSize: '12px', fontWeight: 700, color: '#F9FAFB' }}>{dateStr}</span>
                      </td>

                      {/* Slot cells */}
                      {(['07:30', '10:30', '12:30', '14:30'] as SlotTime[]).map(slot => {
                        const status   = slotStatus[slot]
                        const isOpen   = status === 'open'
                        const isT20Only = status === 't20only'
                        const fmts     = ORGANISER_FORMATS[slot]

                        // Determine what to show
                        let cell: React.ReactNode

                        if (isOpen && fmts.length > 1) {
                          // Both T20 and T30 available — show "Any"
                          cell = (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {fmts.map(fmt => (
                                <a key={fmt} href={buildWALink(day.label, slot, fmt)} target="_blank" rel="noopener noreferrer"
                                  style={{
                                    display: 'block', textAlign: 'center', padding: '2px 6px', borderRadius: '4px', textDecoration: 'none',
                                    border: `1px solid ${fmt === 'T20' ? '#C9A84C' : '#9a3412'}`,
                                    background: fmt === 'T20' ? 'rgba(201,168,76,0.08)' : 'rgba(154,52,18,0.12)',
                                    color: fmt === 'T20' ? '#C9A84C' : '#fb923c',
                                    fontSize: '11px', fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                                  }}>
                                  {fmt}
                                </a>
                              ))}
                            </div>
                          )
                        } else if (isOpen && fmts.length === 1) {
                          // Single format open
                          const fmt = fmts[0]
                          cell = (
                            <a href={buildWALink(day.label, slot, fmt)} target="_blank" rel="noopener noreferrer"
                              style={{
                                display: 'block', textAlign: 'center', padding: '4px 6px', borderRadius: '4px', textDecoration: 'none',
                                border: `1px solid ${fmt === 'T20' ? '#C9A84C' : '#9a3412'}`,
                                background: fmt === 'T20' ? 'rgba(201,168,76,0.08)' : 'rgba(154,52,18,0.12)',
                                color: fmt === 'T20' ? '#C9A84C' : '#fb923c',
                                fontSize: '11px', fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                              }}>
                              {fmt}
                            </a>
                          )
                        } else if (isT20Only) {
                          // Clash reduced it to T20 only
                          cell = (
                            <a href={buildWALink(day.label, slot, 'T20')} target="_blank" rel="noopener noreferrer"
                              style={{
                                display: 'block', textAlign: 'center', padding: '4px 6px', borderRadius: '4px', textDecoration: 'none',
                                border: '1px solid #C9A84C', background: 'rgba(201,168,76,0.08)', color: '#C9A84C',
                                fontSize: '11px', fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                              }}>
                              T20
                            </a>
                          )
                        } else {
                          // Taken / clash / na
                          cell = <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12px', color: '#1F2937' }}>—</span>
                        }

                        return (
                          <td key={slot} style={{
                            borderBottom: '1px solid #1F2937', borderRight: '1px solid #1F2937',
                            padding: '5px 6px', textAlign: 'center', verticalAlign: 'middle',
                          }}>
                            {cell}
                          </td>
                        )
                      })}
                    </tr>,
                  ]
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )