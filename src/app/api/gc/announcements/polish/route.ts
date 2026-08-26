// POST /api/gc/announcements/polish — GC/admin only. Runs a drafted
// announcement through Claude for grammar/clarity cleanup and returns the
// suggested rewrite. Never writes to the database and never sends a push —
// this is a preview step only. The sender always sees the result before
// anything is actually sent (see POST /api/gc/announcements).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { gcAnnouncementPolishSchema } from '@/lib/schemas'

async function requireGC() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isGC && !user?.isAdmin) {
    return { deny: NextResponse.json({ error: 'Unauthorised' }, { status: 403 }), user: null }
  }
  return { deny: null, user }
}

// Hardcoded system prompt — the sender's draft is passed only as the user
// message, never interpolated into the system prompt itself (same
// prompt-injection mitigation as /api/admin/nlp-parse).
const SYSTEM_PROMPT = `You are a copy editor for a cricket club's push notification announcements, sent by the Governing Council to all members.

Fix grammar, spelling, and clarity ONLY. Preserve the original meaning, tone, and intent exactly — do not add new information, do not soften or embellish, do not change facts, dates, names, or numbers. Keep it concise and suitable for a push notification (short, direct, no filler).

Respond ONLY with valid JSON, no markdown fences, no preamble:
{"title": "corrected title", "body": "corrected body"}`

export async function POST(req: NextRequest) {
  const { deny, user } = await requireGC()
  if (deny) return deny

  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = gcAnnouncementPolishSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':          apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: JSON.stringify({ title: parsed.data.title, body: parsed.data.body }) }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[gc-announcements] Anthropic API error:', err)
      return NextResponse.json({ error: 'AI polish failed' }, { status: 502 })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text ?? '{}'
    const clean = raw.replace(/```json\s?|```/g, '').trim()
    const polished = JSON.parse(clean)

    if (typeof polished.title !== 'string' || typeof polished.body !== 'string') {
      throw new Error('Malformed AI response')
    }

    return NextResponse.json({ title: polished.title, body: polished.body })
  } catch (err) {
    console.error('[gc-announcements] polish error:', err)
    return NextResponse.json({ error: 'Failed to polish announcement' }, { status: 500 })
  }
}
