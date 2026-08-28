import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { findIneligiblePlayers } from '@/lib/squadValidation'
import { computeSquadVersion, type SquadVersionRow } from '@/lib/squadVersion'

async function requireCaptain() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }), player: null }
  if (!user?.isCaptain && !user?.isAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), player: null }
  return { error: null, player: user }
}

// A squad locked into GC review/approval/announcement must not be silently
// reverted to draft by a plain save — see POST below.
const LOCKED_STATUSES = ['pending_approval', 'approved', 'announced']

// The weekend currently "open" for squad selection: the Sat/Sun governed by
// the most recent Thursday on/before now (mirrors the lock-availability
// cron's own thursday+2/+3 calc, but anchored to the Thursday that just
// passed rather than the next one — the window stays open Thu 8am IST
// through Sunday for that Thursday's own weekend).
function getActiveLockWeekend(nowIST: Date) {
  const dow = nowIST.getDay()   // 0=Sun .. 6=Sat
  const daysSinceThursday = (dow - 4 + 7) % 7
  const thursday = new Date(nowIST)
  thursday.setDate(nowIST.getDate() - daysSinceThursday)
  const saturday = new Date(thursday)
  saturday.setDate(thursday.getDate() + 2)
  const sunday = new Date(saturday)
  sunday.setDate(saturday.getDate() + 1)
  return {
    saturday: saturday.toISOString().split('T')[0],
    sunday:   sunday.toISOString().split('T')[0],
  }
}

function buildCurrentSnapshot(rows: SquadVersionRow[]) {
  return {
    player_ids: rows.map(r => r.player_id),
    roles: {
      captain: rows.find(r => r.is_captain)?.player_id ?? null,
      vc:      rows.find(r => r.is_vc)?.player_id ?? null,
      wk:      rows.filter(r => r.is_wk).map(r => r.player_id),
    },
    match_roles: Object.fromEntries(rows.filter(r => r.match_role).map(r => [r.player_id, r.match_role])),
    status:  rows[0]?.status ?? null,
    version: computeSquadVersion(rows),
  }
}

// GET /api/squad?booking_id=xxx
export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get('booking_id')
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const { error: authErr } = await requireCaptain()

  const supabase = createServiceClient()
  const query = supabase
    .from('squad')
    .select('player_id, status, is_captain, is_vc, is_wk, match_role, players(id, name, primary_skill, cricheroes_url)')
    .eq('booking_id', bookingId)

  // Non-captains only see announced rows
  if (authErr) {
    query.eq('status', 'announced')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const version = computeSquadVersion(
    (data ?? []).map((r: any) => ({
      player_id: r.player_id, status: r.status, is_captain: r.is_captain,
      is_vc: r.is_vc, is_wk: r.is_wk, match_role: r.match_role ?? null,
    }))
  )

  return NextResponse.json({ squad: data, version })
}

// POST /api/squad — save draft selection with roles
export async function POST(req: NextRequest) {
  const { error: authErr, player } = await requireCaptain()
  if (authErr) return authErr

  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, player!.playerId)
  if (limited) return limited

  const {
    booking_id, player_ids, roles, match_roles: matchRoles,
    expected_version, reopen,
  } = await req.json()
  // player_ids: string[]
  // roles: { captain: string | null, vc: string | null, wk: string[] }
  // expected_version: string — fingerprint of the squad this client last fetched (optimistic concurrency)
  // reopen: boolean — required explicit confirmation to edit a pending_approval/approved/announced squad

  if (!booking_id || !Array.isArray(player_ids))
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Hard cap enforced server-side — never trust client count
  if (player_ids.length > 12)
    return NextResponse.json({ error: 'Squad cannot exceed 12 players' }, { status: 400 })

  // Validate roles reference only players in the squad
  const captainId: string | null = roles?.captain ?? null
  const vcId:      string | null = roles?.vc ?? null
  const wkIds:     string[]      = Array.isArray(roles?.wk) ? roles.wk : []

  if (captainId && !player_ids.includes(captainId))
    return NextResponse.json({ error: 'Captain must be in the squad' }, { status: 400 })
  if (vcId && !player_ids.includes(vcId))
    return NextResponse.json({ error: 'Vice captain must be in the squad' }, { status: 400 })
  for (const wkId of wkIds) {
    if (!player_ids.includes(wkId))
      return NextResponse.json({ error: 'Wicket keeper must be in the squad' }, { status: 400 })
  }

  // WK cannot double as a bowling role — validated up front (was previously
  // validated after the delete, which meant a rejected save could leave a
  // booking's squad wiped with nothing re-inserted).
  for (const pid of player_ids) {
    const role = matchRoles?.[pid]
    if (wkIds.includes(pid) && (role === 'bowl' || role === 'bowl_ar')) {
      return NextResponse.json({ error: 'WK cannot be assigned BOWL or BOWL-AR role' }, { status: 422 })
    }
  }

  const supabase = createServiceClient()

  // Fetch current squad rows once — powers the time gate, the staleness
  // check, and the status-transition guard below.
  const { data: currentRowsRaw, error: currentErr } = await supabase
    .from('squad')
    .select('player_id, status, is_captain, is_vc, is_wk, match_role')
    .eq('booking_id', booking_id)
  if (currentErr) return NextResponse.json({ error: currentErr.message }, { status: 500 })
  const currentRows: SquadVersionRow[] = (currentRowsRaw ?? []) as SquadVersionRow[]
  const currentStatus  = currentRows[0]?.status ?? null
  const currentVersion = computeSquadVersion(currentRows)

  // Time gate — only applies when no squad exists yet for this booking.
  // Editing an existing draft (any status) is always allowed.
  // Window: blocked Mon–Wed and Thursday before 08:00 IST; allowed
  // Thursday 08:00 IST onward through Sunday — but only for the booking
  // whose own game_date is the weekend that window governs. Without this,
  // Captains Corner's up-to-20-bookings view lets a captain draft (and
  // thereby freeze — see the lock write below) a squad for a weekend
  // still over a week out, well before that weekend's own Thursday.
  if (currentRows.length === 0) {
    const nowIST = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000)
    const day     = nowIST.getDay()   // 0=Sun .. 6=Sat
    const hour    = nowIST.getHours()
    const isBlockedWindow = (day >= 1 && day <= 3) || (day === 4 && hour < 8)
    if (isBlockedWindow) {
      return NextResponse.json(
        { error: 'Squad selection opens Thursday 08:00 IST' },
        { status: 403 }
      )
    }

    const { data: bookingRow } = await supabase
      .from('bookings')
      .select('game_date')
      .eq('id', booking_id)
      .single()
    const activeWeekend = getActiveLockWeekend(nowIST)
    const isActiveWeekend = !!bookingRow &&
      (bookingRow.game_date === activeWeekend.saturday || bookingRow.game_date === activeWeekend.sunday)
    if (!isActiveWeekend) {
      return NextResponse.json(
        { error: 'Squad selection for this match opens on the Thursday before its own weekend' },
        { status: 403 }
      )
    }
  }

  // Staleness check — reject rather than silently overwrite if the squad
  // changed since this client last fetched it. Skipped when no squad
  // exists yet (nothing to conflict with) or the client sent no version
  // (defensive fallback — this app's client always sends one).
  if (currentRows.length > 0 && expected_version && expected_version !== currentVersion) {
    return NextResponse.json(
      {
        error: 'This squad was updated since you last loaded it. Refresh to see the latest before saving.',
        stale: true,
        current: buildCurrentSnapshot(currentRows),
      },
      { status: 409 }
    )
  }

  // Status-transition guard — a plain save must not silently revert a
  // squad that's pending GC review, approved, or announced back to draft.
  // Editing one of those requires an explicit, logged reopen (see below).
  if (currentStatus && LOCKED_STATUSES.includes(currentStatus) && !reopen) {
    return NextResponse.json(
      {
        error: `This squad is ${currentStatus} — reopen it for editing before making changes.`,
        needsReopen: true,
        current: buildCurrentSnapshot(currentRows),
      },
      { status: 409 }
    )
  }

  // Reopen authorization — a squad that's pending review, approved, or
  // announced is only reopenable by this match's captain/VC or an admin.
  // Starting a fresh draft, or resaving one still in draft, stays open to
  // any captain — this only gates the locked -> draft transition, which is
  // the high-consequence step (a real incident: an unrelated captain
  // accidentally reopened an already-announced squad while working a
  // different match's squad).
  //
  // "This match's captain/VC" checks two distinct things, either sufficient:
  //   1. squad.is_captain / squad.is_vc — the on-field match captain/VC for
  //      this specific game.
  //   2. tournaments.captain_id / vc_captain_id — the club's assigned
  //      captain/VC for the tournament this booking belongs to. These
  //      genuinely differ in practice (the person who builds/announces a
  //      tournament's squads is often not the player designated to lead
  //      the XI on the field for one match) — checking only #1 would block
  //      the tournament's own captain from reopening a squad they manage
  //      whenever someone else is tagged as on-field captain.
  if (currentStatus && LOCKED_STATUSES.includes(currentStatus)) {
    const squadCaptainId = currentRows.find(r => r.is_captain)?.player_id ?? null
    const squadVcId      = currentRows.find(r => r.is_vc)?.player_id ?? null

    let tournamentCaptainId: string | null = null
    let tournamentVcId: string | null = null
    const { data: bookingRow } = await supabase
      .from('bookings')
      .select('tournament:tournaments(captain_id, vc_captain_id)')
      .eq('id', booking_id)
      .single()
    const tournamentRow = (bookingRow as any)?.tournament ?? null
    if (tournamentRow) {
      const captainRowIds = [tournamentRow.captain_id, tournamentRow.vc_captain_id].filter(Boolean)
      if (captainRowIds.length > 0) {
        const { data: captainRows } = await supabase
          .from('captains')
          .select('id, player_id')
          .in('id', captainRowIds)
        tournamentCaptainId = (captainRows ?? []).find((c: any) => c.id === tournamentRow.captain_id)?.player_id ?? null
        tournamentVcId      = (captainRows ?? []).find((c: any) => c.id === tournamentRow.vc_captain_id)?.player_id ?? null
      }
    }

    const isMatchLeader =
      player!.playerId === squadCaptainId ||
      player!.playerId === squadVcId ||
      player!.playerId === tournamentCaptainId ||
      player!.playerId === tournamentVcId

    if (!player!.isAdmin && !isMatchLeader) {
      return NextResponse.json(
        { error: "Only this match's captain, vice-captain, or an admin can reopen a squad that is pending review, approved, or announced." },
        { status: 403 }
      )
    }
  }

  // Availability gate — reject rather than silently drop; role assignments
  // (captain/VC/WK) could be affected by dropping a player after the fact.
  let ineligible: string[]
  try {
    ineligible = await findIneligiblePlayers(supabase, booking_id, player_ids)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  if (ineligible.length > 0) {
    return NextResponse.json(
      { error: 'Some selected players are not available (L or no response) for this match', player_ids: ineligible },
      { status: 400 }
    )
  }

  const wasLocked = currentStatus !== null && LOCKED_STATUSES.includes(currentStatus)

  // Delete all existing rows for this booking regardless of status,
  // then re-insert fresh. This handles edits to announced squads
  // without hitting the (player_id, booking_id) unique constraint.
  await supabase.from('squad')
    .delete()
    .eq('booking_id', booking_id)

  let finalRows: SquadVersionRow[] = []
  if (player_ids.length > 0) {
    const rows = player_ids.map((pid: string) => ({
      booking_id,
      player_id:  pid,
      status:     'draft',
      is_captain: pid === captainId,
      is_vc:      pid === vcId,
      is_wk:      wkIds.includes(pid),
      match_role: matchRoles?.[pid] ?? null,
    }))

    const { error } = await supabase.from('squad').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    finalRows = rows
  }

  // Lock availability the moment a squad is drafted — only when there's an
  // actual squad. An empty save (player_ids: []) is not a draft in progress
  // and must not freeze the booking on its own.
  if (player_ids.length > 0) {
    await supabase
      .from('bookings')
      .update({ availability_locked: true })
      .eq('id', booking_id)
  }

  // Audit the reopen — a real status transition (locked → draft) caused by
  // this route, not just an ordinary in-draft resave. Reuses the 'returned'
  // action value (closest existing meaning: squad kicked back to draft) —
  // squad_audit's action CHECK constraint isn't being altered as part of
  // this fix; the note makes the actual mechanism unambiguous.
  if (wasLocked) {
    supabase
      .from('squad_audit')
      .insert({
        booking_id,
        action: 'returned',
        actor_id: player!.playerId,
        note: `Reopened for editing via squad save (was ${currentStatus})`,
      })
      .then(({ error }) => {
        if (error) console.error('[squad_audit] insert failed:', error.message)
      })
  }

  return NextResponse.json({ ok: true, version: computeSquadVersion(finalRows) })
}
