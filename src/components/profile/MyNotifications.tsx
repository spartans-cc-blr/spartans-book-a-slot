'use client'

// "My Notifications" — per-player choices for which alerts to receive.
// Everything is on by default; a switch writes enabled=false/true for one key.
// Squad announcements and wallet alerts are locked on. Enforcement is
// server-side (see notificationPrefs.ts / notificationPrefsServer.ts).

import { useCallback, useEffect, useState } from 'react'
import { LOCKED_GROUPS, PREF_DEFS, PREF_GROUPS, tournamentPrefKey } from '@/lib/notificationPrefs'

type Tournament = { id: string; name: string }

function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? 'bg-amber-600 dark:bg-gold' : 'bg-stone-300 dark:bg-ink-5'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function MyNotifications() {
  const [muted, setMuted] = useState<Set<string>>(new Set())
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/notification-preferences')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('load failed')))
      .then(d => { setMuted(new Set(d.muted)); setTournaments(d.tournaments ?? []); setLoaded(true) })
      .catch(() => setError('Could not load your notification settings.'))
  }, [])

  // Optimistic: flip locally, persist, roll back on failure.
  const change = useCallback(async (keys: string[], enabled: boolean) => {
    const prev = muted
    const next = new Set(muted)
    keys.forEach(k => (enabled ? next.delete(k) : next.add(k)))
    setMuted(next); setError('')
    try {
      const res = await fetch('/api/notification-preferences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: keys.map(key => ({ key, enabled })) }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setMuted(prev); setError('Could not save that change. Try again.')
    }
  }, [muted])

  if (!loaded) return <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mt-4">{error || 'Loading your notification settings…'}</p>

  const rowText = 'font-rajdhani text-sm text-[#44403C] dark:text-zinc-300'
  const hintText = 'font-rajdhani text-[11px] text-[#78716C] dark:text-zinc-500'

  return (
    <div className="mt-5 pt-4 border-t border-[#D4C9B0] dark:border-ink-5 space-y-3">
      <h3 className="font-cinzel text-sm text-amber-700 dark:text-gold font-semibold">My Notifications</h3>
      <p className={hintText}>Choose what you hear about. Applies to all your devices.</p>
      {error && <p className="font-rajdhani text-[11px] text-crimson">{error}</p>}

      {PREF_GROUPS.map(g => {
        const locked = LOCKED_GROUPS.has(g.id)
        const defs = PREF_DEFS.filter(d => d.group === g.id)
        // Master switch governs the group's own keys ('newmatch' for that group).
        const groupKeys = defs.map(d => d.key)
        const allOn = groupKeys.every(k => !muted.has(k))
        const isOpen = !!open[g.id]
        const tournamentsOn = g.id === 'newmatch' && !muted.has('newmatch')

        return (
          <div key={g.id} className="rounded border border-[#D4C9B0] dark:border-ink-5 p-3">
            <div className="flex items-center justify-between gap-3">
              <button type="button" className="text-left flex-1" onClick={() => !locked && setOpen(o => ({ ...o, [g.id]: !isOpen }))} disabled={locked}>
                <span className={`${rowText} font-semibold`}>{g.title}{!locked && <span className="ml-1 text-[#78716C]">{isOpen ? '▾' : '▸'}</span>}</span>
                <span className={`block ${hintText}`}>{locked ? `${g.blurb} Always on.` : g.blurb}</span>
              </button>
              <Switch on={locked ? true : allOn} disabled={locked} label={`${g.title} (all)`} onChange={v => change(groupKeys, v)} />
            </div>

            {!locked && isOpen && g.id !== 'newmatch' && (
              <div className="mt-3 space-y-2.5">
                {defs.map(d => (
                  <div key={d.key} className="flex items-center justify-between gap-3">
                    <span><span className={rowText}>{d.label}</span>{d.hint && <span className={`block ${hintText}`}>{d.hint}</span>}</span>
                    <Switch on={!muted.has(d.key)} label={d.label} onChange={v => change([d.key], v)} />
                  </div>
                ))}
              </div>
            )}

            {!locked && isOpen && g.id === 'newmatch' && (
              <div className="mt-3 space-y-2.5">
                <p className={hintText}>Tournaments you follow (all by default):</p>
                {tournaments.length === 0 && <p className={hintText}>No active tournaments right now.</p>}
                {tournaments.map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-3">
                    <span className={rowText}>{t.name}</span>
                    <Switch on={tournamentsOn && !muted.has(tournamentPrefKey(t.id))} disabled={!tournamentsOn} label={`Follow ${t.name}`} onChange={v => change([tournamentPrefKey(t.id)], v)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
