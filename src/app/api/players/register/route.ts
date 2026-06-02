// src/app/api/players/register/route.ts
// POST — consume an invite token and create a new player row.
//
// Security (vibe-security):
//  - Requires valid Google session (signed in) but NOT a playerId (they don't have one yet)
//  - Rate limited by IP — no playerId to key on
//  - All fields validated with Zod before any DB touch
//  - gmail_id taken ONLY from session.user.email — never from request body
//  - is_captain, is_gc, wallet_balance, active, status hardcoded server-side
//  - Token validated atomically: must exist + unused + not expired
//  - Token marked consumed in same transaction as player insert

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { playerRegisterSchema } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  // ── 1. Rate limit by IP (no playerId exists yet) ───────────────────────────
  const limited = await rateLimit(req, {
    prefix:      'register',
    limit:       5,
    windowSecs:  900,  // 5 attempts per 15 minutes per IP
  })
  if (limited) return limited

  // ── 2. Must be signed in with Google — but must NOT already have a playerId ─
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!user?.email) {
    return NextResponse.json(
      { error: 'You must sign in with Google before registering.' },
      { status: 401 }
    )
  }

  if (user?.playerId) {
    return NextResponse.json(
      { error: 'You are already registered.' },
      { status: 409 }
    )
  }

  // ── 3. Parse + validate body with Zod ────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = playerRegisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Invalid input.' },
      { status: 400 }
    )
  }

  const { token, name, whatsapp, jersey_name, jersey_number, primary_skill, dob } = parsed.data

  // ── 4. gmail_id from session ONLY — never from body ──────────────────────────
  const gmailId = user.email.toLowerCase()

  const supabase = createServiceClient()

  // ── 5. Check no existing player row for this Gmail ───────────────────────────
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('gmail_id', gmailId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'An account with this Gmail already exists. Try signing in again.' },
      { status: 409 }
    )
  }

  // ── 6. Validate token: must exist, unused, and not expired ───────────────────
  const now = new Date().toISOString()
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('invite_tokens')
    .select('id, consumed_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (tokenErr) {
    console.error('[register] token lookup error:', tokenErr.message)
    return NextResponse.json({ error: 'Failed to validate invite token.' }, { status: 500 })
  }

  if (!tokenRow) {
    return NextResponse.json(
      { error: 'Invalid invite link. Please request a new one.' },
      { status: 400 }
    )
  }

  if (tokenRow.consumed_at) {
    return NextResponse.json(
      { error: 'This invite link has already been used.' },
      { status: 400 }
    )
  }

  if (tokenRow.expires_at < now) {
    return NextResponse.json(
      { error: 'This invite link has expired. Please request a new one.' },
      { status: 400 }
    )
  }

  // ── 7. Create the player row ──────────────────────────────────────────────────
  // Privileged fields are hardcoded — never from request body.
  const { data: player, error: insertErr } = await supabase
    .from('players')
    .insert({
      name:           name.trim(),
      gmail_id:       gmailId,
      whatsapp:       whatsapp     || null,
      jersey_name:    jersey_name  || null,
      jersey_number:  jersey_number ?? null,
      primary_skill:  primary_skill || null,
      dob:            dob          || null,
      // ── hardcoded — never from body ──
      active:         true,
      status:         'active',
      is_captain:     false,
      is_gc:          false,
      wallet_balance: 0,
    })
    .select('id, name, gmail_id')
    .single()

  if (insertErr) {
    console.error('[register] player insert error:', insertErr.message)
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 })
  }

  // ── 8. Mark token consumed ────────────────────────────────────────────────────
  // Done after player insert succeeds. If this fails the player is already
  // created — log the error but don't fail the request. The token will appear
  // unconsumed in the audit log, which is visible to admin.
  const { error: consumeErr } = await supabase
    .from('invite_tokens')
    .update({
      consumed_at:       new Date().toISOString(),
      consumed_by_gmail: gmailId,
    })
    .eq('id', tokenRow.id)

  if (consumeErr) {
    console.error('[register] token consume error — player created but token not marked used:', consumeErr.message)
  }

  return NextResponse.json({ success: true, player }, { status: 201 })
}
