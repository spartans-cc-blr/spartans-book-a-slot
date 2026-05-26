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
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {[...Array(10)].map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: '4px' }}>
          <div style={{ height: '36px', width: '96px', borderRadius: '5px', background: '#1F2937', flexShrink: 0 }} />
          {[...Array(4)].map((_, j) => (
            <div key={j} style={{ height: '36px', flex: 1, borderRadius: '5px', background: '#1F2937' }} />
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
    fetch('/api/availability?weeks=13')
      .then(r => r.json())
      .then(d => { setWeeks(d.weeks ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

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
          Open slots for the next 3 months. Tap a format to enquire via WhatsApp.
        </p>
      </div>

      {/* Legend */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #1F2937', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        {(['T20', 'T30'] as GameFormat[]).map(lbl => {
          const color  = lbl === 'T20' ? '#C9A84C' : '#fb923c'
          const border = lbl === 'T20' ? '#C9A84C' : '#9a3412'
          const bg     = lbl === 'T20' ? 'rgba(201,168,76,0.08)' : 'rgba(154,52,18,0.12)'
          return (
            <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: "'DM Sans',sans-serif", fontSize: '11px', color: '#6B7280', whiteSpace: 'nowrap' }}>
              <span style={{ padding: '1px 8px', borderRadius: '4px', border: `1px solid ${border}`, background: bg, color, fontSize: '11px', fontWeight: 700 }}>{lbl}</span>
              Tap to book
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
                <th style={{
                  background: '#0D1117', borderBottom: '1px solid #1F2937', borderRight: '1px solid #1F2937',
                  padding: '8px 12px', textAlign: 'left', minWidth: '100px', whiteSpace: 'nowrap',
                }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#374151' }}>Date</span>
                </th>
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
              {weeks.flatMap((week, weekIdx) =>
                week.days.flatMap((day, dayIdx) => {
                  const parts    = day.label.split(' ')
                  const dayAbbr  = parts[0]?.slice(0, 3).toUpperCase() ?? ''
                  const dateStr  = parts.slice(1).join(' ')
                  const isSat    = new Date(day.date).getDay() === 6
                  const rowBg    = isSat ? '#0D1117' : '#111827'
                  const monthLabel = new Date(day.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

                  // Show month separator on the first Saturday of each new month
                  const prevDay  = weekIdx === 0 && dayIdx === 0 ? null : week.days[dayIdx - 1] ?? weeks[weekIdx - 1]?.days[1]
                  const prevMonth = prevDay ? new Date(prevDay.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : null
                  const showMonthRow = monthLabel !== prevMonth

                  const slotStatus: Record<SlotTime, string> = {
                    '07:30': 'na', '10:30': 'na', '12:30': 'na', '14:30': 'na',
                  }
                  day.slots.forEach(s => { slotStatus[s.time] = s.status })

                  const rows: React.ReactNode[] = []

                  if (showMonthRow) {
                    rows.push(
                      <tr key={`month-${day.date}`}>
                        <td colSpan={5} style={{
                          background: '#080b12', borderBottom: '1px solid #1F2937',
                          padding: '4px 12px',
                          fontFamily: "'DM Sans',sans-serif", fontSize: '9px',
                          fontWeight: 700, letterSpacing: '0.15em',
                          textTransform: 'uppercase', color: '#C9A84C',
                        }}>
                          {monthLabel}
                        </td>
                      </tr>
                    )
                  }

                  rows.push(
                    <tr key={day.date} style={{ background: rowBg }}>
                      <td style={{
                        borderBottom: '1px solid #1F2937', borderRight: '1px solid #1F2937',
                        padding: '7px 12px', whiteSpace: 'nowrap', verticalAlign: 'middle',
                      }}>
                        <span style={{ display: 'block', fontFamily: "'DM Sans',sans-serif", fontSize: '9px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{dayAbbr}</span>
                        <span style={{ display: 'block', fontFamily: "'Cinzel',serif", fontSize: '12px', fontWeight: 700, color: '#F9FAFB' }}>{dateStr}</span>
                      </td>

                      {(['07:30', '10:30', '12:30', '14:30'] as SlotTime[]).map(slot => {
                        const status    = slotStatus[slot]
                        const isOpen    = status === 'open'
                        const isT20Only = status === 't20only'
                        const fmts      = ORGANISER_FORMATS[slot]

                        let cell: React.ReactNode

                        if (isOpen && fmts.length > 1) {
                          cell = (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {fmts.map(fmt => (
                                <a key={fmt} href={buildWALink(day.label, slot, fmt)} target="_blank" rel="noopener noreferrer"
                                  style={{
                                    display: 'block', textAlign: 'center', padding: '2px 4px', borderRadius: '4px', textDecoration: 'none',
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
                        } else if (isOpen || isT20Only) {
                          const fmt = isT20Only ? 'T20' : fmts[0]
                          cell = (
                            <a href={buildWALink(day.label, slot, fmt)} target="_blank" rel="noopener noreferrer"
                              style={{
                                display: 'block', textAlign: 'center', padding: '4px 4px', borderRadius: '4px', textDecoration: 'none',
                                border: `1px solid ${fmt === 'T20' ? '#C9A84C' : '#9a3412'}`,
                                background: fmt === 'T20' ? 'rgba(201,168,76,0.08)' : 'rgba(154,52,18,0.12)',
                                color: fmt === 'T20' ? '#C9A84C' : '#fb923c',
                                fontSize: '11px', fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                              }}>
                              {fmt}
                            </a>
                          )
                        } else {
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
                    </tr>
                  )

                  return rows
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}