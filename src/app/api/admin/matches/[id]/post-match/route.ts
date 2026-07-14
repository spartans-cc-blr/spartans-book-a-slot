// GET /api/admin/matches/[id]/post-match
// Admin only. Feeds the "Post-Match" panel on /admin/bookings/[id] — upload
// status (with uploader name) plus the cached stats summary, if synced.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: upload, error: uploadErr } = await supabase
    .from('scorecard_uploads')
    .select('status, uploaded_at, uploaded_by, error_message, fees_applied_at')
    .eq('booking_id', params.id)
    .maybeSingle()

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  // Two FKs from scorecard_uploads point at players (uploaded_by,
  // fees_applied_by) — resolved with a separate lookup instead of an
  // embedded select to avoid PostgREST FK-ambiguity entirely.
  let uploadedByName: string | null = null
  if (upload?.uploaded_by) {
    const { data: uploader } = await supabase
      .from('players')
      .select('name')
      .eq('id', upload.uploaded_by)
      .maybeSingle()
    uploadedByName = uploader?.name ?? null
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('match_id')
    .eq('id', params.id)
    .maybeSingle()

  let stats: any = null
  if (booking?.match_id) {
    const { data: statsRow } = await supabase
      .from('match_stats_cache')
      .select('match_result, team_total, team_wickets, team_overs, opponent_total, opponent_wickets, opponent_overs')
      .eq('match_id', booking.match_id)
      .maybeSingle()
    stats = statsRow ?? null
  }

  return NextResponse.json({
    upload: upload ? {
      status:           upload.status,
      uploaded_at:      upload.uploaded_at,
      uploaded_by_name: uploadedByName,
      error_message:    upload.error_message,
      fees_applied_at:  upload.fees_applied_at,
    } : null,
    stats,
  })
}
