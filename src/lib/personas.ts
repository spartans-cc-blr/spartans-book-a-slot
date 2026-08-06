// Persona switcher — shared, framework-free logic (no JSX, no client-only
// hooks) so it can be imported from both client components and the
// self-only PATCH route that persists the choice. See
// .claude/rules/features/... nav persona switcher proposal for the design.

export type Persona = 'player' | 'captain' | 'gc' | 'wrangler' | 'admin'

export const ALL_PERSONAS: Persona[] = ['player', 'captain', 'gc', 'wrangler', 'admin']

export const PERSONA_META: Record<Persona, { label: string; color: string; hint: string }> = {
  player:   { label: 'Player',              color: '#78716C', hint: 'Fixtures, profile, your own matches' },
  captain:  { label: 'Captain',             color: '#D97706', hint: 'Squad selection for your own matches' },
  gc:       { label: 'Governing Council',   color: '#38BDF8', hint: 'Squad review, player register, grounds' },
  wrangler: { label: 'Data Wrangler',       color: '#14B8A6', hint: 'Scorecards, squad backfill, grounds upkeep' },
  admin:    { label: 'Admin',               color: '#DC2626', hint: 'Full club operations — its own dashboard' },
}

interface RoleFlags {
  isCaptain?:  boolean
  isGC?:       boolean
  isWrangler?: boolean
  isAdmin?:    boolean
}

// Mirrors the flag-widening SiteNav already relied on (admin implies GC and
// wrangler capability server-side too) — an admin can genuinely switch into
// either of those views, not just Player.
export function availablePersonas(user: RoleFlags | null | undefined): Persona[] {
  const list: Persona[] = ['player']
  if (user?.isCaptain) list.push('captain')
  if (user?.isGC || user?.isAdmin) list.push('gc')
  if (user?.isWrangler || user?.isAdmin) list.push('wrangler')
  if (user?.isAdmin) list.push('admin')
  return list
}

// Server-side guard for the persona PATCH route — never trust a client-sent
// persona string without checking it against the caller's own role flags.
export function isPersonaAllowed(persona: string, user: RoleFlags | null | undefined): persona is Persona {
  return (ALL_PERSONAS as string[]).includes(persona) && availablePersonas(user).includes(persona as Persona)
}

const COMMON_PREFIXES = ['/', '/fixtures', '/matches', '/dugout', '/leaderboard', '/profile', '/join']

const PERSONA_PREFIXES: Record<Exclude<Persona, 'admin'>, string[]> = {
  player:   [],
  captain:  ['/captains-corner', '/tournament-planner'],
  gc:       ['/tournament-planner', '/gc-review', '/gc-players', '/gc', '/dugout/store-orders', '/wrangler/grounds'],
  wrangler: ['/wrangler'],
}

// Does this persona's nav have a link that would land you back on `pathname`?
// Drives the "send me to Home" behaviour when switching away from a page the
// new persona doesn't show a link to.
export function personaHasPath(persona: Persona, pathname: string): boolean {
  if (persona === 'admin') return pathname.startsWith('/admin')
  const prefixes = [...COMMON_PREFIXES, ...PERSONA_PREFIXES[persona]]
  return prefixes.some(prefix => (prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)))
}
