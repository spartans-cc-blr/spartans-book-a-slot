import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { SiteNav } from '@/components/ui/SiteNav'
import { WalletStatementClient } from '@/components/wallet/WalletStatementClient'

// /wallet — a player's own bank-statement-style view of every wallet
// change: payments they made (credits) and match fees debited, newest
// first, with a running balance and a "Brought Forward" line once history
// is exhausted. See features/wallet-ledger.md.
export default async function WalletPage() {
  const session = await getServerSession(authOptions)
  const player = session?.user as any

  if (!session) redirect('/login')
  if (!player?.playerId) redirect('/')

  return (
    <div className="min-h-screen bg-ink grain">
      <SiteNav activePage="wallet" back={{ fallbackHref: '/', label: 'Home' }} />
      <div className="px-5 md:px-8 lg:px-10 py-8 max-w-2xl mx-auto">
        <h1 className="font-cinzel text-xl font-bold text-gold mb-1">My Wallet</h1>
        <p className="font-rajdhani text-zinc-500 text-sm mb-6">
          Every payment and match fee, newest first.
        </p>
        <WalletStatementClient />
      </div>
    </div>
  )
}
