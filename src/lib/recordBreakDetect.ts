// Server half of record-break detection — fetches every synced match, runs the
// pure detector (recordBreaks.ts), logs new breaks to record_breaks and pushes
// the admin(s) ONLY. Nothing is broadcast to players: the admin decides from
// /admin/records whether each break is shared to the club WhatsApp group.
// Called from syncMatchStatsForBooking(); best-effort, never throws.
// See .claude/rules/features/record-breaking.md.

import { createServiceClient } from '@/lib/supabase'
import { getTeamMatchesUncached } from '@/lib/teamStats'
import { notifyAdmins } from '@/lib/webpush'
import { isBeforeRecordAlertStart } from '@/lib/repullCutoff'
import { detectRecordBreaks, type RecordMatch } from '@/lib/recordBreaks'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function detectAndLogRecordBreaks(bookingId: string): Promise<void> {
  try {
    const supabase = createServiceClient()

    // Uncached on purpose: the cached variant may still hold the pre-sync list.
    const matches = await getTeamMatchesUncached()
    const target = matches.find(m => m.bookingId === bookingId)
    if (!target || target.isPractice || !target.format) return
    // Alerts start 24 Oct 2026 — earlier matches are history, never announced.
    if (isBeforeRecordAlertStart(target.gameDate)) return

    const sameFormat = matches.filter(m => !m.isPractice && m.format === target.format)
    const rows: any[] = []
    for (const ids of chunk(sameFormat.map(m => m.bookingId), 50)) {
      const { data, error } = await supabase
        .from('match_stats_cache')
        .select('booking_id, batting, bowling, fall_of_wickets')
        .in('booking_id', ids)
      if (error) { console.error('[record-breaks] cache read failed:', error.message); return }
      rows.push(...(data ?? []))
    }
    const byBooking = new Map<string, any>(rows.map(r => [r.booking_id, r]))

    const input: RecordMatch[] = sameFormat.map(m => {
      const c = byBooking.get(m.bookingId)
      return {
        bookingId: m.bookingId, gameDate: m.gameDate, format: m.format, isPractice: m.isPractice,
        opponentName: m.opponentLabel || m.opponentName, result: m.result, battedFirst: m.battedFirst,
        teamTotal: m.teamTotal, teamWickets: m.teamWickets, teamOvers: m.teamOvers,
        batting: c?.batting ?? [], bowling: c?.bowling ?? [], fallOfWickets: c?.fall_of_wickets ?? [],
      }
    })
    const targetInput = input.find(m => m.bookingId === bookingId)
    if (!targetInput) return

    const breaks = detectRecordBreaks(targetInput, input)
    if (!breaks.length) return

    // ON CONFLICT DO NOTHING: .select() returns only the rows actually inserted,
    // so a re-sync of an already-logged break neither duplicates nor re-notifies.
    const { data: inserted, error: insErr } = await supabase
      .from('record_breaks')
      .upsert(breaks.map(b => ({
        booking_id: bookingId, record_key: b.recordKey, scope_key: b.scopeKey,
        title: b.title, scope_label: b.scopeLabel, holder: b.holder, display: b.display,
        prev_holder: b.prevHolder, prev_display: b.prevDisplay,
        game_date: target.gameDate, opponent_name: target.opponentLabel || target.opponentName,
        message: b.message,
      })), { onConflict: 'booking_id,record_key,scope_key', ignoreDuplicates: true })
      .select('id, title, display, holder')
    if (insErr) { console.error('[record-breaks] insert failed:', insErr.message); return }
    if (!inserted?.length) return

    const first = inserted[0]
    await notifyAdmins(
      inserted.length === 1 ? '🏆 Record broken' : `🏆 ${inserted.length} records broken`,
      inserted.length === 1
        ? `${first.title}: ${first.display} — ${first.holder}. Share it or ignore?`
        : `${first.title}: ${first.display} — ${first.holder}, and ${inserted.length - 1} more. Review to share.`,
      '/admin/records'
    )
  } catch (err) {
    console.error('[record-breaks] detection failed:', err)
  }
}
