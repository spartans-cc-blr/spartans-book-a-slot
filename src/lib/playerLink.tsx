// Reusable component — player name with optional CricHeroes hyperlink.
// Used in Tournament Planner, Captains Corner, GC Review, Fixtures.
// e.stopPropagation() prevents link click from toggling parent checkboxes.

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