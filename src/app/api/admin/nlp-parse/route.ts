import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// ── Security: requireAdmin (mirrors pattern from all other admin routes) ──────
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  return null
}

// ── System prompt — hardcoded, user text never injected here ─────────────────
// Security: prompt injection mitigated by passing user text only as the user
// message, never interpolated into the system prompt itself.
function buildSystemPrompt(today: string, context: NLPContext): string {
  // id::name pairs — the model must be given the real id to return it; a
  // names-only list (the previous shape here) can never produce a genuine
  // uuid, only a hallucinated one. This is what actually lets captain_id/
  // tournament_id/ground_id resolve to something real instead of always
  // coming back null (or, worse, an invented id).
  const captainList    = context.captains.map(c => `${c.id}::${c.name}`).join(' | ')
  const groundList     = context.grounds.map(g => `${g.id}::${g.name}`).join(' | ')
  const tournamentList = context.tournaments.map(t => `${t.id}::${t.name}`).join(' | ')
  const bookingSummary = context.upcomingBookings
    .map(b => `ID:${b.id.slice(0, 8)} ${b.game_date} ${b.slot_time} ${b.format ?? 'soft_block'} ${b.captain_name ?? ''} ${b.tournament_name ?? ''}`)
    .join(' | ')

  return `You are a cricket club booking assistant for Spartans CC Bangalore admin. Parse natural language booking commands.

TODAY: ${today}

VALID SLOTS: 07:30, 10:30, 12:30, 14:30
VALID FORMATS: T20, T30
FORMAT-SLOT RULES: T30 only valid at 07:30 or 12:30. T20 valid at 07:30, 10:30, 14:30.
GAME DATES: Must be Saturday or Sunday only.

KNOWN CAPTAINS (id::name, match by name fuzzily/partial ok): ${captainList || 'none'}
KNOWN GROUNDS (id::name, match by name fuzzily/partial ok): ${groundList || 'none'}
KNOWN TOURNAMENTS (id::name, match by name fuzzily/partial ok): ${tournamentList || 'none'}

UPCOMING BOOKINGS (for modify/cancel — match by date+slot or short ID):
${bookingSummary || 'none'}

ACTIONS:
- "book" / "confirm" / "schedule" → action: "book" (new confirmed booking)
- "reserve" / "soft block" / "hold" / "block" → action: "reserve" (new soft block)
- "modify" / "change" / "update" / "edit" → action: "modify" (edit existing)
- "cancel" / "remove" / "delete" / "drop" → action: "cancel" (cancel existing)

DATE PARSING RULES:
- "26/apr", "26 apr", "april 26" → parse as next occurrence if in future, else same year
- "saturday", "sunday", "this sat", "next sat" → compute actual date from today ${today}
- "tomorrow", "this weekend" → compute from today
- Always output as YYYY-MM-DD

SLOT PARSING RULES:
- "7:30am", "07:30", "morning", "7:30" → 07:30
- "10:30", "10:30am", "mid morning" → 10:30
- "12:30", "12:30pm", "noon" → 12:30
- "2:30", "14:30", "2:30pm", "afternoon" → 14:30

CAPTAIN MATCHING: Match captain names fuzzily against KNOWN CAPTAINS. "Muthu" → find best match, return its real id as captain_id and its name as captain_name. No confident match → both null. Never invent an id.

GROUND MATCHING: Match ground/venue mentions fuzzily against KNOWN GROUNDS. Return the matching real id as ground_id and its name as ground_name. No confident match (e.g. a ground not in the list at all) → both null. Never invent an id or return raw unmatched text as ground_id.

For MODIFY actions, identify the target booking from the upcoming bookings list using date+slot or partial ID. Set booking_id.
For CANCEL actions, same — identify booking_id from the list.

Respond ONLY with valid JSON, no markdown fences, no preamble:
{
  "action": "book" | "reserve" | "modify" | "cancel",
  "booking_id": "uuid or null (for modify/cancel — use full uuid from the list)",
  "game_date": "YYYY-MM-DD or null",
  "slot_time": "07:30|10:30|12:30|14:30 or null",
  "format": "T20|T30|null",
  "captain_id": "uuid or null",
  "captain_name": "matched name or null",
  "tournament_id": "uuid or null",
  "tournament_name": "matched name or null",
  "ground_id": "uuid from KNOWN GROUNDS or null — never invented",
  "ground_name": "matched name or null",
  "organiser_name": "string or null (for reserves)",
  "organiser_phone": "string or null",
  "notes": "string or null",
  "opponent_name": "string or null",
  "confidence": "high|medium|low",
  "issues": ["array of validation issues or format warnings"],
  "summary": "one line human-readable summary of what was parsed"
}`
}

interface NLPContext {
  captains: { id: string; name: string }[]
  grounds: { id: string; name: string }[]
  tournaments: { id: string; name: string }[]
  upcomingBookings: {
    id: string
    game_date: string
    slot_time: string
    format: string | null
    captain_name: string | null
    tournament_name: string | null
  }[]
}

export async function POST(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const authError = await requireAdmin()
  if (authError) return authError

  // ── Input validation ──────────────────────────────────────────────────────
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { text, context } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }
  // Hard cap — prevent abuse / runaway tokens
  if (text.length > 500) {
    return NextResponse.json({ error: 'Input too long (max 500 chars)' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  // ── Call Anthropic API (server-side only — key never exposed to client) ───
  // Security: ANTHROPIC_API_KEY has no NEXT_PUBLIC_ prefix
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
  }

  let parsed: any
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: buildSystemPrompt(today, context ?? { captains: [], grounds: [], tournaments: [], upcomingBookings: [] }),
        // Security: user text goes ONLY in the user message — not interpolated into system prompt
        messages: [{ role: 'user', content: text }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic API error:', err)
      return NextResponse.json({ error: 'AI parse failed' }, { status: 502 })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text ?? '{}'

    // Strip any accidental markdown fences
    const clean = raw.replace(/```json\s?|```/g, '').trim()
    parsed = JSON.parse(clean)
  } catch (err) {
    console.error('NLP parse error:', err)
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  return NextResponse.json(parsed)
}