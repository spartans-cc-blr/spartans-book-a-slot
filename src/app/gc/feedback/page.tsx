import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { GCFeedbackClient } from '@/components/gc/GCFeedbackClient'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'GC Feedback — Spartans CC',
}

export const revalidate = 0

export default async function GCFeedbackPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isGC && !user?.isAdmin) redirect('/')

  const db = createServiceClient()
  const [{ data: campaigns }, { data: players }] = await Promise.all([
    db.from('feedback_campaigns')
      .select('id, title, questions, created_at, closed_at')
      .order('closed_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false }),
    db.from('players')
      .select('id, name, cricheroes_url, primary_skill, secondary_skill, photo_url, status')
      .eq('status', 'active')
      .order('name'),
  ])

  return (
    <GCFeedbackClient
      campaigns={campaigns ?? []}
      players={players ?? []}
      currentGcId={user.playerId}
      currentGcName={user.playerName}
    />
  )
}