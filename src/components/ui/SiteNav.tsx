// src/app/gc-review/page.tsx
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { GCReviewClient } from '@/components/admin/GCReviewClient'
import { startOfISOWeek, addDays, format } from 'date-fns'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'GC Review — Spartans CC' }
export const revalidate = 0

export default async function GCReviewPage() {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!session) redirect('/login')
  if (!user?.isAdmin && !user?.isGC) redirect('/fixtures')

  const supabase  = createServiceClient()
  const today     = new Date()
  const monday    = startOfISOWeek(today)
  const saturday  = addDays(monday, 5)
  const sunday    = addDays(monday, 6)
  const weekStart = format(saturday, 'yyyy-MM-dd')
  const weekEnd   = format(addDays(sunday, 1), 'yyyy-MM-dd')
  const weekLabel = `${format(saturday, 'd MMM')} – ${format(sunday, 'd MMM yyyy')}`

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, format, opponent_name, tournament:tournaments(name)')
    .eq('status', 'confirmed')
    .gte('game_date', weekStart)
    .lt('game_date', weekEnd)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })

  const bookingIds = (bookings ?? []).map(b => b.id)

  const { data: avail } = bookingIds.length > 0
    ? await supabase
        .from('availability')
        .select('player_id, booking_id, response, players(id, name)')
        .in('response', ['O', 'E'])
        .in('booking_id', bookingIds)
    : { data: [] }

  const { data: squads } = bookingIds.length > 0
    ? await supabase
        .from('squad')
        .select('player_id, booking_id, status, players(id, name, primary_skill, is_captain)')
        .in('booking_id', bookingIds)
    : { data: [] }

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      <SiteNav />
      <main className="px-5 md:px-8 lg:px-10 py-8 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="font-cinzel text-xl font-bold text-gold">GC Review</h1>
          <p className="font-rajdhani text-sm text-zinc-500 mt-1">
            {weekLabel} · Review fairness and approve or return each slot before captains announce.
          </p>
        </div>
        <GCReviewClient
          weekLabel={weekLabel}
          bookings={(bookings ?? []) as any}
          avail={(avail ?? []) as any}
          squads={(squads ?? []) as any}
        />
      </main>
    </div>
  )
}
export { SiteNav }
