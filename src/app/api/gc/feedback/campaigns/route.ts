import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

async function requireGC() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isGC && !user?.isAdmin)
    return { guard: NextResponse.json({ error: 'Unauthorised' }, { status: 403 }), user: null }
  return { guard: null, user }
}

export async function GET() {
  const { guard } = await requireGC()
  if (guard) return guard
  const db = createServiceClient()
  const { data, error } = await db
    .from('feedback_campaigns')
    .select('id, title, questions, created_at, closed_at')
    .order('closed_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { guard, user } = await requireGC()
  if (guard) return guard
  const body = await req.json()
  const { title, questions = [] } = body
  if (!title || typeof title !== 'string' || title.trim().length < 3)
    return NextResponse.json({ error: 'Title must be at least 3 characters' }, { status: 400 })
  if (!Array.isArray(questions) || questions.length > 20)
    return NextResponse.json({ error: 'questions must be an array of up to 20 items' }, { status: 400 })
  if (questions.some((q: unknown) => typeof q !== 'string' || q.trim().length === 0))
    return NextResponse.json({ error: 'All questions must be non-empty strings' }, { status: 400 })
  const db = createServiceClient()
  const { data, error } = await db
    .from('feedback_campaigns')
    .insert({ title: title.trim(), questions, created_by: user!.playerId })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}