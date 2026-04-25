// src/app/api/admin/nlp-parse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const SYSTEM_PROMPT = `You are a booking parser for Spartans Cricket Club admin.
Extract booking intent from natural language. Today is ${new Date().toISOString().split('T')[0]}.

Valid slots: 07:30, 10:30, 12:30, 14:30
Valid formats: T20, T30
T30 only valid at 07:30 or 12:30
Actions: "book"=confirmed booking, "reserve"/"soft block"=soft_block

Respond ONLY with JSON, no markdown:
{
  "action": "book" | "reserve",
  "game_date": "YYYY-MM-DD" | null,
  "slot_time": "07:30"|"10:30"|"12:30"|"14:30" | null,
  "format": "T20"|"T30" | null,
  "venue": string | null,
  "confidence": "high"|"medium"|"low",
  "issues": string[]
}`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const { text } = await req.json()
  if (!text || typeof text !== 'string' || text.length > 300) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    }),
  })

  const data = await response.json()
  const raw = data.content?.[0]?.text ?? '{}'
  
  try {
    const parsed = JSON.parse(raw)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Parse failed', raw }, { status: 500 })
  }
}
