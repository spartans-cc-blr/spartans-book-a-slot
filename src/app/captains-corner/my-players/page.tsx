// app/captains-corner/my-players/page.tsx
//
// A captain's own record as match captain: the top 3 batters at each
// batting position in the matches they led, and the bowlers they used most.
// See .claude/rules/features/captaincy-stats.md.
//
// Access: captains, GC and admin. A captain only ever sees their own
// matches — ?captainId= is ignored for them. GC and admin get a picker over
// every match captain. Read-only; no write path.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SiteNav } from '@/components/ui/SiteNav'
import { getCaptaincyInnings, getMatchCaptains, buildCaptainRecord } from '@/lib/captaincyStats'
import { CaptainRecordView } from '@/components/captaincy/CaptainRecordView'
import { CaptainSelect } from '@/components/captaincy/CaptainSelect'
import type { CaptainOption } from '@/lib/captaincyStatsCore'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "My Players — Captains' Corner",
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function MyPlayersPage({
  searchParams,
}: {
  searchParams: { captainId?: string; year?: string }
}) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!session) redirect('/login')
  if (user?.playerStatus === 'expelled') redirect('/')
  if (!user?.isCaptain && !user?.isGC && !user?.isAdmin) redirect('/fixtures')

  const canPick = !!user.isGC || !!user.isAdmin
  let options: CaptainOption[] = []
  let captainId: string | null = user.playerId ?? null

  if (canPick) {
    options = await getMatchCaptains()
    const requested = searchParams.captainId
    if (requested && options.some(o => o.id === requested)) captainId = requested
    else if (!captainId || !options.some(o => o.id === captainId)) captainId = options[0]?.id ?? null
  }

  const allRows = captainId ? await getCaptaincyInnings({ captainId }) : []
  const years = Array.from(new Set(allRows.map(r => r.gameDate.slice(0, 4)))).sort().reverse()
  const year = searchParams.year && years.includes(searchParams.year) ? searchParams.year : 'all'
  const rows = year === 'all' ? allRows : allRows.filter(r => r.gameDate.startsWith(year))
  const record = buildCaptainRecord(rows)

  const isOwn = captainId != null && captainId === user.playerId
  const captainName = options.find(o => o.id === captainId)?.name ?? allRows[0]?.captainName ?? user.playerName ?? 'Captain'

  function yearHref(y: string): string {
    const params = new URLSearchParams()
    if (canPick && captainId) params.set('captainId', captainId)
    if (y !== 'all') params.set('year', y)
    const qs = params.toString()
    return `/captains-corner/my-players${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--stats-shell-bg)' }}>
      <SiteNav activePage="captains-players" back={{ fallbackHref: '/captains-corner', label: 'Squad Selection' }} />

      <div className="bg-[var(--stats-card-bg)] border-b border-[var(--stats-card-border)] px-5 md:px-8 lg:px-10 py-7">
        <div className="max-w-3xl mx-auto">
          <p className="text-[var(--stats-accent)] text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-1 flex items-center gap-2">
            <span className="w-4 h-px bg-[var(--stats-accent)] inline-block" />
            Captains&rsquo; Corner
          </p>
          <h1 className="font-cinzel text-xl md:text-2xl font-bold text-[var(--stats-text)] tracking-wide">
            {isOwn ? 'My Players' : `${captainName}'s Players`}
          </h1>
          <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] mt-1 max-w-xl">
            Who has done well at each batting position, and which bowlers have been used most, in matches{' '}
            {isOwn ? 'you captained' : `${captainName} captained`}. Practice games are not counted.
          </p>
          {canPick && options.length > 0 && (
            <CaptainSelect captains={options} selectedId={captainId ?? ''} ownPlayerId={user.playerId ?? null} />
          )}
        </div>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-3xl mx-auto">
        {!captainId || allRows.length === 0 ? (
          <div className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-6 text-center">
            <p className="font-rajdhani text-sm text-[var(--stats-text-muted)]">
              {isOwn || !canPick
                ? "No synced matches with you as match captain yet. Once a match you captain has its scorecard synced, it shows up here."
                : 'No synced matches for this captain yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {['all', ...years].map(y => (
                <Link key={y} href={yearHref(y)} replace scroll={false}
                  className={`font-rajdhani text-xs font-bold tracking-wide uppercase px-3 py-1.5 rounded-full border transition-colors
                    ${y === year
                      ? 'bg-[var(--stats-accent)] border-[var(--stats-accent)] text-white dark:text-ink'
                      : 'border-[var(--stats-card-border)] text-[var(--stats-text-muted)] hover:text-[var(--stats-text)]'}`}>
                  {y === 'all' ? 'All time' : y}
                </Link>
              ))}
              <span className="font-rajdhani text-xs text-[var(--stats-text-faint)] ml-auto">
                {record.matches} {record.matches === 1 ? 'match' : 'matches'}
                {record.firstDate && ` · ${formatDate(record.firstDate)} – ${formatDate(record.lastDate)}`}
              </span>
            </div>
            <CaptainRecordView record={record} />
          </>
        )}
      </div>

      <footer className="border-t py-5 text-center font-rajdhani text-xs mt-8"
        style={{ borderColor: 'var(--stats-card-border)', color: 'var(--stats-text-muted)' }}>
        © 2026 <span style={{ color: 'var(--stats-badge-text)' }}>Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
