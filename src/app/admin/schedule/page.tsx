import { Suspense } from 'react'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { ScheduleSkeleton } from '@/components/schedule/ScheduleSkeleton'

export const revalidate = 0

export default function AdminSchedulePage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-cinzel text-xl font-bold text-gold">Full Schedule</h1>
          <p className="font-rajdhani text-zinc-500 text-sm mt-1">
            All slots — open, booked, reserved and blocked. Admin view only.
          </p>
        </div>
      </div>

      <Suspense fallback={<ScheduleSkeleton />}>
        <ScheduleGrid />
      </Suspense>
    </div>
  )
}
