'use client'

// Club-wide milestone recognition modal — celebrates a player crossing a
// runs/wickets/dismissals threshold for the year, shown to every signed-in,
// non-expelled player the next time they open the Hub after a scorecard
// sync logs it (see src/lib/milestones.ts). Deliberately a broadcast, not
// targeted at just the achiever or whoever triggered the sync — "recognition
// from club to all players." See features/milestone-recognition.md.
//
// Mounted once inside SiteNav (rendered on every authenticated page) rather
// than a specific page, so it fires regardless of which page a player lands
// on first.

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Dialog } from '@/components/ui/Dialog'
import { PlayerNameLink } from '@/lib/playerLink'

type MilestoneType = 'runs' | 'wickets' | 'dismissals'

interface Achievement {
  id: string
  milestone_type: MilestoneType
  milestone_value: number
  year: number
  player: { id: string; name: string; photo_url: string | null; cricheroes_url: string | null } | null
  booking: { game_date: string | null; opponent_name: string | null } | null
}

const LABELS: Record<MilestoneType, string> = { runs: 'runs', wickets: 'wickets', dismissals: 'dismissals' }
const ICONS:  Record<MilestoneType, string> = { runs: '🏏', wickets: '🎯', dismissals: '🧤' }

export function MilestoneCelebrationModal() {
  const { status } = useSession()
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    fetch('/api/milestones/unseen')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data?.achievements?.length) return
        setAchievements(data.achievements)
        setOpen(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [status])

  function dismiss() {
    setOpen(false)
    fetch('/api/milestones/mark-seen', { method: 'POST' }).catch(() => {})
  }

  if (!open || achievements.length === 0) return null

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      title="🎉 Milestone Recognition"
      actions={
        <button
          onClick={dismiss}
          className="font-rajdhani text-xs font-bold uppercase tracking-wide bg-gold text-ink px-4 py-2 rounded hover:bg-gold-light transition-colors"
        >
          Got it
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {achievements.map(a => (
          <div key={a.id} className="flex items-start gap-3">
            <img
              src={a.player?.photo_url ?? '/default-avatar.png'}
              alt=""
              className="w-10 h-10 rounded-full object-cover border border-gold-dim flex-shrink-0"
            />
            <div>
              <p className="font-rajdhani text-sm text-parchment leading-snug">
                <span className="text-lg mr-1">{ICONS[a.milestone_type]}</span>
                {a.player ? (
                  <PlayerNameLink
                    name={a.player.name}
                    playerId={a.player.id}
                    cricHeroesUrl={a.player.cricheroes_url}
                    className="font-bold text-gold"
                  />
                ) : (
                  <span className="font-bold text-gold">A player</span>
                )}{' '}
                crossed <span className="font-bold">{a.milestone_value} {LABELS[a.milestone_type]}</span> in {a.year}!
              </p>
              {a.booking?.opponent_name && (
                <p className="font-rajdhani text-[11px] text-zinc-500 mt-0.5">
                  vs {a.booking.opponent_name}
                  {a.booking.game_date ? ` · ${new Date(a.booking.game_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
