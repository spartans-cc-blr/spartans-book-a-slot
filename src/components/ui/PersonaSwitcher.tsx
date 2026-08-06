'use client'
import { useState } from 'react'
import { PERSONA_META, type Persona } from '@/lib/personas'

interface Props {
  persona:       Persona
  selectPersona: (p: Persona) => void
  available:     Persona[]
}

// Desktop pill + dropdown, mounted next to the profile avatar in SiteNav
// and (as its own small client wrapper) in the admin top bar. Hidden
// entirely when the account only ever qualifies for one persona — most
// players never see this control.
export function PersonaSwitcher({ persona, selectPersona, available }: Props) {
  const [open, setOpen] = useState(false)
  if (available.length <= 1) return null
  const current = PERSONA_META[persona]

  return (
    <div className="relative ml-2" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 font-rajdhani text-[11px] font-bold tracking-wide uppercase text-gold border border-gold-dim rounded-full pl-2.5 pr-2 py-1 hover:bg-gold/10 transition-colors">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: current.color }} />
        Viewing as: {current.label}
        <span className="text-[8px] mt-0.5">▾</span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-9 w-64 bg-ink-2 border border-ink-5 rounded shadow-xl z-50">
          {available.map(key => {
            const meta     = PERSONA_META[key]
            const isActive = key === persona
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => { selectPersona(key); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left font-rajdhani text-xs font-semibold tracking-wide uppercase border-b border-ink-5 last:border-b-0 transition-colors
                  ${isActive ? 'bg-gold/10 text-gold' : 'text-zinc-400 hover:text-gold hover:bg-ink-3'}`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{meta.label}</span>
                  <span className="block font-normal normal-case tracking-normal text-[10px] text-zinc-600 truncate">
                    {meta.hint}
                  </span>
                </span>
                {isActive && <span className="text-gold flex-shrink-0">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Mobile drawer equivalent — a row of chips instead of a dropdown, same
// controlled state as the desktop pill above.
export function PersonaChipRow({ persona, selectPersona, available }: Props) {
  if (available.length <= 1) return null

  return (
    <div className="pt-1 pb-3 border-b border-ink-4">
      <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-zinc-700 pb-2">
        Viewing as
      </p>
      <div className="flex flex-wrap gap-2">
        {available.map(key => {
          const meta     = PERSONA_META[key]
          const isActive = key === persona
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectPersona(key)}
              className={`font-rajdhani text-[11px] font-bold tracking-wide uppercase px-3 py-1.5 rounded-full border transition-colors
                ${isActive ? 'text-ink' : 'text-zinc-400 border-ink-5 hover:text-gold'}`}
              style={isActive ? { background: meta.color, borderColor: meta.color } : undefined}>
              {meta.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
