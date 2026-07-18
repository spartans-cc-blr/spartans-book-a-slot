'use client'

// Reusable component — player name with optional CricHeroes hyperlink.
// Used in Tournament Planner, Captains Corner, GC Review, Fixtures.
// e.stopPropagation() prevents link click from toggling parent checkboxes.
// Client Component — renders an onClick handler, so any Server Component
// (e.g. /leaderboard/page.tsx) rendering this directly needs the boundary
// declared here, not just in whichever component happens to import it.

interface PlayerNameLinkProps {
  name: string
  cricHeroesUrl?: string | null
  className?: string
}

export function PlayerNameLink({ name, cricHeroesUrl, className }: PlayerNameLinkProps) {
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