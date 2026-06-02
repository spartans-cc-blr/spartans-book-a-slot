'use client'
// src/app/join/page.tsx
// Replaces the existing dead-link /join page.
//
// States:
//  1. No session           → prompt to sign in with Google first
//  2. Already registered   → redirect to /
//  3. Token missing/bad    → show "you need a valid invite link" message
//  4. Token present + unregistered → show registration form

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SiteNav } from '@/components/ui/SiteNav'
import { useState, useEffect, Suspense } from 'react'


const SKILLS = [
  'Right Hand Opening Batsman',
  'Right Hand Top Order Batsman',
  'Right Hand Middle Order Batsman',
  'Right Hand Lower Order Batsman',
  'Left Hand Opening Batsman',
  'Left Hand Top Order Batsman',
  'Left Hand Middle Order Batsman',
  'Right Hand Wicket Keeping Batsman',
  'Left Hand Wicket Keeping Batsman',
  'Right Arm Fast Medium Bowler',
  'Right Arm Medium Pace Bowler',
  'Right Arm Off Break Bowler',
  'Right Arm Leg Break Bowler',
  'Left Arm Fast Medium Bowler',
  'Left Arm Medium Pace Bowler',
  'Left Arm Off Break Bowler',
  'Left Arm Leg Break Bowler',
]

 function JoinPageInner() {
  const { data: session, status } = useSession()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''

  const player = session?.user as any

  const [form, setForm] = useState({
    name:           '',
    whatsapp:       '',
    jersey_name:    '',
    jersey_number:  '',
    primary_skill:  '',
    dob:            '',
  })
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  // Already registered — send home
  useEffect(() => {
    if (player?.playerId) router.replace('/')
  }, [player, router])

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setError('')
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Full name is required.'); return }
    if (!token)             { setError('Invalid invite link.'); return }

    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/players/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name:          form.name.trim(),
          whatsapp:      form.whatsapp     || undefined,
          jersey_name:   form.jersey_name  || undefined,
          jersey_number: form.jersey_number ? parseInt(form.jersey_number) : undefined,
          primary_skill: form.primary_skill || undefined,
          dob:           form.dob           || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      setSuccess(true)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-ink-1 flex items-center justify-center">
        <p className="font-rajdhani text-zinc-600 text-sm">Loading…</p>
      </div>
    )
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <main className="min-h-screen bg-ink-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-ink-2 border border-ink-5 rounded-lg p-8 text-center space-y-5">
          <div className="text-4xl">🏏</div>
          <h1 className="font-cinzel font-bold text-gold text-xl tracking-widest uppercase">
            Welcome to Spartans!
          </h1>
          <p className="font-rajdhani text-zinc-300 text-sm leading-relaxed">
            Your account has been created. Sign out and sign back in with Google to activate your full access.
          </p>
          <button
            onClick={() => signIn('google')}
            className="w-full font-rajdhani text-sm font-bold tracking-widest uppercase bg-gold hover:bg-gold/90 text-ink-1 px-6 py-3 rounded transition-colors"
          >
            Sign in to get started
          </button>
        </div>
      </main>
    )
  }

  // ── Not signed in ─────────────────────────────────────────────────────────
  if (!session) {
    return (
      <main className="min-h-screen bg-ink-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-ink-2 border border-ink-5 rounded-lg p-8 text-center space-y-6">
          <img src="/Transparent High Resolution.png" alt="Spartans CC"
            className="w-16 h-16 object-contain mx-auto opacity-80" />
          <div className="space-y-2">
            <h1 className="font-cinzel font-bold text-gold text-xl tracking-widest uppercase">
              Sign in first
            </h1>
            <p className="font-rajdhani text-zinc-400 text-sm leading-relaxed">
              Sign in with the Google account you want to use for Spartans Hub, then your registration form will appear.
            </p>
          </div>
          <button
            onClick={() => signIn('google', { callbackUrl: `/join?token=${token}` })}
            className="inline-flex items-center justify-center gap-2 w-full font-rajdhani font-bold text-sm tracking-widest uppercase border border-gold-dim text-gold hover:bg-gold/10 px-6 py-3 rounded transition-colors"
          >
            <GoogleIcon /> Sign in with Google
          </button>
        </div>
      </main>
    )
  }

  // ── No token ──────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <main className="min-h-screen bg-ink-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-ink-2 border border-ink-5 rounded-lg p-8 text-center space-y-5">
          <img src="/Transparent High Resolution.png" alt="Spartans CC"
            className="w-16 h-16 object-contain mx-auto opacity-80" />
          <h1 className="font-cinzel font-bold text-gold text-xl tracking-widest uppercase">
            Invite link required
          </h1>
          <p className="font-rajdhani text-zinc-400 text-sm leading-relaxed">
            You need a valid invite link to register. Ask a Spartans GC member or coordinator to generate one for you.
          </p>
        </div>
      </main>
    )
  }

  // ── Registration form ─────────────────────────────────────────────────────
  return (
    <>
      <SiteNav activePage="home" />
      <main className="min-h-screen bg-ink-1 pt-16 pb-12 px-4">
        <div className="max-w-lg mx-auto">

          {/* Header */}
          <div className="text-center mb-8">
            <img src="/Transparent High Resolution.png" alt="Spartans CC"
              className="w-14 h-14 object-contain mx-auto opacity-80 mb-4" />
            <h1 className="font-cinzel font-bold text-gold text-xl tracking-widest uppercase mb-1">
              Join Spartans CC
            </h1>
            <p className="font-rajdhani text-zinc-500 text-xs">
              Signing up as <span className="text-zinc-300">{player?.email}</span>
            </p>
          </div>

          <div className="bg-ink-2 border border-ink-5 rounded-lg p-6 space-y-5">

            {/* Name */}
            <div>
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="As it appears on your ID"
                className="form-input"
                autoComplete="name"
              />
            </div>

            {/* WhatsApp */}
            <div>
              <label className="form-label">WhatsApp Number</label>
              <input
                type="tel"
                value={form.whatsapp}
                onChange={e => set('whatsapp', e.target.value)}
                placeholder="91XXXXXXXXXX (with country code)"
                className="form-input"
              />
              <p className="font-rajdhani text-[10px] text-zinc-600 mt-1">
                Include country code e.g. 919876543210
              </p>
            </div>

            {/* Jersey */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Jersey Name</label>
                <input
                  type="text"
                  value={form.jersey_name}
                  onChange={e => set('jersey_name', e.target.value.toUpperCase())}
                  placeholder="e.g. MUTHU"
                  maxLength={20}
                  className="form-input uppercase"
                />
              </div>
              <div>
                <label className="form-label">Jersey Number</label>
                <input
                  type="number"
                  value={form.jersey_number}
                  onChange={e => set('jersey_number', e.target.value)}
                  placeholder="e.g. 7"
                  min={0}
                  max={999}
                  className="form-input"
                />
              </div>
            </div>

            {/* Skill */}
            <div>
              <label className="form-label">Primary Skill</label>
              <select
                value={form.primary_skill}
                onChange={e => set('primary_skill', e.target.value)}
                className="form-input"
              >
                <option value="">Select your role…</option>
                {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* DOB */}
            <div>
              <label className="form-label">Date of Birth</label>
              <input
                type="date"
                value={form.dob}
                onChange={e => set('dob', e.target.value)}
                className="form-input"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-950 border border-red-800 text-red-400 font-rajdhani text-sm px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={saving || !form.name.trim()}
              className="w-full font-rajdhani text-sm font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded transition-colors"
            >
              {saving ? 'Creating account…' : 'Complete Registration'}
            </button>

            <p className="font-rajdhani text-[10px] text-zinc-600 text-center leading-relaxed">
              You can update all these details later from your profile page. Only your name is required now.
            </p>
          </div>
        </div>
      </main>
    </>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-ink-1 flex items-center justify-center">
        <p className="font-rajdhani text-zinc-600 text-sm">Loading…</p>
      </div>
    }>
      <JoinPageInner />
    </Suspense>
  )
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
