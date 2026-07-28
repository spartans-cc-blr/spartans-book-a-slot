'use client'

// Wrangler-only affordance: generates a direct link to
// /matches/history/[bookingId] for this match's resolved top performer(s),
// pre-filled with a WhatsApp message addressed to them by name, naming the
// match date and tournament, and asking them to verify the scorecard (or
// flag anything wrong) — see matchTopPerformers.ts for how "top performer"
// is computed and scorecardAuth.ts for how that same resolution grants
// them the actual verify/flag permission server-side. Visibility
// (isWrangler || isAdmin) is entirely the caller's responsibility; this
// component renders unconditionally once mounted.

import { useState } from 'react'
import { WA_ICON } from '@/components/tournament-planner/TournamentShareButton'

export interface TopPerformerInfo {
  player_id: string | null
  name:      string
  reason:    'top_scorer' | 'top_wicket_taker'
  statLine:  string
  // Redacted to null server-side for any viewer who isn't a wrangler/admin
  // — see the whatsapp field on /api/matches/history's top_performers.
  whatsapp:  string | null
}

// Same short-date convention as availability-nudge.md's design constraint
// ("Sun 19 Jul", never "today"/"this weekend") — a wrangler could easily be
// sending this a day or two after the match, so the date needs to be named
// explicitly rather than assumed to mean "today".
function formatMatchDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// First name only — "Hi Kushal," reads as a person addressing them, not a
// database field. Trims first in case a name was saved with leading/
// trailing whitespace.
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0]
}

// Pure — no window access, so it's safe to call during render for the
// on-screen preview (see PerformerRow). The URL is appended separately by
// buildMessage() only inside the click handlers, where window.location is
// actually available.
function buildMessageText(performer: TopPerformerInfo, gameDate: string, tournamentName: string | null): string {
  const activity = performer.reason === 'top_scorer' ? 'knock' : 'spell'
  const occasion = tournamentName
    ? `in ${tournamentName} on ${formatMatchDate(gameDate)}`
    : `on ${formatMatchDate(gameDate)}`
  return `Hi ${firstName(performer.name)},\n\n🏆 Great ${activity} ${occasion}! ${performer.statLine} — well played 👏\n\nEven as you relive the moment, could you help us out by checking the *full match scorecard* on the Hub against CricHeroes — not just your own numbers — and mark it verified (or flag anything that looks off)?`
}

function buildMessage(performer: TopPerformerInfo, gameDate: string, tournamentName: string | null, url: string): string {
  return `${buildMessageText(performer, gameDate, tournamentName)}\n\n${url}`
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

function PerformerRow({ bookingId, performer, gameDate, tournamentName }: {
  bookingId:      string
  performer:      TopPerformerInfo
  gameDate:       string
  tournamentName: string | null
}) {
  function url() {
    return `${window.location.origin}/matches/history/${bookingId}`
  }

  // Opens WhatsApp addressed directly to the performer's own number
  // (players.whatsapp) rather than the destination-free wa.me/?text=...
  // pattern used elsewhere in this app — this message is only ever meant
  // for this one person, unlike a group nudge where the sender picks the
  // recipient. Falls back to the destination-free link when the player
  // has no WhatsApp number on file, so the button still does something
  // useful rather than being silently dead.
  function openWhatsApp() {
    const digits = performer.whatsapp?.replace(/\D/g, '') || null
    const text = encodeURIComponent(buildMessage(performer, gameDate, tournamentName, url()))
    window.open(digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid #1F2937' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#F5F5F5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {performer.reason === 'top_scorer' ? '🏏' : '🎳'} {performer.name}
          </p>
          <p style={{ fontSize: '10px', color: '#6B7280' }}>{performer.statLine}</p>
        </div>
        <button onClick={openWhatsApp} style={{ flexShrink: 0 }}
          title={performer.whatsapp ? `Send to ${performer.name} on WhatsApp` : 'Send via WhatsApp (no number on file — pick a recipient)'}
          className="text-emerald-400 hover:text-emerald-300 transition-colors">
          {WA_ICON}
        </button>
      </div>
      {/* Message preview — what actually goes out via WhatsApp, minus the
          link itself (which needs window.location, only available inside
          the click handler above, not safe to read during render). Shown
          so the wrangler can see the personalised text before sending it,
          not just the performer's name and stat line. */}
      <p style={{ fontSize: '10px', color: '#9CA3AF', fontStyle: 'italic', whiteSpace: 'pre-line', marginTop: '4px', lineHeight: 1.4 }}>
        “{buildMessageText(performer, gameDate, tournamentName)}”
      </p>
    </div>
  )
}

export function PerformerShareButton({ bookingId, performers, gameDate, tournamentName }: {
  bookingId:      string
  performers:     TopPerformerInfo[]
  gameDate:       string
  tournamentName: string | null
}) {
  const [open, setOpen] = useState(false)
  const resolved = dedupePerformers(performers)

  if (resolved.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        className="font-rajdhani text-[10px] font-bold tracking-wide text-blue-400 hover:text-blue-300 transition-colors">
        Request top performer to verify
      </button>
      {open && (
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid #2D3748', borderRadius: '8px', padding: '4px 10px' }}>
          {resolved.map(p => (
            <PerformerRow key={p.player_id} bookingId={bookingId} performer={p} gameDate={gameDate} tournamentName={tournamentName} />
          ))}
        </div>
      )}
    </div>
  )
}
