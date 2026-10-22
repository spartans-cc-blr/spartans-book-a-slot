'use client'

// Shows the number of upcoming fixtures the player hasn't marked availability
// for on the installed app's icon (Badging API: Android Chrome PWAs, iOS
// 16.4+ home-screen apps, desktop). Fed by the single /api/modals/pending
// request. A failed lookup (null) leaves the badge as it was; 0 clears it.
// Browsers without the API do nothing.

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useModalFeed } from '@/components/ui/ModalFeedProvider'

export function AppBadge() {
  const feed = useModalFeed()
  const { status } = useSession()
  const unmarked = feed?.unmarked

  useEffect(() => {
    if (typeof unmarked !== 'number') return
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    try {
      if (unmarked > 0) nav.setAppBadge?.(unmarked)?.catch(() => {})
      else nav.clearAppBadge?.()?.catch(() => {})
    } catch { /* unsupported or blocked: no badge */ }
  }, [unmarked])

  // Signed out: don't leave the previous player's count on the icon.
  useEffect(() => {
    if (status !== 'unauthenticated') return
    try { (navigator as any).clearAppBadge?.()?.catch?.(() => {}) } catch {}
  }, [status])

  return null
}
