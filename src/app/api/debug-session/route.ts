// src/app/api/debug-session/route.ts
// TEMPORARY — delete after debugging the invite-tokens 401
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  return NextResponse.json({
    hasSession:  !!session,
    email:       user?.email ?? null,
    playerId:    user?.playerId ?? null,
    isAdmin:     user?.isAdmin ?? null,
    isGC:        user?.isGC ?? null,
    playerName:  user?.playerName ?? null,
    playerStatus: user?.playerStatus ?? null,
  })
}
