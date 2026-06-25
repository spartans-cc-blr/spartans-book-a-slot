import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendPushToPlayer } from '@/lib/webpush'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
if (!user?.playerId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const result = await sendPushToPlayer(user.playerId, {
    title: '🧪 Test Notification',
    body: 'Push notifications are working!',
    url: '/fixtures',
  })

  return NextResponse.json({ result })
}
