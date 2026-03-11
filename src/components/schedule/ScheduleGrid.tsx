'use client'

import { useEffect, useState } from 'react'
import type { WeekAvailability, SlotTime } from '@/types'
import { buildGenericWhatsAppLink } from '@/lib/whatsapp'

const SLOT_HEADERS: { time: SlotTime; label: string }[] = [
  { time: '07:30', label: 'T20/T30' },
  { time: '10:30', label: 'T20 only' },
  { time: '12:30', label: 'T20/T30' },
  { time: '14:30', label: 'T20 only' },
]

const SLOT_INDEX: Record<SlotTime, number> = {
  '07:30': 0,
  '10:30': 1,
  '12:30': 2,
  '14:30': 3,
}

const STATUS_CONFIG = {
  open:       { label: 'Open',              gridLabel: 'Open',              icon: '🟢', pill: 'slot-open',      gridCls: 'bg-emerald-950 border border-emerald-800 hover:border-emerald-400 hover:-translate-y-0.5 transition-all cursor-pointer animate-pulse-open' },
  booked:     { label: 'Booked',            gridLabel: 'Booked',            icon: '🔴', pill: 'slot-booked',    gridCls: 'bg-red-950 border border-red-900 cursor-default' },
  soft_block: { label: 'Reserved',          gridLabel: 'Reserved',          icon: '🟡', pill: 'slot-softblock', gridCls: 'bg-yellow-950 border border-yellow-800 cursor-default animate-pulse' },
  clash:      { label: 'Play in progress',  gridLabel: 'Play in progress',  icon: '⛔', pill: 'slot-clash',     gridCls: 'bg-ink-3 border border-ink-5 cursor-not-allowed' },
  na:         { label: '',                  gridLabel: '',                  icon: '—',  pill: '',               gridCls: 'bg-transparent border-transparent cursor-default' },
}

// Returns the SlotTime that causes a clash for the given slotTime, based on the day's slots
function getClashSource(
  slotTime: SlotTime,
  daySlots: { time: SlotTime; status: string }[]
): SlotTime | null {
  const slotMap = Object.fromEntries(daySlots.map(s => [s.time, s.status]))

  if (slotTime === '10:30') {
    // Blocked by T30 at 07:30 or any game at 12:30
    if (slotMap['07:30'] === 'booked') return '07:30'
    if (slotMap['12:30'] === 'booked') return '12:30'
  }
  if (slotTime === '12:30') {
    // Blocked by T20 at 10:30 or T20 at 14:30
    if (slotMap['10:30'] === 'booked') return '10:30'
    if (slotMap['14:30'] === 'booked') return '14:30'
  }
  if (slotTime === '14:30') {
    // Blocked by any game at 12:30
    if (slotMap['12:30'] === 'booked') return '12:30'
  }
  return null
}

// Returns arrow direction: 'left' | 'right' | 'up' | 'down' | null
function getArrowDirection(
  slotTime: SlotTime,
  clashSource: SlotTime | null,
  mobile: boolean
): 'left' | 'right' | 'up' | 'down' | null {
  if (!clashSource) return null
  const clashIdx = SLOT_INDEX[clashSource]
  const thisIdx  = SLOT_INDEX[slotTime]
  if (mobile) {
    return clashIdx < thisIdx ? 'up' : 'down'
  }
  return clashIdx < thisIdx ? 'left' : 'right'
}

function ArrowIcon({ direction }: { direction: 'left' | 'right' | 'up' | 'down' }) {
  const paths: Record<string, string> = {
    left:  'M15 18l-6-6 6-6',
    right: 'M9 18l6-6-6-6',
    up:    'M18 15l-6-6-6 6',
    down:  'M6 9l6 6 6-6',
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={paths[direction].replace(/[A-Z]/g, '').trim()} />
      <path d={paths[direction]} />
    </svg>
  )
}

function formatExpiryLabel(reserved_until: string): string {
  const expiry = new Date(reserved_until)
  const now    = new Date()
  if (expiry <= now) return 'Expiring soon'
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const day  = days[expiry.getDay()]
  const hrs  = expiry.getHours()
  const mins = expiry.getMinutes().toString().padStart(2, '0')
  const ampm = hrs >= 12 ? 'pm' : 'am'
  const h    = hrs % 12 || 12
  return `Expires ${day} ${h}:${mins}${ampm}`
}

export function ScheduleGrid({ playerView = false }: { playerView?: boolean }) {
  const [weeks, setWeeks]               = useState<WeekAvailability[]>([])
  const [currentWeek, setCurrentWeek]   = useState(0)
  const [loading, setLoading]           = useState(true)
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/availability?weeks=15')
      .then(r => r.json())
      .then(d => {
        const fetchedWeeks = d.weeks ?? []
        setWeeks(fetchedWeeks)

        let startWeek = 0

        if (playerView) {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const idx = fetchedWeeks.findIndex((w: any) =>
            w.days.some((day: any) => new Date(day.date) >= today)
          )
          startWeek = idx >= 0 ? idx : 0
        } else {
          const firstOpenWeek = fetchedWeeks.findIndex((w: any) =>
            !w.weekendFull &&
            w.days.some((day: any) =>
              day.slots.some((slot: any) => slot.status === 'open')
            )
          )
          startWeek = firstOpenWeek >= 0 ? firstOpenWeek : 0
        }

        setCurrentWeek(startWeek)
        if (fetchedWeeks[startWeek]?.days?.length > 0) {
          setExpandedDays({ [fetchedWeeks[startWeek].days[0].date]: true })
        }
        setLoading(false)
      })
  }, [])

  const week = weeks[currentWeek]

  const toggleDay = (date: string) => {
    setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }))
  }

  if (loading) return <ScheduleGridSkeleton />

  return (
    <div>
      {/* Month pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none">
        {weeks
          .filter((w, i, arr) =>
            i === arr.findIndex(x =>
              new Date(x.weekStart).getMonth() === new Date(w.weekStart).getMonth() &&
              new Date(x.weekStart).getFullYear() === new Date(w.weekStart).getFullYear()
            )
          )
          .map(w => {
            const d = new Date(w.weekStart)
            const monthLabel = d.toLocaleString('default', { month: 'short' })
            const year = d.getFullYear()
            const weekIndex = weeks.indexOf(w)
            return (
              <button key={w.weekStart}
                onClick={() => setCurrentWeek(weekIndex)}
                className={`font-rajdhani text-xs font-semibold tracking-widest px-4 py-1.5 rounded-full border transition-all whitespace-nowrap
                  ${week && new Date(week.weekStart).getMonth() === d.getMonth() && new Date(week.weekStart).getFullYear() === d.getFullYear()
                    ? 'border-gold text-gold bg-gold/10'
                    : 'border-ink-5 text-zinc-600 hover:border-gold-dim hover:text-gold'}`}>
                {monthLabel} {year}
              </button>
            )
          })}
      </div>

      {/* Week navigator */}
      <div className="flex items-center gap-3 bg-ink-3 border border-ink-5 rounded p-3 mb-4">
        <button onClick={() => setCurrentWeek(w => Math.max(0, w - 1))}
          disabled={currentWeek === 0}
          className="w-8 h-8 flex items-center justify-center border border-gold-dim text-gold rounded text-lg disabled:opacity-30 hover:bg-gold-dim transition-colors">
          ‹
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-cinzel text-sm text-gold-light truncate flex items-center gap-2">
            {week?.label}
            {week?.weekendFull && (
              <span className="font-rajdhani text-[10px] font-bold tracking-wide bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                🔒 Capacity Full
              </span>
            )}
          </p>
          <p className="text-xs text-zinc-600 font-rajdhani mt-0.5">Week {currentWeek + 1} of {weeks.length}</p>
        </div>
        <div className="hidden sm:flex gap-1">
          {weeks.slice(0, 15).map((_, i) => (
            <button key={i} onClick={() => setCurrentWeek(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentWeek ? 'bg-gold' : 'bg-ink-5 hover:bg-gold-dim'}`} />
          ))}
        </div>
        <button onClick={() => setCurrentWeek(w => Math.min(weeks.length - 1, w + 1))}
          disabled={currentWeek === weeks.length - 1}
          className="w-8 h-8 flex items-center justify-center border border-gold-dim text-gold rounded text-lg disabled:opacity-30 hover:bg-gold-dim transition-colors">
          ›
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap mb-5">
        {Object.entries(STATUS_CONFIG)
          .filter(([key]) => key !== 'na')
          .map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-zinc-500 font-rajdhani">
              <span className="text-sm">{cfg.icon}</span>
              {cfg.label}
            </div>
          ))}
        {week?.weekendFull && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-rajdhani">
            <span className="text-sm">🔒</span>
            Capacity Full
          </div>
        )}
      </div>

      {/* Weekend capacity banner */}
      {week?.weekendFull && (
        <div className="bg-amber-950/60 border border-amber-800 border-l-4 border-l-amber-500 rounded px-4 py-3 mb-4 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">🔒</span>
          <div>
            <p className="font-rajdhani font-bold text-amber-400 text-sm">This weekend is at capacity</p>
            <p className="font-rajdhani text-amber-600 text-xs mt-0.5">
              {playerView
                ? `${week.gamesBooked} of 3 games are scheduled this weekend.`
                : `3 of 3 games are already scheduled. No further bookings are possible for this weekend. Please check another weekend.`}
            </p>
          </div>
        </div>
      )}

      {/* ── MOBILE: Day cards ── */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {week?.days.map((day, di) => {
          const openCount  = day.slots.filter(s => s.status === 'open').length
          const takenCount = day.slots.filter(s => s.status !== 'open').length
          const expanded   = expandedDays[day.date] ?? false
          const [dayName, dayNum, mon] = day.label.split(' ')

          return (
            <div key={day.date} className="bg-ink-3 border border-ink-5 rounded overflow-hidden animate-fade-up"
              style={{ animationDelay: `${di * 60}ms` }}>
              <button className="w-full flex items-center gap-3 p-3 text-left border-b border-ink-5"
                onClick={() => toggleDay(day.date)}>
                <div className="w-11 h-11 bg-ink-4 border border-gold-dim rounded flex flex-col items-center justify-center flex-shrink-0">
                  <span className="font-cinzel text-gold text-[8px] font-bold tracking-wider">{dayName}</span>
                  <span className="font-cinzel text-parchment text-lg font-bold leading-none">{dayNum}</span>
                  <span className="text-muted text-[9px] tracking-wide">{mon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-rajdhani font-bold text-base text-parchment">{day.label}</p>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {openCount  > 0 && !week?.weekendFull && <span className="slot-open text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-sm border">{openCount} open</span>}
                    {takenCount > 0 && <span className="slot-booked text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-sm border">{takenCount} taken</span>}
                    {week?.weekendFull && <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-sm border border-zinc-700 text-zinc-500">Weekend Full</span>}
                  </div>
                </div>
                <span className={`text-zinc-600 text-xl transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>⌄</span>
              </button>

              {expanded && (
                <div>
                  {day.slots.map((slot, si) => {
                    const cfg         = STATUS_CONFIG[slot.status]
                    const header      = SLOT_HEADERS[si]
                    const isLocked    = week?.weekendFull && slot.status !== 'booked' && slot.status !== 'soft_block' && slot.status !== 'clash'
                    const clashSource = slot.status === 'clash' ? getClashSource(slot.time as SlotTime, day.slots) : null
                    const arrowDir    = slot.status === 'clash' ? getArrowDirection(slot.time as SlotTime, clashSource, true) : null

                    return (
                      <div key={slot.time}
                        className={`flex items-center gap-3 px-4 py-3 border-b border-ink-4 last:border-0 ${slot.status === 'open' && !week?.weekendFull ? 'hover:bg-emerald-950/20' : ''}`}>
                        <div className="w-14 flex-shrink-0">
                          <p className="font-cinzel text-sm font-semibold text-parchment">{slot.time}</p>
                          <p className="text-[10px] text-zinc-600 font-rajdhani">{header.label}</p>
                        </div>
                        <div className="flex-1">
                          {/* Capacity full locked — just lock icon, no text */}
                          {isLocked ? (
                            <div className="flex items-center justify-center h-8 rounded bg-zinc-900 border border-zinc-800">
                              <span className="text-zinc-700 text-sm">🔒</span>
                            </div>
                          ) : slot.status === 'booked' && slot.cricheroes_url ? (
                            <a href={slot.cricheroes_url} target="_blank" rel="noopener noreferrer"
                              className={`flex flex-col ${cfg.pill} text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-sm border`}>
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                                {slot.tournament_name ?? (slot.opponent_name ? `vs ${slot.opponent_name}` : 'Booked')}
                              </span>
                              {slot.opponent_name && (
                                <span className="text-[9px] font-normal opacity-75 mt-0.5 pl-3">
                                  vs {slot.opponent_name}
                                </span>
                              )}
                            </a>
                          ) : slot.status === 'clash' ? (
                            <div className={`flex items-center gap-1.5 ${cfg.pill} text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-sm border`}>
                              {arrowDir && (
                                <span className="text-zinc-600 flex-shrink-0">
                                  <ArrowIcon direction={arrowDir} />
                                </span>
                              )}
                              <span className="text-zinc-600">Play in progress</span>
                            </div>
                          ) : (
                            <div className={`flex flex-col ${cfg.pill} text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-sm border`}>
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                                {slot.status === 'soft_block' ? 'Reserved' :
                                 slot.status === 'open' && playerView && !week?.weekendFull ? 'Scheduling in progress' :
                                 slot.status === 'booked' && slot.cricheroes_url
                                   ? [slot.opponent_name ? `vs ${slot.opponent_name}` : null, slot.tournament_name ? `@ ${slot.tournament_name}` : null].filter(Boolean).join(' ') || 'Booked'
                                   : cfg.label}
                              </span>
                              {slot.status === 'soft_block' && slot.reserved_until && (
                                <span className="text-[9px] font-normal opacity-70 mt-0.5 pl-3">
                                  {formatExpiryLabel(slot.reserved_until)}
                                </span>
                              )}
                              {slot.status === 'soft_block' && slot.tournament_name && (
                                <span className="text-[9px] font-normal text-yellow-700 opacity-75 mt-0.5 pl-3">
                                  {slot.tournament_name}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {slot.status === 'open' && slot.waLink && !week?.weekendFull && !playerView && (
                          <a href={slot.waLink} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 bg-[#128C7E] hover:bg-[#0d7a6e] text-white text-xs font-bold tracking-wide px-3 py-2 rounded transition-colors whitespace-nowrap">
                            <WAIcon /> Book
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── TABLET / DESKTOP: Grid table ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-600 py-2.5 px-4 bg-ink-3 border-b border-ink-5 w-28">Day</th>
              {SLOT_HEADERS.map(h => (
                <th key={h.time} className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-600 py-2.5 px-2 bg-ink-3 border-b border-ink-5 text-center w-1/4">
                  {h.time}<br />
                  <span className="text-[9px] text-zinc-700 font-normal normal-case tracking-normal">{h.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week?.days.map((day) => {
              const [dayName, dayNum, mon] = day.label.split(' ')
              return (
                <tr key={day.date}>
                  <td className="bg-ink-3 border-r border-ink-5 border-b border-ink-4 px-4 py-3">
                    <p className="font-cinzel text-xs text-gold font-semibold">{dayName}</p>
                    <p className="font-rajdhani text-sm text-muted">{dayNum} {mon}</p>
                  </td>
                  {day.slots.map((slot) => {
                    const cfg         = STATUS_CONFIG[slot.status]
                    const isLocked    = week?.weekendFull && slot.status !== 'booked' && slot.status !== 'soft_block' && slot.status !== 'clash'
                    const clashSource = slot.status === 'clash' ? getClashSource(slot.time as SlotTime, day.slots) : null
                    const arrowDir    = slot.status === 'clash' ? getArrowDirection(slot.time as SlotTime, clashSource, false) : null

                    return (
                      <td key={slot.time} className="p-1.5 border-b border-ink-4 w-1/4">
                        {/* Capacity full locked — just lock icon */}
                        {isLocked ? (
                          <div className="flex items-center justify-center h-16 rounded bg-zinc-900 border border-zinc-800">
                            <span className="text-zinc-700 text-lg">🔒</span>
                          </div>
                        ) : slot.status === 'open' && slot.waLink && !week?.weekendFull && !playerView ? (
                          <a href={slot.waLink} target="_blank" rel="noopener noreferrer"
                            className={`flex flex-col items-center justify-center gap-1 h-16 rounded ${cfg.gridCls} group`}
                            title="Click to WhatsApp about this slot">
                            <span className="text-lg group-hover:scale-110 transition-transform">{cfg.icon}</span>
                            <span className="font-rajdhani text-[11px] font-bold tracking-wide text-emerald-400">{cfg.gridLabel}</span>
                          </a>
                        ) : slot.status === 'open' && playerView && !week?.weekendFull ? (
                          <div className="flex flex-col items-center justify-center gap-1 h-16 rounded bg-ink-3 border border-ink-5">
                            <span className="font-rajdhani text-[10px] text-zinc-600 text-center px-1">Scheduling in progress</span>
                          </div>
                        ) : slot.status === 'clash' ? (
                          <div className={`flex flex-col items-center justify-center gap-1 h-16 rounded ${cfg.gridCls}`}>
                            <div className="flex items-center gap-1.5 text-zinc-600">
                              {arrowDir && <ArrowIcon direction={arrowDir} />}
                              <span className="font-rajdhani text-[10px] font-bold tracking-wide text-center leading-tight">
                                Play in<br />progress
                              </span>
                              {arrowDir === 'right' && <ArrowIcon direction={arrowDir} />}
                            </div>
                          </div>
                        ) : slot.status === 'booked' && slot.cricheroes_url ? (
                          <a href={slot.cricheroes_url} target="_blank" rel="noopener noreferrer"
                            className={`flex flex-col items-center justify-center gap-0.5 h-16 px-1 rounded ${cfg.gridCls} hover:border-red-700 transition-colors`}
                            title="View match on CricHeroes">
                            <span className="text-lg">🏏</span>
                            {slot.tournament_name && (
                              <span className="font-rajdhani text-[10px] font-bold tracking-wide text-red-400 text-center w-full px-1 truncate">
                                {slot.tournament_name}
                              </span>
                            )}
                            {slot.opponent_name && (
                              <span className="font-rajdhani text-[9px] text-red-300 opacity-75 text-center w-full px-1 truncate">
                                vs {slot.opponent_name}
                              </span>
                            )}
                            {!slot.opponent_name && !slot.tournament_name && (
                              <span className="font-rajdhani text-[10px] font-bold tracking-wide text-red-400 text-center w-full px-1">
                                Booked
                              </span>
                            )}
                          </a>
                        ) : (
                          <div className={`flex flex-col items-center justify-center gap-0.5 h-16 rounded ${cfg.gridCls}`}>
                            <span className="text-lg">{cfg.icon}</span>
                            <span className="font-rajdhani text-[11px] font-bold tracking-wide text-center px-1 flex flex-col items-center">
                              <span className={
                                slot.status === 'booked'     ? 'text-red-500'    :
                                slot.status === 'soft_block' ? 'text-yellow-500' :
                                'text-zinc-700'}>
                                {slot.status === 'soft_block' ? 'Reserved' : cfg.gridLabel}
                              </span>
                              {slot.status === 'soft_block' && slot.reserved_until && (
                                <span className="text-[9px] font-normal text-yellow-600 opacity-80 mt-0.5">
                                  {formatExpiryLabel(slot.reserved_until)}
                                </span>
                              )}
                              {slot.status === 'soft_block' && slot.tournament_name && (
                                <span className="text-[9px] font-normal text-yellow-700 opacity-75 text-center leading-tight px-1 truncate w-full">
                                  {slot.tournament_name}
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* CTA — organiser schedule only */}
      {!playerView && (
        <div className="mt-7 bg-gradient-to-br from-ink-3 to-ink-2 border border-gold-dim rounded p-5 lg:flex lg:items-center lg:gap-6 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)' }} />
          <div className="flex items-start gap-4 mb-4 lg:mb-0 lg:flex-1">
            <span className="text-3xl flex-shrink-0">🏏</span>
            <div>
              <h3 className="font-cinzel text-gold text-sm font-semibold mb-1">Found a slot that works?</h3>
              <p className="font-rajdhani text-zinc-500 text-sm leading-relaxed">
                Tap below to WhatsApp us directly. We'll confirm your game within a few hours. No forms, no email chains.
              </p>
            </div>
          </div>
          <div className="lg:flex-shrink-0">
            <a href={buildGenericWhatsAppLink()} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full lg:w-auto bg-[#25D366] hover:bg-[#1aaa52] text-white font-rajdhani font-bold text-sm tracking-widest uppercase px-6 py-3.5 rounded transition-colors">
              <WAIcon size={18} /> WhatsApp Us to Book
            </a>
            <p className="font-rajdhani text-xs text-zinc-700 mt-1.5 text-center lg:text-left italic">
              Opens with a pre-filled message including your chosen slot
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function WAIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

function ScheduleGridSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[0, 1].map(i => (
        <div key={i} className="h-20 bg-ink-3 rounded border border-ink-5" />
      ))}
    </div>
  )
}
