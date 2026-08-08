'use client'

// Club-wide milestone recognition modal — celebrates a player crossing a
// season runs/wickets/dismissals threshold, or a standout single-match
// performance (century, half-century, five- or three-wicket haul, five-plus
// dismissals) — shown to every signed-in, non-expelled player the next time
// they open the Hub after a scorecard sync logs it (see
// src/lib/milestones.ts). Deliberately a broadcast, not targeted at just
// the achiever or whoever triggered the sync — "recognition from club to
// all players." See features/milestone-recognition.md.
//
// Mounted once inside SiteNav (rendered on every authenticated page) rather
// than a specific page, so it fires regardless of which page a player lands
// on first.

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Dialog } from '@/components/ui/Dialog'
import { PlayerNameLink } from '@/lib/playerLink'

type SeasonMilestoneType = 'runs' | 'wickets' | 'dismissals'
type MatchPerformanceType = 'century' | 'half_century' | 'five_wicket_haul' | 'three_wicket_haul' | 'five_dismissals'

interface PlayerRef {
  id: string
  name: string
  photo_url: string | null
  cricheroes_url: string | null
}
interface BookingRef {
  game_date: string | null
  opponent_name: string | null
}

interface SeasonAchievement {
  kind: 'season'
  id: string
  milestone_type: SeasonMilestoneType
  milestone_value: number
  year: number
  player: PlayerRef | null
  booking: BookingRef | null
}
interface MatchAchievement {
  kind: 'match'
  id: string
  performance_type: MatchPerformanceType
  value: number
  player: PlayerRef | null
  booking: BookingRef | null
}
type Achievement = SeasonAchievement | MatchAchievement

const SEASON_LABELS: Record<SeasonMilestoneType, string> = { runs: 'runs', wickets: 'wickets', dismissals: 'dismissals' }
const SEASON_ICONS:  Record<SeasonMilestoneType, string> = { runs: '🏏', wickets: '🎯', dismissals: '🧤' }

const MATCH_ICONS: Record<MatchPerformanceType, string> = {
  century:           '💯',
  half_century:      '5️⃣0️⃣',
  five_wicket_haul:  '🔥',
  three_wicket_haul: '🎳',
  five_dismissals:   '🧤',
}
const MATCH_TEXT: Record<MatchPerformanceType, (value: number) => React.ReactNode> = {
  century:           value => <>scored a century — <span className="font-bold">{value} runs</span></>,
  half_century:      value => <>scored a half-century — <span className="font-bold">{value} runs</span></>,
  five_wicket_haul:  value => <>took a five-wicket haul — <span className="font-bold">{value} wickets</span></>,
  three_wicket_haul: value => <>took a three-wicket haul — <span className="font-bold">{value} wickets</span></>,
  five_dismissals:   value => <>recorded <span className="font-bold">{value} dismissals</span> in the field</>,
}

function formatMatchDate(gameDate: string | null): string {
  return gameDate ? new Date(gameDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
}

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
          <div key={`${a.kind}-${a.id}`} className="flex items-start gap-3">
            <img
              src={a.player?.photo_url ?? '/default-avatar.png'}
              alt=""
              className="w-10 h-10 rounded-full object-cover border border-gold-dim flex-shrink-0"
            />
            <div>
              <p className="font-rajdhani text-sm text-parchment leading-snug">
                <span className="text-lg mr-1">
                  {a.kind === 'season' ? SEASON_ICONS[a.milestone_type] : MATCH_ICONS[a.performance_type]}
                </span>
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
                {a.kind === 'season' ? (
                  <>
                    crossed <span className="font-bold">{a.milestone_value} {SEASON_LABELS[a.milestone_type]}</span> in {a.year}!
                  </>
                ) : (
                  <>{MATCH_TEXT[a.performance_type](a.value)}!</>
                )}
              </p>
              {a.booking?.opponent_name && (
                <p className="font-rajdhani text-[11px] text-zinc-500 mt-0.5">
                  vs {a.booking.opponent_name}
                  {a.booking.game_date ? ` · ${formatMatchDate(a.booking.game_date)}` : ''}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
