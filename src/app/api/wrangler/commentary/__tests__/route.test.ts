// POST /api/wrangler/commentary: auth, input validation and the hand-off to the
// microservice's /parse-commentary. Supabase and the microservice are faked; no
// network or database is touched.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetServerSession = vi.fn()
let bookingRow: { id: string; match_id: string | null } | null = null

vi.mock('next-auth', () => ({ getServerSession: (...a: any[]) => mockGetServerSession(...a) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/rateLimit', () => ({
  rateLimit: async () => null,
  RATE_LIMITS: { adminWrite: { prefix: 'aw', limit: 999, windowSecs: 60 } },
}))
vi.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: () => {
      const q: any = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: bookingRow }),
      }
      return q
    },
  }),
}))

import { POST } from '../route'

const BOOKING = '3f1f6c3e-7b0e-4a53-9a43-2f0f6d1d6a11'
const wrangler = { user: { playerId: 'p1', isWrangler: true, isAdmin: false } }

function request(fields: Record<string, string | Blob>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new NextRequest('http://localhost/api/wrangler/commentary', { method: 'POST', body: fd })
}

const pdf = () => new Blob(['%PDF-1.4 commentary'], { type: 'application/pdf' })
const good = () => ({ file: pdf(), booking_id: BOOKING, side: 'opponent' })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockGetServerSession.mockReset()
  mockGetServerSession.mockResolvedValue(wrangler)
  bookingRow = { id: BOOKING, match_id: '26452955' }
  process.env.MICROSERVICE_URL = 'https://py.example.com/'
  process.env.MICROSERVICE_SECRET = 's3cret'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('auth', () => {
  it('401 without a session', async () => {
    mockGetServerSession.mockResolvedValue(null)
    expect((await POST(request(good()))).status).toBe(401)
  })

  it('403 for a captain who is not a wrangler or admin', async () => {
    mockGetServerSession.mockResolvedValue({ user: { playerId: 'p2', isCaptain: true } })
    expect((await POST(request(good()))).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lets an admin through', async () => {
    mockGetServerSession.mockResolvedValue({ user: { playerId: 'p3', isAdmin: true } })
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    expect((await POST(request(good()))).status).toBe(200)
  })
})

describe('validation', () => {
  it('rejects a missing file, bad booking id, bad side, non-PDF', async () => {
    expect((await POST(request({ booking_id: BOOKING, side: 'opponent' }))).status).toBe(400)
    expect((await POST(request({ ...good(), booking_id: 'not-a-uuid' }))).status).toBe(400)
    expect((await POST(request({ ...good(), side: 'both' }))).status).toBe(400)
    expect((await POST(request({ ...good(), file: new Blob(['<html>']) }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('404 for an unknown booking, 400 when it has no CricHeroes match id', async () => {
    bookingRow = null
    expect((await POST(request(good()))).status).toBe(404)
    bookingRow = { id: BOOKING, match_id: null }
    expect((await POST(request(good()))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('forwarding', () => {
  it('sends the match id from the booking (never the client), the secret, and defaults to a dry run', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, saved: false }), { status: 200 }))
    const res = await POST(request({ ...good(), match_id: '999' }))
    expect(res.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://py.example.com/parse-commentary')
    expect(init.headers['x-secret']).toBe('s3cret')
    const sent = init.body as FormData
    expect(sent.get('match_id')).toBe('26452955')
    expect(sent.get('side')).toBe('opponent')
    expect(sent.get('dry_run')).toBe('true')
    expect(sent.get('save_anyway')).toBe('false')
    expect(sent.get('uploaded_by')).toBe('p1')
  })

  it('only saves when dry_run=false is explicit', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, saved: true }), { status: 200 }))
    await POST(request({ ...good(), dry_run: 'false', save_anyway: 'true' }))
    const sent = fetchMock.mock.calls[0][1].body as FormData
    expect(sent.get('dry_run')).toBe('false')
    expect(sent.get('save_anyway')).toBe('true')
  })

  it('saves with just a parse_token (no file), only on a real save', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, saved: true }), { status: 200 }))
    const tok = 'abcdefghijklmnopqrstuvwx_-12'
    const res = await POST(request({ booking_id: BOOKING, side: 'opponent', dry_run: 'false', parse_token: tok }))
    expect(res.status).toBe(200)
    const sent = fetchMock.mock.calls[0][1].body as FormData
    expect(sent.get('parse_token')).toBe(tok)
    expect(sent.get('file')).toBeNull()
    // a token on a dry run, or a malformed token, does not stand in for the file
    expect((await POST(request({ booking_id: BOOKING, side: 'opponent', parse_token: tok }))).status).toBe(400)
    expect((await POST(request({ booking_id: BOOKING, side: 'opponent', dry_run: 'false', parse_token: 'bad token!' }))).status).toBe(400)
  })

  it('turns the microservice parse_expired 410 into a resend-the-file signal', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'parse_expired' }), { status: 410 }))
    const res = await POST(request({ booking_id: BOOKING, side: 'opponent', dry_run: 'false', parse_token: 'abcdefghijklmnopqrstuvwx' }))
    expect(res.status).toBe(410)
    expect((await res.json()).parse_expired).toBe(true)
  })

  it('passes a 422 (checks failed, nothing saved) through with its body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, saved: false, issues: [] }), { status: 422 }))
    const res = await POST(request({ ...good(), dry_run: 'false' }))
    expect(res.status).toBe(422)
    expect((await res.json()).saved).toBe(false)
  })

  it('shows the microservice 404 message (match not imported yet) to the wrangler', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Match 26452955 is not in match_stats yet' }), { status: 404 }))
    const res = await POST(request(good()))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatch(/not in match_stats/)
  })

  it('explains a bare FastAPI "Not Found" (route not deployed) instead of echoing it', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 }))
    const res = await POST(request(good()))
    expect(res.status).toBe(502)
    const msg = (await res.json()).error
    expect(msg).toMatch(/does not support commentary uploads yet/)
    expect(msg).not.toBe('Not Found')
  })

  it('hides upstream 5xx details and maps timeouts to 504', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'boom: secret stack' }), { status: 500 }))
    const res = await POST(request(good()))
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toMatch(/secret stack/)

    const err = Object.assign(new Error('t'), { name: 'TimeoutError' })
    fetchMock.mockRejectedValueOnce(err)
    expect((await POST(request(good()))).status).toBe(504)
  })

  it('says so plainly when the edge returns a non-JSON 429', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Too Many Requests', { status: 429, headers: { server: 'cloudflare' } }))
    const res = await POST(request(good()))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/rate-limiting.*HTTP 429.*try again/i)
  })

  it('names a rejected secret and includes the status in the generic failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Forbidden' }), { status: 403 }))
    const forbidden = await POST(request(good()))
    expect(forbidden.status).toBe(502)
    expect((await forbidden.json()).error).toMatch(/rejected.*HTTP 403.*tell an admin/i)

    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }))
    const failed = await POST(request(good()))
    expect((await failed.json()).error).toMatch(/failed to process this PDF \(HTTP 500\)/)
  })

  it('500 when the microservice is not configured', async () => {
    delete process.env.MICROSERVICE_SECRET
    expect((await POST(request(good()))).status).toBe(500)
  })
})
