// GET /api/admin/record-book — admin only. The full current records baseline
// (computed by the same code new scorecards are validated against). Feeds the
// "Current records" tab of /admin/records. See .claude/rules/features/record-breaking.md.
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRecordBook } from '@/lib/recordBreakDetect'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  try {
    return NextResponse.json({ records: await getRecordBook() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to compute records' }, { status: 500 })
  }
}
