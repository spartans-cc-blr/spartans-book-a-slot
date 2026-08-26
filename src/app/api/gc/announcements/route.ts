// GET  /api/gc/announcements — GC/admin only. Last 20 sent announcements,
//      for the accountability history list on the compose page.
// POST /api/gc/announcements — GC/admin only. Actually sends: broadcasts a
//      push notification to every player with an active subscription, then
//      writes an audit row. Rate-limited far tighter than every other write
//      route in this app (RATE_LIMITS.broadcast) — this reaches every
//      subscribed player's phone in one call, not just a database row.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { gcAnnouncementSendSchema } from '@/lib/schemas'
import { notifyAllSubscribedPlayers } from '@/lib/webpush'

async function requireGC() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isGC && !user?.isAdmin) {
    return { deny: NextResponse.json({ error: 'Unauthorised' }, { status: 403 }), user: null }
  }
  return { deny: null, user }
}

export async function GET() {
  const { deny } = await requireGC()
  if (deny) return deny

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('gc_announcements')
    .select('id, title, body, original_body, recipient_count, created_at, players(name)')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    announcements: (data ?? []).map((a: any) => ({
      id:              a.id,
      title:           a.title,
      body:            a.body,
      original_body:   a.original_body,
      recipient_count: a.recipient_count,
      created_at:      a.created_at,
      sent_by_name:    a.players?.name ?? 'Unknown',
    })),
  })
}

export async function POST(req: NextRequest) {
  const { deny, user } = await requireGC()
  if (deny) return deny

  const limited = await rateLimit(req, RATE_LIMITS.broadcast, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = gcAnnouncementSendSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const { title, body: text, original_body } = parsed.data

  // Send first, then record what actually happened — recipient_count
  // reflects the real send, not a pre-send estimate.
  const { recipientCount } = await notifyAllSubscribedPlayers(title, text, '/')

  const supabase = createServiceClient()
  const { error } = await supabase.from('gc_announcements').insert({
    sent_by:         user.playerId,
    title,
    body:            text,
    original_body:   original_body && original_body !== text ? original_body : null,
    recipient_count: recipientCount,
  })

  // The push already went out at this point — an audit-row failure
  // shouldn't be reported to the sender as "the send failed" when it
  // didn't. Logged for follow-up, not surfaced as an error.
  if (error) console.error('[gc-announcements] audit row insert failed:', error)

  return NextResponse.json({ ok: true, recipient_count: recipientCount })
}
