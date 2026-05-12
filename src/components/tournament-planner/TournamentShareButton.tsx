'use client'
import { useState } from 'react'

export function TournamentShareButton({ tournamentId }: { tournamentId: string }) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    const url = `${window.location.origin}/tournament-planner/share/${tournamentId}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Tournament Update — Spartans CC', url }); return }
      catch {}
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <button onClick={handleShare}
      className="font-rajdhani text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">
      {copied ? '✅ Link copied!' : '📤 Share tournament card'}
    </button>
  )
}