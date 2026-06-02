// src/app/api/invite-tokens/route.ts
// POST — generate an invite token (GC or Admin only)
// GET  — list all tokens with audit info (Admin only)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function requireGCOrAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.email) {
    return { error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }), user: null }
  }
  if (!user?.isGC && !user?.isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null }
  }
  return { error: null, user }
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

// ── POST /api/invite-tokens ──────────────────────────────────────────────────
// Generates a single-use 72hr invite token.
// Caller must be GC or Admin.

export async function POST(req: NextRequest) {
  const { error: authErr, user } = await requireGCOrAdmin()
  if (authErr) return authErr

  // Rate limit — keyed on player ID, using adminWrite preset (60/min)
  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user!.playerId)
  if (limited) return limited

  const supabase = createServiceClient()

  // Token value and expiry are set by DB defaults:
  //   token    → encode(gen_random_bytes(24), 'hex')  — 48-char hex, 192-bit entropy
  //   expires_at → now() + interval '72 hours'
  // created_by is the only field we supply — taken from session, never from body.
  const { data, error } = await supabase
    .from('invite_tokens')
    .insert({ created_by: user!.playerId ?? null })
    .select('token, expires_at')
    .single()

  if (error) {
    console.error('[invite-tokens] insert error:', error.message)
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://hub.spartanscricketclub.in'
  const joinUrl = `${baseUrl}/join?token=${data.token}`

  return NextResponse.json({
    token:      data.token,
    url:        joinUrl,
    expires_at: data.expires_at,
  }, { status: 201 })
}

// ── GET /api/invite-tokens ───────────────────────────────────────────────────
// Returns all tokens with audit info — Admin only.
// GC members can generate tokens but cannot audit the full list.

export async function GET(req: NextRequest) {
  const deny = await requireAdmin()
  if (deny) return deny

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('invite_tokens')
    .select(`
      id,
      token,
      expires_at,
      created_at,
      consumed_at,
      consumed_by_gmail,
      created_by_player:players!invite_tokens_created_by_fkey(name)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[invite-tokens] fetch error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://hub.spartanscricketclub.in'

  const tokens = (data ?? []).map(t => ({
    id:               t.id,
    token:            t.token,
    url:              `${baseUrl}/join?token=${t.token}`,
    created_by_name:  (t.created_by_player as any)?.name ?? 'Unknown',
    created_at:       t.created_at,
    expires_at:       t.expires_at,
    consumed_at:      t.consumed_at,
    consumed_by_gmail: t.consumed_by_gmail,
    status:           t.consumed_at
                        ? 'used'
                        : new Date(t.expires_at) < new Date()
                          ? 'expired'
                          : 'active',
  }))

  return NextResponse.json({ tokens })
}
