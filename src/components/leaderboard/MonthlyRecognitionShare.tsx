'use client'

// Coordinator-only affordance on /leaderboard's Monthly tab: a WhatsApp
// share link for that month's recognition, gated until every real match
// scheduled that month has a synced scorecard — see
// src/lib/monthlyRecognition.ts for the readiness check, and
// features/leaderboard.md for the Monthly tab this points at.
//
// Destination-free wa.me/?text=... — same convention as every other
// WhatsApp group nudge in this app (birthday wishes, availability nudges):
// the sender picks the recipient (the club WhatsApp group), unlike
// PerformerShareButton's auto-targeted one-to-one message.
//
// Visibility (canShare) is entirely the caller's responsibility — this
// component renders unconditionally once mounted, same posture as
// PerformerShareButton.

import { WA_ICON } from '@/components/tournament-planner/TournamentShareButton'
import type { MonthSyncStatus } from '@/lib/monthlyRecognition'

export function MonthlyRecognitionShare({ month, monthLabel, syncStatus, canShare }: {
  month: string
  monthLabel: string
  syncStatus: MonthSyncStatus
  canShare: boolean
}) {
  if (!canShare || syncStatus.totalMatches === 0) return null

  const { totalMatches, syncedMatches, allSynced } = syncStatus

  function openWhatsApp() {
    const url = `${window.location.origin}/leaderboard?category=monthly&month=${month}`
    const text = encodeURIComponent(
      `🏆 ${monthLabel} Recognition — Yours Statistically!\n\nEvery scorecard for the month is in — check out this month's top performers, milestones & standout knocks:\n\n${url}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <div className="flex items-center justify-end -mt-1">
      {allSynced ? (
        <button onClick={openWhatsApp}
          className="inline-flex items-center gap-1.5 font-rajdhani text-xs font-bold tracking-wide text-emerald-400 hover:text-emerald-300 transition-colors">
          {WA_ICON} Share {monthLabel} Recognition
        </button>
      ) : (
        <span
          title="Every match scheduled this month needs a synced scorecard before this month's recognition can be shared"
          className="inline-flex items-center gap-1.5 font-rajdhani text-xs text-zinc-500">
          🔒 Share available once all matches sync ({syncedMatches}/{totalMatches} synced)
        </span>
      )}
    </div>
  )
}
