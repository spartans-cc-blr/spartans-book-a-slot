'use client'

// Wrangler-only affordance: generates a direct link to
// /matches/history/[bookingId] for this match's resolved top performer(s),
// pre-filled with a congratulatory WhatsApp message asking them to verify
// the scorecard (or flag anything wrong) — see matchTopPerformers.ts for
// how "top performer" is computed and scorecardAuth.ts for how that same
// resolution grants them the actual verify/flag permission server-side.
// Visibility (isWrangler || isAdmin) is entirely the caller's
// responsibility; this component renders unconditionally once mounted.

import { useState } from 'react'
import { WA_ICON, SHARE_ICON } from '@/components/tournament-planner/TournamentShareButton'

export interface TopPerformerInfo {
  player_id: string | null
  name:      string
  reason:    'top_scorer' | 'top_wicket_taker'
  statLine:  string
}

function buildMessage(performer: TopPerformerInfo, url: string): string {
  const congrats = performer.reason === 'top_scorer'
    ? `🏆 Great knock, ${performer.name}! ${performer.statLine} today 🔥`
    : `🏆 Great spell, ${performer.name}! ${performer.statLine} today 👏`
  return `${congrats}\n\nSince you were today's standout with the ${performer.reason === 'top_scorer' ? 'bat' : 'ball'}, could you spare a minute to check the scorecard matches CricHeroes and mark it verified (or flag anything that looks off)?\n\n${url}`
}

// Dedupes by player_id so a genuine all-rounder who tops both batting and
// bowling gets one combined entry instead of two separate share rows.
function dedupePerformers(performers: TopPerformerInfo[]): TopPerformerInfo[] {
  const byPlayer = new Map<string, TopPerformerInfo>()
  for (const p of performers) {
    if (!p.player_id) continue
    const existing = byPlayer.get(p.player_id)
    if (!existing) { byPlayer.set(p.player_id, p); continue }
    byPlayer.set(p.player_id, {
      ...existing,
      statLine: `${existing.statLine} & ${p.statLine}`,
    })
  }
  return Array.from(byPlayer.values())
}

function PerformerRow({ bookingId, performer }: { bookingId: string; performer: TopPerformerInfo }) {
  const [copied, setCopied] = useState(false)

  function url() {
    return `${window.location.origin}/matches/history/${bookingId}`
  }

  function openWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildMessage(performer, url()))}`, '_blank')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '4px 0' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#F5F5F5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {performer.reason === 'top_scorer' ? '🏏' : '🎳'} {performer.name}
        </p>
        <p style={{ fontSize: '10px', color: '#6B7280' }}>{performer.statLine}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <button onClick={openWhatsApp} title="Share via WhatsApp"
          className="text-emerald-400 hover:text-emerald-300 transition-colors">
          {WA_ICON}
        </button>
        <button onClick={copyLink} title="Copy link"
          className="font-rajdhani text-[10px] font-bold text-zinc-400 hover:text-zinc-200 transition-colors">
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}

export function PerformerShareButton({ bookingId, performers }: { bookingId: string; performers: TopPerformerInfo[] }) {
  const [open, setOpen] = useState(false)
  const resolved = dedupePerformers(performers)

  if (resolved.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        className="font-rajdhani text-[10px] font-bold tracking-wide text-blue-400 hover:text-blue-300 transition-colors">
        <span style={{ display: 'inline-flex' }}>{SHARE_ICON}</span> Share for verification
      </button>
      {open && (
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid #2D3748', borderRadius: '8px', padding: '4px 10px' }}>
          {resolved.map(p => <PerformerRow key={p.player_id} bookingId={bookingId} performer={p} />)}
        </div>
      )}
    </div>
  )
}
