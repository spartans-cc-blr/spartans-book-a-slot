'use client'

// Mounts MilestoneCelebrationModal exactly once per app session, in the
// root layout — rather than inside SiteNav, which is re-rendered into
// every page.tsx individually (see architecture.md's file map) and so
// remounts on every client-side navigation. That remount was firing
// MilestoneCelebrationModal's own `fetch('/api/milestones/unseen')` again
// on every single page view, not just once per session. Same gating
// (`isLoggedIn && !isExpelled`) SiteNav used to apply before mounting it.

import { useSession } from 'next-auth/react'
import { MilestoneCelebrationModal } from '@/components/milestones/MilestoneCelebrationModal'

export function GlobalMilestoneModal() {
  const { data: session, status } = useSession()
  const player = session?.user as any
  const isLoggedIn = status === 'authenticated'
  const isExpelled = player?.playerStatus === 'expelled'

  if (!isLoggedIn || isExpelled) return null
  return <MilestoneCelebrationModal />
}
