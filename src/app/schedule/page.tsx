'use client'

import { useState, useEffect, useMemo } from 'react'
import { SiteNav } from '@/components/ui/SiteNav'
import type { WeekAvailability, SlotTime, GameFormat } from '@/types'

const WA_NUMBER = '919972009777'

function buildWALink(dayLabel: string, slot: SlotTime, fmt: GameFormat | 'T20 or T30') {
  const text = encodeURIComponent(
    `Hi Spartans! I'd like to enquire about booking the ${slot} slot on ${dayLabel} for a ${fmt} match. Please confirm availability. Thank you!`
  )
  return `https://wa.me/${WA_NUMBER}?text=${text}`
}

const ORGANISER_FORMATS: Record<SlotTime, GameFormat[]> = {
  '07:30': ['T20', 'T30'],
  '10:30': ['T20'],
  '12:30': ['T30'],
  '14:30': ['T20'],
}

const WA_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
)

function WACell({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
      textDecoration: 'none', padding: '6px 4px', borderRadius: '6px',
      color: '#059669', transition: 'background 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(5,150,105,0.08)')}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {WA_ICON}
      <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12px', fontWeight: 700, color: '#44403C', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
    </a>
  )
}

function MatrixSkeleton() {
  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', background: '#F8F4EE' }}>
     {[...Array(10)].map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: '4px' }}>
          <div style={{ height: '52px', width: '96px', borderRadius: '5px', background: '#E2DACE', flexShrink: 0 }} />
          {[...Array(4)].map((_, j) => (
            <div key={j} style={{ height: '52px', flex: 1, borderRadius: '5px', background: '#E2DACE' }} />
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
    fetch('/api/availability')
      .then(r => r.json())
      .then(d => { setWeeks(d.weeks ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Only show days that have at least one open or t20only slot
  const visibleDays = useMemo(() =>
    weeks.flatMap(w =>
      w.weekendFull
        ? []
        : w.days.filter(day =>
            day.slots.some(s => s.status === 'open' || s.status === 't20only')
          )
    ),
    [weeks])

  return (
    <div style={{ minHeight: '100vh', background: '#F8F4EE', display: 'flex', flexDirection: 'column' }}>
      <SiteNav activePage="schedule" />

      {/* Hero */}
      <div style={{ background: '#EEEAE2', borderBottom: '1px solid #D4C9B0', padding: '28px 20px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #D97706 0%, #F59E0B 60%, transparent 100%)' }} />
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#D97706', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'inline-block', width: '20px', height: '1.5px', background: '#D97706' }} />
          Spartans Cricket Club · Bengaluru
        </p>
        <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 700, color: '#1C1917', letterSpacing: '0.04em', marginBottom: '6px', lineHeight: 1.2 }}>
          Available Slots
        </h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '14px', color: '#78716C', maxWidth: '480px', lineHeight: 1.5 }}>
          Tap any slot to enquire via WhatsApp. Only weekends with open slots are shown.
        </p>
      </div>

      {/* Legend */}
      <div style={{ background: '#F8F4EE', borderBottom: '1px solid #D4C9B0', padding: '10px 20px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: "'DM Sans',sans-serif", fontSize: '12px', color: '#44403C' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#059669">...</svg>
          Tap to enquire on WhatsApp
        </span>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '12px', color: '#A8A29E' }}>· Only available weekends shown</span>
      </div>

      {/* Matrix */}
      <div style={{ overflowY: 'auto', height: 'calc(100vh - 220px)' }}>
        {loading ? <MatrixSkeleton /> : visibleDays.length === 0 ? (
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '14px', color: '#6B7280', padding: '48px', textAlign: 'center' }}>
            No open slots at the moment.
          </p>
        ) : (
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: '320px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              <tr>
                <th style={{ background: '#EEEAE2', borderBottom: '2px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '10px 14px', textAlign: 'left', minWidth: '90px' }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#A8A29E' }}>Date</span>
                </th>
                {(['07:30', '10:30', '12:30', '14:30'] as SlotTime[]).map(slot => (
                  <th key={slot} style={{ background: '#EEEAE2', borderBottom: '2px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '10px 6px', textAlign: 'center', minWidth: '80px' }}>
                    <span style={{ display: 'block', fontFamily: "'Cinzel',serif", fontSize: '12px', fontWeight: 700, color: '#B45309' }}>{slot}</span>
                    <span style={{ display: 'block', fontFamily: "'DM Sans',sans-serif", fontSize: '11px', color: '#A8A29E', marginTop: '2px' }}>
                      {ORGANISER_FORMATS[slot].join(' · ')}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleDays.map((day, idx) => {
                const parts   = day.label.split(' ')
                const dayAbbr = parts[0]?.slice(0, 3).toUpperCase() ?? ''
                const dateStr = parts.slice(1).join(' ')
                const isSat   = new Date(day.date).getDay() === 6
                const rowBg   = isSat ? '#F8F4EE' : '#EEEAE2'
                const monthLabel = new Date(day.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                const prevDay    = visibleDays[idx - 1]
                const prevMonth  = prevDay ? new Date(prevDay.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : null
                const showMonth  = monthLabel !== prevMonth

                const slotStatus: Record<SlotTime, string> = { '07:30': 'na', '10:30': 'na', '12:30': 'na', '14:30': 'na' }
                day.slots.forEach(s => { slotStatus[s.time] = s.status })

                return (
                  <>
                    {showMonth && (
                      <tr key={`m-${day.date}`}>
                        <td colSpan={5} style={{ background: '#E2DACE', borderBottom: '1px solid #D4C9B0', borderTop: '2px solid #D4C9B0', padding: '6px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#D97706' }}>
                          {monthLabel}
                        </td>
                      </tr>
                    )}
                    <tr key={day.date} style={{ background: rowBg }}>
                      <td style={{ borderBottom: '1px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '10px 14px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                        <span style={{
                          display: 'inline-block', fontFamily: "'DM Sans',sans-serif",
                          fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                          padding: '1px 6px', borderRadius: '3px', marginBottom: '4px',
                          ...(isSat
                            ? { background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE' }
                            : { background: '#FCE7F3', color: '#BE185D', border: '1px solid #FBCFE8' }),
                        }}>{dayAbbr}</span>
                        <span style={{ display: 'block', fontFamily: "'Cinzel',serif", fontSize: '13px', fontWeight: 700, color: '#1C1917' }}>{dateStr}</span>
                      </td>
                      {(['07:30', '10:30', '12:30', '14:30'] as SlotTime[]).map(slot => {
                        const status    = slotStatus[slot]
                        const isOpen    = status === 'open'
                        const isT20Only = status === 't20only'
                        const fmts      = ORGANISER_FORMATS[slot]

                        return (
                          <td key={slot} style={{ borderBottom: '1px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '4px', textAlign: 'center', verticalAlign: 'middle', background: (isOpen || isT20Only) ? 'rgba(5,150,105,0.04)' : 'transparent' }}>
                            {isOpen && fmts.length > 1 ? (
                               // Both T20 & T30 available — single enquiry, organiser specifies format in chat
                               <WACell href={buildWALink(day.label, slot, 'T20 or T30')} label="T20 · T30" />
                            ) : isOpen && fmts.length === 1 ? (
                              <WACell href={buildWALink(day.label, slot, fmts[0])} label={fmts[0]} />
                            ) : isT20Only ? (
                              <WACell href={buildWALink(day.label, slot, 'T20')} label="T20" />
                            ) : (
                              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: '14px', color: '#D4C9B0' }}>—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
