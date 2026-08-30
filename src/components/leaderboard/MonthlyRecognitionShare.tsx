'use client'

// Available to any signed-in player on /leaderboard's Monthly tab — a
// WhatsApp share link for that month's recognition. Not role-gated; the
// only gate is readiness: the button (and this component) renders nothing
// at all until every real match scheduled that month has a synced
// scorecard — see src/lib/monthlyRecognition.ts for that check, and
// features/leaderboard.md for the Monthly tab this points at.
//
// Sits in the 10% slot next to the month stepper (LeaderboardFilters.tsx's
// Row 4) as a compact icon-only button, same circular treatment as the
// stepper's own ‹/› nav buttons — WA_ICON is the same glyph used by
// PerformerShareButton/TournamentShareButton elsewhere in the app, so this
// reads as the same "share on WhatsApp" affordance everywhere it appears.
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
    <button
      onClick={openWhatsApp}
      title={`Share ${monthLabel} Recognition on WhatsApp`}
      aria-label={`Share ${monthLabel} Recognition on WhatsApp`}
      className="w-7 h-7 flex-shrink-0 flex items-center justify-center border border-emerald-600 text-emerald-400 rounded-full hover:bg-emerald-600/20 transition-colors">
      {WA_ICON}
    </button>
  )
}
