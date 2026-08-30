'use client'

// Available to any signed-in player on /leaderboard's Monthly tab — a
// WhatsApp share link for that month's recognition. Not role-gated; the
// only gate is readiness: the button (and this component) renders nothing
// at all until every real match scheduled that month has a synced
// scorecard — see src/lib/monthlyRecognition.ts for that check, and
// features/leaderboard.md for the Monthly tab this points at.
//
// Destination-free wa.me/?text=... — same convention as every other
// WhatsApp group nudge in this app (birthday wishes, availability nudges):
// the sender picks the recipient (the club WhatsApp group), unlike
// PerformerShareButton's auto-targeted one-to-one message.

import { WA_ICON } from '@/components/tournament-planner/TournamentShareButton'
import type { MonthSyncStatus } from '@/lib/monthlyRecognition'

export function MonthlyRecognitionShare({ month, monthLabel, syncStatus }: {
  month: string
  monthLabel: string
  syncStatus: MonthSyncStatus
}) {
  if (!syncStatus.allSynced) return null

  function openWhatsApp() {
    const url = `${window.location.origin}/leaderboard?category=monthly&month=${month}`
    const text = encodeURIComponent(
      `🏆 ${monthLabel} Recognition — Yours Statistically!\n\nEvery scorecard for the month is in — check out this month's top performers, milestones & standout knocks:\n\n${url}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <div className="flex items-center justify-end -mt-1">
      <button onClick={openWhatsApp}
        className="inline-flex items-center gap-1.5 font-rajdhani text-xs font-bold tracking-wide text-emerald-400 hover:text-emerald-300 transition-colors">
        {WA_ICON} Share {monthLabel} Recognition
      </button>
    </div>
  )
}
