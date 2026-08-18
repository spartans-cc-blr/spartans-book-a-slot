'use client'

// Mounts BirthdayWishesModal exactly once per app session, in the root
// layout — same reasoning as GlobalMilestoneModal: SiteNav is rendered
// from inside every individual page.tsx rather than a shared layout (see
// architecture.md's file map), so mounting a broadcast modal there would
// remount and re-fetch it on every client-side navigation. Same gating
// (isLoggedIn && !isExpelled) as every other global broadcast modal.

import { useSession } from 'next-auth/react'
import { BirthdayWishesModal } from '@/components/birthdays/BirthdayWishesModal'

export function GlobalBirthdayModal() {
  const { data: session, status } = useSession()
  const player = session?.user as any
  const isLoggedIn = status === 'authenticated'
  const isExpelled = player?.playerStatus === 'expelled'

  if (!isLoggedIn || isExpelled) return null
  return <BirthdayWishesModal />
}
