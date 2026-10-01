import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetServerSession = vi.fn()
let booking: { match_id: string | null } | null = null
let analyticsResult: { data: any[] | null; error: { message: string } | null } = { data: [], error: null }
let analyticsClient: any
const analyticsCalls: Record<string, any[]> = {}

vi.mock('next-auth', () => ({ getServerSession: (...a: any[]) => mockGetServerSession(...a) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: () => {
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: booking }) }
      return q
    },
  }),
}))
vi.mock('@/lib/playerIdentityResolution', () => ({ createAnalyticsClient: () => analyticsClient }))

import { GET } from '../route'

const call = () => GET(new NextRequest('http://localhost/x'), { params: { bookingId: 'b1' } })

beforeEach(() => {
  mockGetServerSession.mockReset()
  mockGetServerSession.mockResolvedValue({ user: { playerId: 'p1' } })
  booking = { match_id: '26452955' }
  analyticsResult = { data: [{ seq: 1 }, { seq: 2 }], error: null }
  for (const k of Object.keys(analyticsCalls)) delete analyticsCalls[k]
  analyticsClient = {
    from: (table: string) => {
      analyticsCalls.table = [table]
      const q: any = {
        select: (c: string) => { analyticsCalls.select = [c]; return q },
        eq: (col: string, v: string) => { analyticsCalls.eq = [col, v]; return q },
        order: () => q,
        limit: async () => analyticsResult,
      }
      return q
    },
  }
})

describe('GET commentary', () => {
  it('401 without a session, 403 for an expelled member', async () => {
    mockGetServerSession.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    mockGetServerSession.mockResolvedValue({ user: { playerId: 'p1', playerStatus: 'expelled' } })
    expect((await call()).status).toBe(403)
  })

  it('returns the rows for the booking\'s match from the linked view', async () => {
    const res = await call()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ available: true, balls: [{ seq: 1 }, { seq: 2 }] })
    expect(analyticsCalls.table).toEqual(['ball_by_ball_linked'])
    expect(analyticsCalls.eq).toEqual(['match_id', '26452955'])
    expect(analyticsCalls.select[0]).toContain('bowler_player_id')
  })

  it('available:false when the match has no commentary, no match id, or no analytics client', async () => {
    analyticsResult = { data: [], error: null }
    expect(await (await call()).json()).toEqual({ available: false, balls: [] })
    booking = { match_id: null }
    expect(await (await call()).json()).toEqual({ available: false, balls: [] })
    booking = { match_id: '1' }
    analyticsClient = null
    expect(await (await call()).json()).toEqual({ available: false, balls: [] })
  })

  it('falls back to available:false (not an error page) when the analytics read fails', async () => {
    analyticsResult = { data: null, error: { message: 'relation does not exist' } }
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ available: false, balls: [] })
  })
})
