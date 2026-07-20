'use client'

// Reusable component — player name with optional CricHeroes hyperlink.
// Used in Tournament Planner, Captains Corner, GC Review, Fixtures.
// e.stopPropagation() prevents link click from toggling parent checkboxes.
// Client Component — renders an onClick handler, so any Server Component
// (e.g. /leaderboard/page.tsx) rendering this directly needs the boundary
// declared here, not just in whichever component happens to import it.

import Link from 'next/link'

interface PlayerNameLinkProps {
  name: string
  playerId?: string | null
  cricHeroesUrl?: string | null
  className?: string
}

// Hub players (playerId set) link to their internal stats page — the club
// no longer needs to send its own members out to CricHeroes just to see a
// name. playerId is absent for opponent players and unreconciled scorecard
// names (see playerIdentityResolution.ts), which have no Hub profile to
// link to — those fall back to the external CricHeroes link, same as before.
export function PlayerNameLink({ name, playerId, cricHeroesUrl, className }: PlayerNameLinkProps) {
  if (playerId) {
    return (
      <Link
        href={`/players/${playerId}/stats`}
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