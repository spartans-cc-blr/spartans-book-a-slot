// /players — club player directory, open to every signed-in, non-expelled
// member. Replaces the GC-only /gc-players Squad Register (which now
// redirects here). Each card shows the player's standout career numbers
// instead of wallet balance, and links to their full stats page.
// See features/player-directory.md.
//
// vibe-security: select is limited to public-profile fields (name, photo,
// jersey, skills, captain flag, and an active/inactive boolean for the
// filter — the raw status string never reaches the client). gmail, dob,
// whatsapp and blood group never reach this page. wallet_balance is fetched
// and sent ONLY when the viewer is GC or admin (decided server-side); for
// everyone else it is null. Absence reasons (player_absences) are likewise
// fetched only for captain/GC/admin. Expelled players are excluded server-side. No
// write path.

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { PlayerDirectoryGrid, type DirectoryPlayer } from '@/components/players/PlayerDirectoryGrid'
import { getCareerHighlightsByPlayer, getSeasonCapHolders } from '@/lib/playerStats'
import { capsForPlayer } from '@/lib/capHolders'
import type { CareerHighlights } from '@/lib/playerHighlights'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Players — Spartans CC' }
export const revalidate = 0

export default async function PlayersDirectoryPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent('/players')}`)
  if (user?.playerStatus === 'expelled') redirect('/')

  const canSeeWallet = !!(user?.isGC || user?.isAdmin)
  // Captains, GC and admin can see and record why a player is inactive (§8).
  const canManageAbsences = !!(user?.isCaptain || user?.isGC || user?.isAdmin)
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const [playersRes, playedRes, highlights, capHolders, absencesRes] = await Promise.all([
    supabase
      .from('players')
      .select(`id, name, photo_url, jersey_name, jersey_number, primary_skill, secondary_skill, is_captain, status${canSeeWallet ? ', wallet_balance' : ''}`)
      .neq('status', 'expelled')
      .order('name', { ascending: true }),
    // Last played = most recent confirmed, already-played booking the
    // player was squadded for (Hub-side, same signal the old GC page used).
    supabase
      .from('squad')
      .select('player_id, bookings!inner(game_date, status)')
      .eq('bookings.status', 'confirmed')
      .lte('bookings.game_date', today),
    // Stats are best-effort — the directory still works as a name lookup
    // if the analytics DB is unreachable.
    getCareerHighlightsByPlayer().catch(err => {
      console.error('[players] career highlights error:', err?.message ?? err)
      return {} as Record<string, CareerHighlights>
    }),
    // Orange/Purple Cap holders for the current season — best-effort too.
    getSeasonCapHolders().catch(err => {
      console.error('[players] cap holders error:', err?.message ?? err)
      return { year: new Date().getFullYear(), orange: [] as string[], purple: [] as string[] }
    }),
    // Reasons can be sensitive (injury, family) — fetched only for roles that may manage them.
    canManageAbsences
      ? supabase.from('player_absences')
          .select('player_id, reason, expected_return, note, created_at')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: null, error: null } as any),
  ])

  if (playersRes.error) console.error('[players] players query error:', playersRes.error.message)
  if (playedRes.error) console.error('[players] last-played query error:', playedRes.error.message)

  if (absencesRes.error) console.error('[players] absences query error:', absencesRes.error.message)
  // Newest row per player is the current state; a NULL reason means cleared.
  const absences: Record<string, DirectoryPlayer['absence']> = {}
  for (const a of (absencesRes.data ?? []) as any[]) {
    if (a.player_id in absences) continue
    absences[a.player_id] = a.reason
      ? { reason: a.reason, expected_return: a.expected_return ?? null, note: a.note ?? null }
      : null
  }

  const lastPlayed: Record<string, string> = {}
  for (const row of playedRes.data ?? []) {
    const d = (row as any).bookings?.game_date as string | undefined
    const pid = row.player_id as string
    if (d && (!lastPlayed[pid] || d > lastPlayed[pid])) lastPlayed[pid] = d
  }

  const players: DirectoryPlayer[] = (playersRes.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    photo_url: p.photo_url,
    jersey_name: p.jersey_name,
    jersey_number: p.jersey_number,
    primary_skill: p.primary_skill,
    secondary_skill: p.secondary_skill,
    is_captain: !!p.is_captain,
    is_active: p.status === 'active',
    wallet_balance: canSeeWallet ? Number(p.wallet_balance ?? 0) : null,
    last_played_on: lastPlayed[p.id] ?? null,
    highlights: highlights[p.id] ?? null,
    caps: capsForPlayer(p.id, capHolders),
    absence: absences[p.id] ?? null,
  }))

  return (
    <div className="min-h-screen bg-[var(--stats-shell-bg)] dark:bg-ink grain">
      <SiteNav activePage="players" back={{ fallbackHref: '/', label: 'Home' }} />

      <div className="bg-[var(--stats-card-bg)] dark:bg-ink-2 border-b border-[var(--stats-divider)] dark:border-ink-4 px-5 md:px-8 lg:px-10 py-7 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-[var(--stats-accent)] dark:text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-[var(--stats-accent)] dark:bg-gold inline-block" />
          Squad
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-[var(--stats-text)] dark:text-parchment tracking-wide">Players</h1>
        <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500 mt-1">
          Find anyone in the club and tap through to their full stats.
        </p>
      </div>

      <main className="px-5 md:px-8 lg:px-10 py-6 max-w-6xl">
        <PlayerDirectoryGrid players={players} showWallet={canSeeWallet} canManageAbsences={canManageAbsences} />
        <p className="font-rajdhani text-xs text-[var(--stats-text-faint)] dark:text-zinc-600 mt-8">
          Highlights cover synced Hub matches only; practice games are excluded. Orange Cap (most runs) and Purple Cap (most wickets) are for the current season.
        </p>
      </main>
    </div>
  )
}
