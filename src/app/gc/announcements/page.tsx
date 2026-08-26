import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { GCAnnouncementsClient } from '@/components/gc/GCAnnouncementsClient'

export const metadata: Metadata = {
  title: 'Announcements — Spartans CC',
}

export const revalidate = 0

export default async function GCAnnouncementsPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isGC && !user?.isAdmin) redirect('/')

  return <GCAnnouncementsClient currentGcName={user.playerName} />
}
