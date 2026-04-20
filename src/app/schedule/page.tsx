'use client'

import { useEffect, useState, useMemo } from 'react'
import type { WeekAvailability, SlotTime, GameFormat } from '@/types'
import { SiteNav } from '@/components/ui/SiteNav'

// ── Organiser slot format rules ───────────────────────────────────
// Different from internal SLOT_FORMATS — business rules for organisers
const ORGANISER_FORMATS: Record<SlotTime, GameFormat[]> = {
  '07:30': ['T20', 'T30'],
  '10:30': ['T20'],
  '12:30': ['T30'],
  '14:30': ['T20'],
}

const SLOT_DISPLAY: Record<SlotTime, string> = {
  '07:30': '7:30 AM',
  '10:30': '10:30 AM',
  '12:30': '12:30 PM',
  '14:30': '2:30 PM',
}

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER ?? '919900000000'

function buildWALink(date: string, slot: SlotTime, format: GameFormat): string {
  const text = encodeURIComponent(
    `Hi Spartans! I'd like to enquire about booking the ${SLOT_DISPLAY[slot]} slot on ${date} for a ${format} match. Please confirm availability. Thank you!`
  )
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`
}

// ── Slot Card ─────────────────────────────────────────────────────
function SlotCard({
  date,
  slot,
  availableFormats,
  defaultFormat,
}: {
  date: string
  slot: SlotTime
  availableFormats: GameFormat[]
  defaultFormat: GameFormat | null
}) {
  const [selectedFormat, setSelectedFormat] = useState<GameFormat | null>(
    defaultFormat ?? (availableFormats.length === 1 ? availableFormats[0] : null)
  )

  // When defaultFormat changes (filter changed), update selection
  useEffect(() => {
    if (defaultFormat) setSelectedFormat(defaultFormat)
    else if (availableFormats.length === 1) setSelectedFormat(availableFormats[0])
    else setSelectedFormat(null)
  }, [defaultFormat, availableFormats])

  const waLink = selectedFormat ? buildWALink(date, slot, selectedFormat) : null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1C2333 0%, #111827 100%)',
      border: '1px solid #2D3748',
      borderRadius: '12px',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      {/* Green top accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #16a34a, #4ade80, #16a34a)' }} />

      {/* Slot time + Available badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#F9FAFB', fontFamily: "'DM Sans', sans-serif" }}>
          {SLOT_DISPLAY[slot]}
        </span>
        <span style={{
          background: '#14532d', color: '#4ade80',
          fontSize: '10px', fontWeight: 700,
          padding: '2px 10px', borderRadius: '999px',
          letterSpacing: '0.08em', border: '1px solid #16a34a'
        }}>AVAILABLE</span>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: '#2D3748' }} />

      {/* Format left + WhatsApp icon right — same row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Format toggles */}
        <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
          {availableFormats.map(f => (
            <button key={f} onClick={() => setSelectedFormat(f)}
              style={{
                flex: 1, padding: '7px', borderRadius: '8px', border: '1px solid',
                borderColor: selectedFormat === f ? '#C9A84C' : '#374151',
                background: selectedFormat === f ? 'rgba(201,168,76,0.1)' : '#1F2937',
                color: selectedFormat === f ? '#C9A84C' : '#6B7280',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* WhatsApp icon button */}
        <a
          href={waLink ?? '#'}
          onClick={e => { if (!waLink) e.preventDefault() }}
          target="_blank"
          rel="noopener noreferrer"
          title={waLink ? 'WhatsApp to Book' : 'Select a format first'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '7px 14px', borderRadius: '8px', flexShrink: 0,
            background: waLink ? '#16a34a' : '#1F2937',
            color: waLink ? 'white' : '#4B5563',
            fontSize: '12px', fontWeight: 700,
            textDecoration: 'none', transition: 'all 0.15s',
            cursor: waLink ? 'pointer' : 'not-allowed',
            border: waLink ? '1px solid #16a34a' : '1px solid #374151',
            fontFamily: "'DM Sans', sans-serif",
            whiteSpace: 'nowrap',
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.116 1.522 5.847L.057 23.882l6.197-1.625A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-5.003-1.368l-.36-.213-3.677.964.981-3.595-.234-.369A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
          </svg>
          Book
        </a>
      </div>
    </div>
  )
}

// ── Filter Toggle Button ──────────────────────────────────────────
function FilterToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '6px 12px', borderRadius: '8px',
      border: `1px solid ${checked ? '#C9A84C' : '#374151'}`,
      background: checked ? 'rgba(201,168,76,0.1)' : '#1F2937',
      color: checked ? '#C9A84C' : '#6B7280',
      fontSize: '12px', fontWeight: 700, cursor: 'pointer',
      fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
    }}>
      <span style={{
        width: '14px', height: '14px', borderRadius: '3px', border: `1px solid ${checked ? '#C9A84C' : '#4B5563'}`,
        background: checked ? '#C9A84C' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '9px', color: '#111827', fontWeight: 900, flexShrink: 0,
      }}>{checked ? '✓' : ''}</span>
      {label}
    </button>
  )
}

// ── CSV Export ────────────────────────────────────────────────────
function exportCSV(
  weeks: WeekAvailability[],
  formatFilter: Record<GameFormat, boolean>,
  slotFilter: Record<SlotTime, boolean>
) {
  const rows: string[][] = [['Date', 'Day', 'Slot Time', 'Format', 'WhatsApp Link']]
  const todayStr = new Date().toISOString().split('T')[0]  // 'YYYY-MM-DD'

  weeks.forEach(week => {
    week.days.forEach(day => {
		if (day.date < todayStr) return   // skip past dates
      day.slots.forEach(slot => {
        if (slot.status !== 'open') return
        if (!slotFilter[slot.time]) return

        const formats = ORGANISER_FORMATS[slot.time].filter(f => formatFilter[f])
        if (formats.length === 0) return

        const dayLabel = new Date(day.date).toLocaleDateString('en-IN', { weekday: 'long' })
        const dateLabel = new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

        formats.forEach(f => {
          const waLink = buildWALink(day.label, slot.time, f)
          rows.push([dateLabel, dayLabel, SLOT_DISPLAY[slot.time], f, waLink])
        })
      })
    })
  })

  const csv = rows.map(r => r.map(cell => `"${cell}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spartans-available-slots-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main Page ─────────────────────────────────────────────────────
export default function SchedulePage() {
  const [weeks, setWeeks] = useState<WeekAvailability[]>([])
  const [loading, setLoading] = useState(true)

  const [formatFilter, setFormatFilter] = useState<Record<GameFormat, boolean>>({ T20: true, T30: true })
  const [slotFilter,   setSlotFilter]   = useState<Record<SlotTime, boolean>>({
    '07:30': true, '10:30': true, '12:30': true, '14:30': true,
  })
  const [filterOpen,   setFilterOpen]   = useState(false)

  useEffect(() => {
    fetch('/api/availability?weeks=13')
      .then(r => r.json())
      .then(d => { setWeeks(d.weeks ?? []); setLoading(false) })
  }, [])

  function resetFilters() {
    setFormatFilter({ T20: true, T30: true })
    setSlotFilter({ '07:30': true, '10:30': true, '12:30': true, '14:30': true })
  }

  const isDefault = formatFilter.T20 && formatFilter.T30 &&
    Object.values(slotFilter).every(Boolean)

  // Derive single format if only one selected — used to pre-select on cards
  const singleFormat: GameFormat | null =
    formatFilter.T20 && !formatFilter.T30 ? 'T20' :
    !formatFilter.T20 && formatFilter.T30 ? 'T30' : null

  // Filter weeks — skip full weekends entirely, only show truly open slots
  // Double-check with gamesBooked >= 3 as safety net in case weekendFull flag is stale
  const filteredWeeks = useMemo(() => {
    return weeks
      .filter(week => !week.weekendFull && week.gamesBooked < 3)
      .map(week => ({
        ...week,
        days: week.days.map(day => ({
          ...day,
          slots: day.slots.filter(slot => {
            if (slot.status !== 'open') return false
            if (!slotFilter[slot.time]) return false
            const formats = ORGANISER_FORMATS[slot.time].filter(f => formatFilter[f])
            return formats.length > 0
          }),
        })).filter(day => day.slots.length > 0),
      })).filter(week => week.days.some(d => d.slots.length > 0))
  }, [weeks, formatFilter, slotFilter])

  const totalSlots = filteredWeeks.reduce((acc, w) => acc + w.days.reduce((a, d) => a + d.slots.length, 0), 0)
  const noFormats  = !formatFilter.T20 && !formatFilter.T30
  const noSlots    = !Object.values(slotFilter).some(Boolean)

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
          Open slots for the next 3 months. Select your format and tap WhatsApp to enquire.
        </p>
      </div>

      {/* Filter bar */}
      <div className="px-5 md:px-8 lg:px-10 py-3 border-b border-ink-4 bg-ink-2 relative">
        <div className="flex items-center gap-3">
          {/* Filter button */}
          <button onClick={() => setFilterOpen(v => !v)}
            className={`font-rajdhani text-xs font-bold tracking-wide px-4 py-2 rounded border transition-colors flex items-center gap-2
              ${!isDefault ? 'border-gold text-gold bg-gold/10' : 'border-ink-5 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'}`}>
            ⚙ Filters {!isDefault && <span className="bg-gold text-ink text-[9px] font-black px-1.5 py-0.5 rounded-full">ON</span>}
          </button>

          {/* Reset — only when filters active */}
          {!isDefault && (
            <button onClick={resetFilters}
              className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2">
              Reset
            </button>
          )}

          {/* Download */}
          <button onClick={() => exportCSV(weeks, formatFilter, slotFilter)}
            className="ml-auto font-rajdhani text-xs font-bold tracking-wide border border-gold-dim text-gold hover:bg-gold/10 px-4 py-2 rounded transition-colors flex items-center gap-2">
            ⬇ Export Available Slots
          </button>
        </div>

        {/* Dropdown panel */}
        {filterOpen && (
          <div className="absolute left-0 right-0 top-full z-40 bg-ink-2 border-b border-ink-5 px-5 md:px-8 lg:px-10 py-4 shadow-lg">
            <div className="flex flex-col gap-4 max-w-lg">
              {/* Format */}
              <div>
                <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 mb-2">Format</p>
                <div className="flex gap-2">
                  <FilterToggle label="T20" checked={formatFilter.T20} onChange={() => setFormatFilter(f => ({ ...f, T20: !f.T20 }))} />
                  <FilterToggle label="T30" checked={formatFilter.T30} onChange={() => setFormatFilter(f => ({ ...f, T30: !f.T30 }))} />
                </div>
              </div>
              {/* Slots */}
              <div>
                <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 mb-2">Time Slots</p>
                <div className="flex gap-2 flex-wrap">
                  {(['07:30', '10:30', '12:30', '14:30'] as SlotTime[]).map(t => (
                    <FilterToggle key={t} label={SLOT_DISPLAY[t]} checked={slotFilter[t]}
                      onChange={() => setSlotFilter(f => ({ ...f, [t]: !f[t] }))} />
                  ))}
                </div>
              </div>
              {/* Done button */}
              <div className="flex items-center gap-3">
                {!isDefault && (
                  <button onClick={() => { resetFilters(); setFilterOpen(false) }}
                    className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2">
                    Reset filters
                  </button>
                )}
                <button onClick={() => setFilterOpen(false)}
                  className="ml-auto font-rajdhani text-xs font-bold tracking-wide bg-gold/10 border border-gold text-gold px-4 py-2 rounded transition-colors">
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-5 md:px-8 lg:px-10 py-6">
        {loading && (
          <p className="font-rajdhani text-zinc-500 text-sm">Loading available slots...</p>
        )}

        {!loading && (noFormats || noSlots) && (
          <div className="bg-ink-3 border border-ink-5 rounded p-6 text-center">
            <p className="font-rajdhani text-zinc-500 text-sm">Select at least one format and one slot to see availability.</p>
            <button onClick={resetFilters} className="font-rajdhani text-xs text-gold hover:underline mt-2">Reset filters</button>
          </div>
        )}

        {!loading && !noFormats && !noSlots && filteredWeeks.length === 0 && (
          <div className="bg-ink-3 border border-ink-5 rounded p-6 text-center">
            <p className="font-rajdhani text-zinc-500 text-sm">No available slots match your current filters.</p>
            <button onClick={resetFilters} className="font-rajdhani text-xs text-gold hover:underline mt-2">Reset filters</button>
          </div>
        )}

        {!loading && filteredWeeks.length > 0 && (
          <div className="space-y-8">
            {/* Slot count summary */}
            <p className="font-rajdhani text-xs text-zinc-600">
              {totalSlots} slot{totalSlots !== 1 ? 's' : ''} available across {filteredWeeks.length} weekend{filteredWeeks.length !== 1 ? 's' : ''}
            </p>

            {filteredWeeks.map(week => (
              <div key={week.weekStart}>
                {/* Weekend header */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-cinzel text-sm font-semibold text-gold">{week.label}</span>
                  <span className="font-rajdhani text-xs text-zinc-600">
                    {week.gamesBooked > 0 ? `${week.gamesBooked} game${week.gamesBooked > 1 ? 's' : ''} already booked this weekend` : ''}
                  </span>
                  <div className="flex-1 h-px bg-ink-5" />
                </div>

                {week.days.map(day => (
                  <div key={day.date} className="mb-5">
                    {/* Day label */}
                    <p className="font-rajdhani text-xs font-bold tracking-[2px] uppercase text-zinc-600 mb-3">
                      {day.label}
                    </p>

                    {/* Cards grid — 1 col mobile, 2 col desktop */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                      {day.slots.map(slot => {
                        const availableFormats = ORGANISER_FORMATS[slot.time].filter(f => formatFilter[f])
                        return (
                          <SlotCard
                            key={slot.time}
                            date={day.label}
                            slot={slot.time}
                            availableFormats={availableFormats}
                            defaultFormat={singleFormat && availableFormats.includes(singleFormat) ? singleFormat : null}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
