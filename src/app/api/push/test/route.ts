import { NextResponse } from 'next/server'
import { sendPushToPlayer } from '@/lib/webpush'

export async function GET() {
  const result = await sendPushToPlayer('13a971e4-e4d0-4b8c-9cb2-977640381c1a', {
    title: '🧪 Test Notification',
    body: 'Push notifications are working!',
    url: '/fixtures',
  })
  return NextResponse.json({ result })
}
