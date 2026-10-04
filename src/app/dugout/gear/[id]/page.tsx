import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SiteNav } from '@/components/ui/SiteNav'
import { GearDetailShare } from '@/components/dugout/GearDetailShare'

export const revalidate = 0

type GearCondition = 'new' | 'good' | 'fair'
type GearType = 'for_sale' | 'wanted'

function TypeBadge({ type }: { type: GearType }) {
  if (type === 'for_sale') {
    return (
      <span className="font-rajdhani text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 dark:bg-ink-4 text-stone-700 dark:text-zinc-300 border border-stone-200 dark:border-ink-5">
        For Sale
      </span>
    )
  }
  return (
    <span className="font-rajdhani text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
      Wanted
    </span>
  )
}

function ConditionBadge({ condition }: { condition: GearCondition }) {
  const styles: Record<GearCondition, string> = {
    new: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
    good: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
    fair: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  }
  return (
    <span className={`font-rajdhani text-xs font-semibold px-2 py-0.5 rounded ${styles[condition]}`}>
      {condition.charAt(0).toUpperCase() + condition.slice(1)}
    </span>
  )
}

function PlayerLink({ name, cricHeroesUrl }: { name: string; cricHeroesUrl: string | null }) {
  if (cricHeroesUrl) {
    return (
      <a
        href={cricHeroesUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-rajdhani text-sm text-amber-700 dark:text-amber-400 font-semibold hover:underline underline-offset-2"
      >
        {name}
      </a>
    )
  }
  return <span className="font-rajdhani text-sm text-stone-700 dark:text-zinc-300 font-semibold">{name}</span>
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function GearDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  const player = session?.user as any

  if (!player?.playerId) redirect('/')

  const cookieStore = cookies()
  const cookieHeader = cookieStore.getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  let listing: any = null
  let notFound = false

  try {
    const res = await fetch(`${baseUrl}/api/dugout/gear/${params.id}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (res.status === 404 || res.status === 401) {
      notFound = true
    } else if (res.ok) {
      const json = await res.json()
      listing = json.listing ?? null
    } else {
      notFound = true
    }
  } catch {
    notFound = true
  }

  return (
    <div className="min-h-screen bg-parchment dark:bg-ink">
      <SiteNav activePage="dugout" back={{ fallbackHref: '/dugout/gear', label: 'Gear Exchange' }} />
      <main className="px-4 py-8 bg-parchment dark:bg-ink">
        <div className="max-w-2xl mx-auto">

          {notFound || !listing ? (
            <div className="bg-parchment-2 dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded-lg p-6 text-center">
              <p className="font-rajdhani text-stone-700 dark:text-zinc-300 text-sm mb-3">
                This listing is no longer available.
              </p>
              <Link
                href="/dugout/gear"
                className="font-rajdhani text-sm text-amber-700 dark:text-amber-400 hover:underline underline-offset-2"
              >
                Browse all listings
              </Link>
            </div>
          ) : (
            <div className="bg-parchment-2 dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded-lg p-6 flex flex-col gap-4">
              <div className="flex flex-wrap gap-2 items-center">
                <TypeBadge type={listing.type} />
                {listing.type === 'for_sale' && listing.condition && (
                  <ConditionBadge condition={listing.condition} />
                )}
              </div>

              <h1 className="font-cinzel font-bold text-xl text-stone-900 dark:text-parchment leading-snug">
                {listing.title}
              </h1>

              <p className="font-rajdhani text-sm text-stone-700 dark:text-zinc-300 whitespace-pre-wrap">
                {listing.description}
              </p>

              <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-zinc-400 font-rajdhani">
                <span>Posted by</span>
                {listing.players ? (
                  <PlayerLink
                    name={listing.poster_name || 'Unknown'}
                    cricHeroesUrl={listing.poster_cricheroes_url ?? null}
                  />
                ) : (
                  <span className="font-rajdhani text-sm text-stone-700 dark:text-zinc-300 font-semibold">Unknown</span>
                )}
                <span className="mx-1">·</span>
                <span className="text-stone-400 dark:text-zinc-500">{formatDate(listing.created_at)}</span>
              </div>

              <GearDetailShare listingId={listing.id} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
