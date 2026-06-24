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

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { guard } = await requireGC()
  if (guard) return guard
  const body = await req.json()
  const { questions } = body
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > 20)
    return NextResponse.json({ error: 'questions must be a non-empty array of up to 20 items' }, { status: 400 })
  if (questions.some((q: unknown) => typeof q !== 'string' || q.trim().length === 0))
    return NextResponse.json({ error: 'All questions must be non-empty strings' }, { status: 400 })
  const db = createServiceClient()
  const { data: campaign } = await db
    .from('feedback_campaigns')
    .select('id, questions, closed_at')
    .eq('id', params.id)
    .single()
  if (!campaign)
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.closed_at)
    return NextResponse.json({ error: 'Campaign is closed — questions cannot be modified' }, { status: 409 })
  const { count: responseCount } = await db
    .from('feedback_responses')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', params.id)
  const existingQuestions = campaign.questions as string[]
  const existingCount = existingQuestions.length
  const isEditingExisting =
    questions.length < existingCount ||
    questions.slice(0, existingCount).some(
      (q: string, i: number) => q.trim() !== existingQuestions[i]
    )
  if (isEditingExisting && (responseCount ?? 0) > 0)
    return NextResponse.json(
      { error: 'Cannot edit existing questions once responses have been collected. You may only append new questions.' },
      { status: 409 }
    )
  const { error } = await db
    .from('feedback_campaigns')
    .update({ questions: questions.map((q: string) => q.trim()) })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}