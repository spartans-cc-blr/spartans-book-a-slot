// Regression tests for the July 2026 incident (booking ec66fa26-5cfd-41bc-
// 8032-d11c4de674af): a GC member's stale Captains Corner tab silently
// overwrote a captain's already-submitted squad, reverting its status from
// pending_approval back to draft and wiping the is_captain/is_vc/is_wk role
// flags, with no audit trail of what happened.
//
// These tests exercise the real POST/GET handlers from route.ts against an
// in-memory fake Supabase client (src/app/api/squad/__tests__/fakeSupabase.ts)
// — no live database is touched.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeSupabase, type FakeTables } from './fakeSupabase'
import { EMPTY_SQUAD_VERSION } from '@/lib/squadVersion'

let tables: FakeTables

const mockGetServerSession = vi.fn()

vi.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => null,
  RATE_LIMITS: { captainWrite: { prefix: 'cw', limit: 999, windowSecs: 60 } },
}))
vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => createFakeSupabase(tables),
}))

// vi.mock calls above are hoisted above this import by vitest's transform,
// so route.ts picks up the mocked modules despite the textual ordering here.
import { GET, POST } from '../route'

function captainSession(playerId: string) {
  return { user: { playerId, isCaptain: true, isAdmin: false } }
}

function getRequest(bookingId: string) {
  return new NextRequest(`http://localhost/api/squad?booking_id=${bookingId}`)
}

function postRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/squad', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function seedAvailability(bookingId: string, playerIds: string[], response: 'Y' | 'O' | 'E' | 'L' = 'Y') {
  tables.availability.push(...playerIds.map(player_id => ({ player_id, booking_id: bookingId, response })))
}

beforeEach(() => {
  tables = { squad: [], availability: [], bookings: [], squad_audit: [], players: [] }
  mockGetServerSession.mockReset()
})

describe('POST /api/squad — stale write blocking (Issue 1)', () => {
  it('blocks a save from a session that never refreshed after another session already saved', async () => {
    const bookingId = 'booking-1'
    seedAvailability(bookingId, ['p1', 'p2', 'p3'])

    // Both "tabs" load the squad at the same time — booking has no squad yet.
    mockGetServerSession.mockResolvedValue(captainSession('captain-a'))
    const initialFetch = await GET(getRequest(bookingId))
    const initialBody  = await initialFetch.json()
    expect(initialBody.version).toBe(EMPTY_SQUAD_VERSION)

    // Session A (the captain) makes a correction and saves — matches step 3
    // of the incident: captain removes the wrong player, adds the right one.
    const sessionARes = await POST(postRequest({
      booking_id: bookingId,
      player_ids: ['p1', 'p2'],
      roles: { captain: 'p1', vc: null, wk: [] },
      match_roles: {},
      expected_version: initialBody.version,
    }))
    expect(sessionARes.status).toBe(200)
    const sessionABody = await sessionARes.json()
    expect(sessionABody.version).not.toBe(EMPTY_SQUAD_VERSION)

    // Session B (the GC member's tab, opened before A's correction and never
    // refreshed) still believes the version is the original empty one and
    // tries to save its own — stale — view.
    mockGetServerSession.mockResolvedValue(captainSession('gc-member-b'))
    const sessionBRes = await POST(postRequest({
      booking_id: bookingId,
      player_ids: ['p1', 'p3'],           // B's stale, pre-correction selection
      roles: { captain: 'p1', vc: null, wk: [] },
      match_roles: {},
      expected_version: initialBody.version, // stale — same as the initial fetch
    }))

    expect(sessionBRes.status).toBe(409)
    const sessionBBody = await sessionBRes.json()
    expect(sessionBBody.stale).toBe(true)
    expect(sessionBBody.error).toMatch(/updated since you last loaded it/i)

    // Critically: the DB must still reflect session A's write, not B's.
    const finalSquad = tables.squad.filter(r => r.booking_id === bookingId)
    const finalPlayerIds = finalSquad.map(r => r.player_id).sort()
    expect(finalPlayerIds).toEqual(['p1', 'p2'])
    expect(finalSquad.find(r => r.is_captain)?.player_id).toBe('p1')

    // The 409 response hands back the real current state so the stale tab
    // can reconcile itself instead of silently overwriting.
    expect(sessionBBody.current.player_ids.sort()).toEqual(['p1', 'p2'])
    expect(sessionBBody.current.version).toBe(sessionABody.version)
  })
})

describe('POST /api/squad — role preservation and status-transition guard (Issue 2)', () => {
  it('preserves role flags across a normal resave when they are not explicitly changed', async () => {
    const bookingId = 'booking-2'
    seedAvailability(bookingId, ['p1', 'p2', 'p3'])
    mockGetServerSession.mockResolvedValue(captainSession('captain-a'))

    const roles = { captain: 'p1', vc: 'p2', wk: ['p2'] }

    const first = await POST(postRequest({
      booking_id: bookingId,
      player_ids: ['p1', 'p2'],
      roles,
      match_roles: {},
      expected_version: EMPTY_SQUAD_VERSION,
    }))
    expect(first.status).toBe(200)
    const firstBody = await first.json()

    // Resave with the exact same roles the client already had — the
    // ordinary "toggle a checkbox, saveDraft() fires again" path.
    const second = await POST(postRequest({
      booking_id: bookingId,
      player_ids: ['p1', 'p2'],
      roles,
      match_roles: {},
      expected_version: firstBody.version,
    }))
    expect(second.status).toBe(200)

    const rows = tables.squad.filter(r => r.booking_id === bookingId)
    expect(rows.find(r => r.player_id === 'p1')?.is_captain).toBe(true)
    expect(rows.find(r => r.player_id === 'p2')?.is_vc).toBe(true)
    expect(rows.find(r => r.player_id === 'p2')?.is_wk).toBe(true)
  })

  it('refuses to silently revert a pending_approval squad to draft, and logs an explicit reopen', async () => {
    const bookingId = 'booking-3'
    seedAvailability(bookingId, ['p1', 'p2'])
    mockGetServerSession.mockResolvedValue(captainSession('captain-a'))

    const roles = { captain: 'p1', vc: 'p2', wk: [] }
    const created = await POST(postRequest({
      booking_id: bookingId,
      player_ids: ['p1', 'p2'],
      roles,
      match_roles: {},
      expected_version: EMPTY_SQUAD_VERSION,
    }))
    const createdBody = await created.json()

    // Simulate POST /api/squad/submit having flipped the squad to
    // pending_approval (that route is exercised separately — here we only
    // need squad/route.ts's reaction to a locked status).
    tables.squad.filter(r => r.booking_id === bookingId).forEach(r => { r.status = 'pending_approval' })
    const lockedFetch  = await GET(getRequest(bookingId))
    const lockedBody   = await lockedFetch.json()

    // A plain save arrives — e.g. a stale tab whose local status still
    // says 'draft' toggles a checkbox — WITHOUT an explicit reopen flag.
    mockGetServerSession.mockResolvedValue(captainSession('gc-member-b'))
    const blocked = await POST(postRequest({
      booking_id: bookingId,
      player_ids: ['p1'],
      roles: { captain: null, vc: null, wk: [] },
      match_roles: {},
      expected_version: lockedBody.version,
    }))
    expect(blocked.status).toBe(409)
    const blockedBody = await blocked.json()
    expect(blockedBody.needsReopen).toBe(true)

    // Status and roles must be untouched — this is the exact incident bug:
    // status silently reverting to draft and roles being wiped to false.
    const stillLocked = tables.squad.filter(r => r.booking_id === bookingId)
    expect(stillLocked.every(r => r.status === 'pending_approval')).toBe(true)
    expect(stillLocked.find(r => r.player_id === 'p1')?.is_captain).toBe(true)
    expect(stillLocked.find(r => r.player_id === 'p2')?.is_vc).toBe(true)
    expect(tables.squad_audit.length).toBe(0) // no phantom transition logged for the blocked attempt

    // The captain explicitly reopens for editing (the "Edit" button flow).
    mockGetServerSession.mockResolvedValue(captainSession('captain-a'))
    const reopened = await POST(postRequest({
      booking_id: bookingId,
      player_ids: ['p1', 'p2'],
      roles,
      match_roles: {},
      expected_version: lockedBody.version,
      reopen: true,
    }))
    expect(reopened.status).toBe(200)

    const afterReopen = tables.squad.filter(r => r.booking_id === bookingId)
    expect(afterReopen.every(r => r.status === 'draft')).toBe(true)
    expect(afterReopen.find(r => r.player_id === 'p1')?.is_captain).toBe(true)

    // The reopen — a real status transition — must leave an audit trail,
    // unlike the incident where step 6 left zero record anywhere.
    expect(tables.squad_audit.length).toBe(1)
    expect(tables.squad_audit[0]).toMatchObject({
      booking_id: bookingId,
      action: 'returned',
      actor_id: 'captain-a',
    })
    expect(tables.squad_audit[0].note).toMatch(/reopened for editing/i)
    expect(tables.squad_audit[0].note).toMatch(/pending_approval/)
  })
})
