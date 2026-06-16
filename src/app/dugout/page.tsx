import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SiteNav } from '@/components/ui/SiteNav'

export default async function DugoutPage() {
  const session = await getServerSession(authOptions)
  const player = session?.user as any

  if (!player?.playerId) {
    redirect('/')
  }

  const isExpelled = player.playerStatus === 'expelled'

  return (
    <>
      <SiteNav activePage="dugout" />
      <main className="min-h-screen bg-parchment px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-cinzel font-bold text-3xl text-stone-900 mb-1">The Dugout</h1>
          <p className="font-rajdhani text-stone-500 mb-8">Your club utility space.</p>

          {isExpelled ? (
            <div className="bg-parchment-2 border border-[#D4C9B0] rounded-lg p-6">
              <p className="font-cinzel font-semibold text-stone-900 mb-2">Account Suspended</p>
              <p className="font-rajdhani text-stone-600">
                Your account has been suspended. You do not have access to The Dugout.
                Please contact a club administrator if you believe this is an error.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Link href="/dugout/kit-room"
                className="bg-parchment-2 border border-[#D4C9B0] rounded-lg p-6 hover:border-amber-300 hover:bg-amber-50 transition-colors block">
                <p className="font-cinzel font-semibold text-stone-900 mb-2">Kit Room</p>
                <p className="font-rajdhani text-sm text-stone-600 mb-4">
                  Order your Spartans jersey — track your order from batch to delivery.
                </p>
                <span className="font-rajdhani text-sm font-semibold text-amber-600">Explore →</span>
              </Link>

              <Link href="/dugout/gear"
                className="bg-parchment-2 border border-[#D4C9B0] rounded-lg p-6 hover:border-amber-300 hover:bg-amber-50 transition-colors block">
                <p className="font-cinzel font-semibold text-stone-900 mb-2">Gear Exchange</p>
                <p className="font-rajdhani text-sm text-stone-600 mb-4">
                  Buy, sell, or find cricket gear within the club.
                </p>
                <span className="font-rajdhani text-sm font-semibold text-amber-600">Explore →</span>
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
