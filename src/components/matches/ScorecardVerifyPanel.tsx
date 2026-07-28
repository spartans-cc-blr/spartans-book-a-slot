'use client'

// Shared verify/reconciliation UI — used by both MatchHistoryClient's list
// card and the standalone /matches/history/[bookingId] share page, so the
// two surfaces can never drift on what a "verify this scorecard" action
// looks like. Deliberately takes a minimal match shape (VerifiableMatch)
// rather than the list page's full MatchSummary — the standalone page has
// no list state to patch, so onPatch is a plain local-state setter there
// instead of MatchHistoryClient's onMatchPatch(bookingId, patch).

import { useState } from 'react'

export interface VerifiableMatch {
  booking_id:            string
  cricheroes_url:        string | null
  needs_reconciliation:  boolean
  reconciliation_note:   string | null
}

export interface VerifyPatch {
  verified?:             boolean
  needs_reconciliation?: boolean
  reconciliation_note?:  string | null
}

export function CricHeroesIcon({ size = 20 }: { size?: number }) {
  return (
    <img src="/cricheroes-logo.jpg" alt="CricHeroes" width={size} height={size}
      style={{ borderRadius: '50%', objectFit: 'cover' }} />
  )
}

// The one real, clickable CricHeroes icon reused inline wherever a verify
// line references it (VerifiedStatusLine below, and the action line in
// ReconciliationControls) — opens the match's cricheroes_url in a new tab,
// independent of whatever verify/notify action sits next to it. Renders a
// plain, non-interactive icon when there's no URL to link to.
export function CricHeroesInlineLink({ url, size = 16 }: { url: string | null; size?: number }) {
  const icon = <CricHeroesIcon size={size} />
  if (!url) return icon
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Open in CricHeroes" style={{ display: 'inline-flex', lineHeight: 0 }}>
      {icon}
    </a>
  )
}

// Scalloped-seal "verified" badge — the familiar shape from Twitter/X and
// similar platforms (two overlapping rounded squares offset 45° to form an
// 8-point rosette, with a checkmark inside) rather than a bare tick, so a
// verified match reads as a distinct status badge, not just a checked box.
export function VerifiedBadge({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="16" height="16" rx="4" fill="#059669" />
      <rect x="3" y="3" width="16" height="16" rx="4" fill="#059669" transform="rotate(45 11 11)" />
      <path d="M6.8 11.3l3 3 5.6-6.4" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

// Read-only "verified" announcement — shown to every viewer of a verified
// match, not just the audience that could set it (captain/VC/wrangler/
// admin, or this match's own top performer). Once verified there's nothing
// actionable left, so this is the same line for everyone.
export function VerifiedStatusLine({ cricheroesUrl }: { cricheroesUrl: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#34D399' }}>
        <VerifiedBadge size={14} /> Stats verified with <CricHeroesInlineLink url={cricheroesUrl} />
      </span>
    </div>
  )
}

// Bell — "notify" affordance for reporting a stats discrepancy. Uses
// currentColor so it inherits whatever text colour the caller sets.
export function NotifyIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2a6 6 0 0 0-6 6v3.09c0 .58-.2 1.14-.57 1.59L4 15h16l-1.43-2.32a2.5 2.5 0 0 1-.57-1.59V8a6 6 0 0 0-6-6z"
        fill="currentColor" />
      <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// Mark-verified / notify-discrepancy controls. Caller is responsible for
// gating who sees this at all (captain/VC/wrangler/admin, or this match's
// own resolved top performer — see matchTopPerformers.ts) and for never
// rendering it once already verified (VerifiedStatusLine covers that state
// instead, for every viewer). The API re-checks the same authorization
// server-side regardless of what the client shows — see scorecardAuth.ts.
export function ReconciliationControls({
  match, onPatch,
}: {
  match: VerifiableMatch
  onPatch: (patch: VerifyPatch) => void
}) {
  const [flagOpen, setFlagOpen] = useState(false)
  const [note, setNote]         = useState(match.reconciliation_note ?? '')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function markVerified() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/matches/${match.booking_id}/verify-scorecard`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to verify'); return }
      onPatch({ verified: true })
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function submitFlag() {
    if (note.trim().length < 3) { setError('Note must be at least 3 characters'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/matches/${match.booking_id}/flag-reconciliation`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ note: note.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to flag'); return }
      onPatch({
        needs_reconciliation: true,
        reconciliation_note:  note.trim(),
        verified:             false,
      })
      setFlagOpen(false)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  // Already flagged — no further self-service action here. The flag
  // clears itself automatically the next time this booking is re-fetched
  // and re-synced (see scorecardBackfill.ts); an admin can also clear it
  // manually without reprocessing from /admin/scorecard-backfill.
  if (match.needs_reconciliation) {
    return (
      <p style={{ fontSize: '10px', color: '#6B7280', textAlign: 'right' }}>
        Discrepancy reported — will clear automatically once re-synced.
      </p>
    )
  }

  // The caller only renders this component while the match is eligible and
  // not yet verified — see VerifiedStatusLine for the (always-rendered,
  // any-viewer) verified state.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <input
          type="checkbox"
          checked={false}
          disabled={saving}
          onChange={markVerified}
          title="Mark scorecard as verified"
          style={{ accentColor: '#34D399', cursor: saving ? 'default' : 'pointer' }}
        />
        <span
          onClick={() => !saving && markVerified()}
          style={{ cursor: saving ? 'default' : 'pointer' }}
          className="font-rajdhani text-[11px] font-bold tracking-wide text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors">
          {saving ? 'Saving…' : 'Mark Scorecard as Verified with'}
        </span>
        <CricHeroesInlineLink url={match.cricheroes_url} />
      </div>

      <button onClick={() => setFlagOpen(v => !v)} disabled={saving}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        className="font-rajdhani text-[10px] font-bold tracking-wide text-amber-400 hover:text-amber-300 disabled:opacity-40 underline underline-offset-2 transition-colors">
        <NotifyIcon size={12} /> Notify stats discrepancy
      </button>

      {flagOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px', width: '100%' }}>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What looks wrong compared to CricHeroes?"
            maxLength={500}
            rows={2}
            className="w-full bg-ink-4 border border-ink-5 rounded px-2 py-1.5 font-rajdhani text-xs text-zinc-200"
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={submitFlag} disabled={saving || note.trim().length < 3}
              className="font-rajdhani text-[10px] font-bold tracking-wide bg-amber-950/40 border border-amber-800 text-amber-400 hover:bg-amber-900/40 disabled:opacity-40 px-2.5 py-1 rounded transition-colors">
              {saving ? 'Submitting…' : 'Submit'}
            </button>
            <button onClick={() => setFlagOpen(false)} disabled={saving}
              className="font-rajdhani text-[10px] font-semibold text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: '10px', color: '#F87171' }}>{error}</p>}
    </div>
  )
}
