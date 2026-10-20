'use client'

// Reusable component — player name with optional CricHeroes hyperlink.
// Used in Tournament Planner, Captains Corner, GC Review, Fixtures.
// e.stopPropagation() prevents link click from toggling parent checkboxes.
// Client Component — renders an onClick handler, so any Server Component
// (e.g. /leaderboard/page.tsx) rendering this directly needs the boundary
// declared here, not just in whichever component happens to import it.

import Link from 'next/link'
import { useSession } from 'next-auth/react'

interface PlayerNameLinkProps {
  name: string
  playerId?: string | null
  cricHeroesUrl?: string | null
  className?: string
  // Purple text when this name resolves to the signed-in player (matched by
  // Hub player_id, i.e. through the alias resolution, never by spelling).
  highlightSelf?: boolean
}

// Hub players (playerId set) link to their internal stats page — the club
// no longer needs to send its own members out to CricHeroes just to see a
// name. playerId is absent for opponent players and unreconciled scorecard
// names (see playerIdentityResolution.ts), which have no Hub profile to
// link to — those fall back to the external CricHeroes link, same as before.
export function PlayerNameLink({ name, playerId, cricHeroesUrl, className: baseClass, highlightSelf }: PlayerNameLinkProps) {
  const { data: session } = useSession()
  const selfId = (session?.user as { playerId?: string | null } | undefined)?.playerId
  const isSelf = !!highlightSelf && !!playerId && playerId === selfId
  const className = isSelf ? `${baseClass ?? ''} !text-purple-700 dark:!text-purple-400 font-semibold` : baseClass
  if (playerId) {
    return (
      <Link
        href={`/players/${playerId}/stats`}
        prefetch={false}
        className={`underline decoration-dotted underline-offset-2 hover:text-gold transition-colors ${className ?? ''}`}
        onClick={e => e.stopPropagation()}
      >
        {name}
      </Link>
    )
  }
  if (!cricHeroesUrl) return <span className={className}>{name}</span>
  return (
    <a
      href={cricHeroesUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline decoration-dotted underline-offset-2 hover:text-gold transition-colors ${className ?? ''}`}
      onClick={e => e.stopPropagation()}
    >
      {name}
    </a>
  )
}