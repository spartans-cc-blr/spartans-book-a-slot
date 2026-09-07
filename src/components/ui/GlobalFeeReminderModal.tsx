'use client'

// Mounts FeeReminderModal exactly once per app session, in the root layout —
// same rationale as GlobalMilestoneModal/GlobalBirthdayModal: SiteNav isn't
// a shared layout (it's rendered from inside each page.tsx individually,
// see architecture.md's file map) and remounts on every client-side
// navigation, which would refetch on every page view if mounted there
// instead. Gated to isAdmin only — fee application is an admin-only action,
// so nobody else should see this nag. See features/fee-reminders.md.

import { useSession } from 'next-auth/react'
import { FeeReminderModal } from '@/components/admin/FeeReminderModal'

export function GlobalFeeReminderModal() {
  const { data: session, status } = useSession()
  const user = session?.user as any
  const isAdmin = status === 'authenticated' && !!user?.isAdmin

  if (!isAdmin) return null
  return <FeeReminderModal />
}
