'use client'
// app/profile/page.tsx (or app/profile/ProfilePage.tsx if using a server wrapper)
// Player self-service profile edit.
// Fields: photo, WhatsApp, DOB, jersey name/number, blood group, CricHeroes URL, primary/secondary skill.
// Wallet balance, inducted date, is_captain, status — read-only, admin-managed.

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SiteNav } from '@/components/ui/SiteNav'
import { DobInput } from '@/components/ui/DobInput'
import type { PlayerStatsTotals } from '@/types'
import { CapBadge } from '@/components/leaderboard/CapIcon'
import type { CapKind } from '@/lib/capHolders'
import { hasLocalPushSubscription, subscribeToPush as subscribeToPushBrowser, unsubscribeFromPush as unsubscribeFromPushBrowser } from '@/lib/pushSubscription'

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

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

type PlayerProfile = {
  id: string
  name: string
  gmail_id: string | null
  whatsapp: string | null
  dob: string | null
  jersey_name: string | null
  jersey_number: string | null
  blood_group: string | null
  primary_skill: string | null
  secondary_skill: string | null
  cricheroes_url: string | null
  photo_url: string | null
  wallet_balance: number
  inducted_on: string | null
  is_captain: boolean
  status: string
  active: boolean
}

export default function ProfilePage() {
  const { data: session, status: sessionStatus, update: updateSession } = useSession()
  const router = useRouter()
  const player = session?.user as any

  const [profile,  setProfile]  = useState<PlayerProfile | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [error,    setError]    = useState('')

  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushServerSubscribed, setPushServerSubscribed] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushSuccess, setPushSuccess] = useState(false)
  const [pushError, setPushError] = useState('')

  async function subscribeToPush() {
    setPushLoading(true)
    setPushError('')
    const result = await subscribeToPushBrowser()
    if (result.ok) {
      setPushSubscribed(true)
      setPushServerSubscribed(true)
      setPushSuccess(true)
      setTimeout(() => setPushSuccess(false), 3000)
    } else {
      setPushError(result.error)
    }
    setPushLoading(false)
  }

  async function unsubscribeFromPush() {
    setPushLoading(true)
    setPushError('')
    const result = await unsubscribeFromPushBrowser()
    if (result.ok) {
      setPushSubscribed(false)
      // Other devices may still hold a subscription for this player —
      // re-check the server rather than assuming none remain.
      fetch('/api/push/subscribe')
        .then(r => (r.ok ? r.json() : null))
        .then(d => setPushServerSubscribed(!!d?.subscribed))
        .catch(() => {})
    } else {
      setPushError(result.error)
    }
    setPushLoading(false)
  }


  const [dashboard, setDashboard] = useState<{
  pendingCount: number
  upcomingCount: number
  nextMatch: any
  nextMatchResponse: string | null
} | null>(null)

  const [stats, setStats] = useState<{
    career: PlayerStatsTotals
    season: PlayerStatsTotals
    seasonYear: number
    caps?: CapKind[] // season Orange/Purple Caps this player holds
  } | null>(null)

  // Editable fields
  const [whatsapp,        setWhatsapp]        = useState('')
  const [dob,             setDob]             = useState('')
  const [jerseyName,      setJerseyName]      = useState('')
  const [jerseyNumber,    setJerseyNumber]    = useState('')
  const [bloodGroup,      setBloodGroup]      = useState('')
  const [primarySkill,    setPrimarySkill]    = useState('')
  const [secondarySkill,  setSecondarySkill]  = useState('')
  const [cricheroes,      setCricheroes]      = useState('')

  // Photo upload state
  const [photoPreview,    setPhotoPreview]    = useState<string | null>(null)
  const [photoFile,       setPhotoFile]       = useState<File | null>(null)
  const [uploadingPhoto,  setUploadingPhoto]  = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!player?.playerId) {
      if (sessionStatus === 'unauthenticated') router.push('/')
      return
    }
    fetch(`/api/players/${player.playerId}`)
      .then(r => r.json())
      .then(d => {
        const p: PlayerProfile = d.player
        setProfile(p)
        setWhatsapp(p.whatsapp ?? '')
        setDob(p.dob ?? '')
        setJerseyName(p.jersey_name ?? '')
        setJerseyNumber(p.jersey_number ?? '')
        setBloodGroup(p.blood_group ?? '')
        setPrimarySkill(p.primary_skill ?? '')
        setSecondarySkill(p.secondary_skill ?? '')
        setCricheroes(p.cricheroes_url ?? '')
        setPhotoPreview(p.photo_url ?? null)
        setLoading(false)
        fetch(`/api/players/${player.playerId}/dashboard`)
          .then(r => r.json())
          .then(d => setDashboard(d))
        fetch(`/api/players/${player.playerId}/stats`)
          .then(r => r.json())
          .then(d => { if (d.career) setStats(d) })
      })
  }, [sessionStatus, player?.playerId])

  useEffect(() => {
    hasLocalPushSubscription().then(existing => { if (existing) setPushSubscribed(true) })
  }, [])

  useEffect(() => {
    if (!player?.playerId) return
    fetch('/api/push/subscribe')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.subscribed) setPushServerSubscribed(true) })
      .catch(() => {})
  }, [player?.playerId])

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be under 5MB.')
      return
    }
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!photoFile) return null
    setUploadingPhoto(true)
    const formData = new FormData()
    formData.append('file', photoFile)
    formData.append('player_id', player.playerId)
    const res = await fetch('/api/players/photo', { method: 'POST', body: formData })
    setUploadingPhoto(false)
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error ?? 'Photo upload failed.')
    }
    const d = await res.json()
    return d.photo_url
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess(false)

    try {
      let photoUrl: string | null = null
      if (photoFile) {
        photoUrl = await uploadPhoto()
      }

      const body: Record<string, any> = {
        whatsapp:        whatsapp.trim() || null,
        dob:             dob || null,
        jersey_name:     jerseyName.trim() || null,
        jersey_number:   jerseyNumber.trim() || null,
        blood_group:     bloodGroup || null,
        primary_skill:   primarySkill || null,
        secondary_skill: secondarySkill || null,
        cricheroes_url:  cricheroes.trim() || null,
      }
      if (photoUrl) body.photo_url = photoUrl

      const res = await fetch(`/api/players/${player.playerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed.')
      }

      const d = await res.json()
      setProfile(d.player)
      if (photoUrl) {
        setPhotoPreview(photoUrl)
        setPhotoFile(null)
        // Refresh session so nav avatar updates
        await updateSession()
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-parchment dark:bg-ink grain">
        <SiteNav activePage="profile" back={{ fallbackHref: '/', label: 'Home' }} />
        <div className="px-5 py-8 space-y-3 animate-pulse max-w-2xl mx-auto mt-8">
          {[0, 1, 2].map(i => <div key={i} className="h-16 bg-white dark:bg-ink-3 rounded border border-[#D4C9B0] dark:border-ink-5" />)}
        </div>
      </div>
    )
  }

  if (!player?.playerId || player?.playerStatus === 'expelled') {
    return (
      <div className="min-h-screen bg-parchment dark:bg-ink grain">
        <SiteNav activePage="profile" back={{ fallbackHref: '/', label: 'Home' }} />
        <div className="px-5 py-12 text-center font-rajdhani text-[#78716C] dark:text-zinc-500">
          {player?.playerStatus === 'expelled' ? 'Account suspended.' : 'Profile not available.'}
        </div>
      </div>
    )
  }

  const hasDues = !!profile && profile.wallet_balance < 0
  const balance = profile?.wallet_balance ?? 0
  const card = 'bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded-lg p-5'
  const cardTitle = 'font-cinzel text-sm text-amber-700 dark:text-gold font-semibold'
  const subTitle = 'font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500 mb-3'
  const hint = 'font-rajdhani text-[11px] text-[#78716C] dark:text-zinc-500 mt-1'
  const tile = 'rounded-lg border px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold'
  const neutralTile = 'bg-white dark:bg-ink-3 border-[#D4C9B0] dark:border-ink-5 hover:border-gold-dim'
  const warnTile = 'bg-amber-50 dark:bg-amber-950/30 border-amber-300/60 dark:border-amber-800/60 hover:border-amber-600'
  const nm = dashboard?.nextMatch
  const hasJersey = !!(profile?.jersey_name && profile?.jersey_number && profile.jersey_number.trim() !== '')

  return (
    <div className="min-h-screen bg-parchment dark:bg-ink grain">
      <SiteNav activePage="profile" back={{ fallbackHref: '/', label: 'Home' }} />

      {/* ── Identity: photo, name, badges, quick links ── */}
      <div className="bg-white dark:bg-ink-2 border-b border-[#E2DACE] dark:border-ink-4 px-5 md:px-8 lg:px-10 py-6">
        <div className="max-w-2xl flex items-center gap-4 sm:gap-5">
          <div className="relative flex-shrink-0">
            <img
              src={photoPreview ?? '/default-avatar.png'}
              alt={profile?.name ?? ''}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-gold-dim"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gold text-ink flex items-center justify-center text-sm shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
            >
              {photoFile ? '✓' : '📷'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
          <div className="min-w-0">
            <h1 className="font-cinzel text-xl sm:text-2xl md:text-3xl font-bold text-[#1C1917] dark:text-parchment tracking-wide break-words">
              {profile?.name ?? player.playerName}
            </h1>
            <div className="flex items-center flex-wrap gap-2 mt-1.5">
              {profile?.is_captain && (
                <span className="font-rajdhani text-[10px] font-bold bg-gold/10 border border-gold-dim text-amber-700 dark:text-gold px-2 py-0.5 rounded">CAPTAIN</span>
              )}
              {stats?.caps?.map(k => <CapBadge key={k} kind={k} year={stats.seasonYear} />)}
              {profile?.status === 'active' && (
                <span className="font-rajdhani text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded">ACTIVE</span>
              )}
              {profile?.inducted_on && (
                <span className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">
                  Member since {new Date(profile.inducted_on).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
            <p className="font-rajdhani text-[11px] text-[#78716C] dark:text-zinc-500 mt-1.5">
              {photoFile ? 'New photo selected — tap Save to upload' : 'JPG, PNG or WebP · max 5MB'}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-2xl space-y-4">

        {/* ── At a glance: wallet + next match (one place each) ── */}
        <section aria-label="At a glance" className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/wallet" aria-label="View full wallet statement"
              className={`${tile} ${hasDues ? warnTile : neutralTile}`}>
              <p className={subTitle.replace('mb-3', 'mb-1')}>💰 Wallet</p>
              <p className={`font-cinzel text-xl font-bold ${hasDues ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>₹{balance}</p>
              <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mt-0.5">
                {hasDues ? 'Dues outstanding · ' : ''}View statement →
              </p>
            </Link>

            {dashboard && (
              <Link href="/fixtures"
                aria-label={dashboard.pendingCount > 0 ? `${dashboard.pendingCount} matches need your availability response — go to Fixtures` : 'All matches marked — go to Fixtures'}
                className={`${tile} ${dashboard.pendingCount > 0 ? warnTile : neutralTile}`}>
                <p className={subTitle.replace('mb-3', 'mb-1')}>{dashboard.pendingCount > 0 ? '⚠️' : '✅'} Availability</p>
                <p className={`font-cinzel text-xl font-bold ${dashboard.pendingCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {dashboard.pendingCount > 0 ? `${dashboard.pendingCount} pending` : 'All marked'}
                </p>
                <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mt-0.5">
                  {dashboard.upcomingCount} upcoming · {dashboard.pendingCount > 0 ? 'Mark now →' : 'View fixtures →'}
                </p>
              </Link>
            )}
          </div>

          {nm && (
            <Link href={`/fixtures/${nm.id}`}
              className={`block ${tile} ${neutralTile}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={subTitle.replace('mb-3', 'mb-0.5')}>📅 Next match</p>
                  <p className="font-rajdhani text-sm font-semibold text-[#1C1917] dark:text-parchment truncate">
                    {nm.opponent_name ? `vs ${nm.opponent_name}` : nm.tournament?.name ?? 'TBD'}
                  </p>
                  <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">
                    {new Date(nm.game_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {nm.slot_time}
                  </p>
                </div>
                <span className={`flex-shrink-0 font-rajdhani text-xs font-bold px-2.5 py-1 rounded border ${
                  !dashboard?.nextMatchResponse ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400' :
                  dashboard.nextMatchResponse === 'Y' ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400' :
                  dashboard.nextMatchResponse === 'N' ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800 text-red-700 dark:text-red-400' :
                  dashboard.nextMatchResponse === 'O' ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-400' :
                  dashboard.nextMatchResponse === 'E' ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-400' :
                  'bg-white dark:bg-zinc-900 border-[#D4C9B0] dark:border-zinc-700 text-[#57534E] dark:text-zinc-400'
                }`}>
                  {dashboard?.nextMatchResponse ?? 'Mark →'}
                </span>
              </div>
            </Link>
          )}
        </section>

        {/* ── My stats ── */}
        <section className={card}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={cardTitle}>My Stats</h2>
            <Link href={`/players/${player.playerId}/stats`}
              className="font-rajdhani text-xs font-bold tracking-wide border border-gold-dim text-amber-700 dark:text-gold hover:bg-gold hover:text-ink px-3 py-1.5 rounded transition-colors">
              📊 Full Stats →
            </Link>
          </div>
          {!stats || stats.career.matches === 0 ? (
            <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500">No stats yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-5">
              <StatsColumn title="Career" totals={stats.career} />
              <StatsColumn title={`This Season (${stats.seasonYear})`} totals={stats.season} />
            </div>
          )}
        </section>

        {/* ── Editable details (single form card) ── */}
        <section className={card}>
          <h2 className={`${cardTitle} mb-1`}>My Details</h2>
          <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mb-5">Edit anything below, then tap Save.</p>

          <p className={subTitle}>Contact &amp; personal</p>
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="form-label" htmlFor="pf-whatsapp">WhatsApp Number</label>
              <input id="pf-whatsapp" type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                placeholder="e.g. 919876543210" className="form-input" />
              <p className={hint}>Include country code</p>
            </div>
            <div>
              <label className="form-label">Date of Birth</label>
              <DobInput value={dob} onChange={setDob} />
              <p className={hint}>Year optional — day &amp; month are enough for birthday wishes 🎂</p>
            </div>
            <div>
              <label className="form-label" htmlFor="pf-blood">Blood Group</label>
              <select id="pf-blood" value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} className="form-input">
                <option value="">Select...</option>
                {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <p className={subTitle}>Cricket</p>
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="form-label" htmlFor="pf-primary">Primary Skill</label>
              <select id="pf-primary" value={primarySkill} onChange={e => setPrimarySkill(e.target.value)} className="form-input">
                <option value="">Select...</option>
                {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="pf-secondary">Secondary Skill</label>
              <select id="pf-secondary" value={secondarySkill} onChange={e => setSecondarySkill(e.target.value)} className="form-input">
                <option value="">Select...</option>
                {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="form-label" htmlFor="pf-ch">CricHeroes Profile URL</label>
              <input id="pf-ch" type="url" value={cricheroes} onChange={e => setCricheroes(e.target.value)}
                placeholder="https://chshare.link/..." className="form-input" />
              <p className={hint}>
                Open your CricHeroes profile → Share → paste the link here
                {cricheroes && (
                  <> · <a href={cricheroes} target="_blank" rel="noopener noreferrer"
                    className="underline decoration-dotted hover:text-amber-700 dark:hover:text-gold">Test link ↗</a></>
                )}
              </p>
            </div>
          </div>

          <p className={subTitle}>Jersey</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label" htmlFor="pf-jname">Jersey Name</label>
              <input id="pf-jname" type="text" value={jerseyName} onChange={e => setJerseyName(e.target.value)}
                placeholder="e.g. MUTHU" className="form-input uppercase" />
              <p className={hint}>Name printed on the back</p>
            </div>
            <div>
              <label className="form-label" htmlFor="pf-jnum">Jersey Number</label>
              <input id="pf-jnum" type="text" inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3}
                value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)}
                placeholder="e.g. 7, 07, or 007" className="form-input" />
            </div>
          </div>
          {hasJersey && (
            <div className="mt-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
              <p className="font-rajdhani text-sm text-amber-700 dark:text-amber-300">Jersey details set — ready to order?</p>
              <Link href="/dugout/kit-room"
                className="font-rajdhani text-sm font-semibold text-amber-700 dark:text-amber-400 hover:underline underline-offset-2 whitespace-nowrap">
                Spartans Store →
              </Link>
            </div>
          )}
        </section>

        {/* ── Notifications ── */}
        <section className={card}>
          <h2 className={`${cardTitle} mb-1`}>Notifications</h2>
          <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mb-3">
            Get alerted when you&apos;re selected in a squad. Applies to this device only.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={subscribeToPush}
              disabled={pushSubscribed || pushLoading}
              className="font-rajdhani text-xs font-bold tracking-wide border border-[#D4C9B0] dark:border-ink-5 hover:border-gold-dim text-[#57534E] dark:text-zinc-400 hover:text-amber-700 dark:hover:text-gold disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded transition-colors"
            >
              {pushLoading
                ? (pushSubscribed ? 'Disabling...' : 'Enabling...')
                : pushSubscribed
                ? '✓ Notifications enabled'
                : pushServerSubscribed
                ? '🔔 Re-enable on this device'
                : '🔔 Enable notifications'}
            </button>
            {pushSubscribed && (
              <button onClick={unsubscribeFromPush} disabled={pushLoading}
                className="font-rajdhani text-xs font-bold text-[#78716C] dark:text-zinc-500 hover:text-crimson underline disabled:opacity-50">
                Turn off
              </button>
            )}
          </div>
          {!pushSubscribed && pushServerSubscribed && !pushLoading && (
            <p className="font-rajdhani text-[11px] text-amber-700 dark:text-amber-400 mt-2">
              We have a subscription on file, but this device lost it (common on iPhone if the Hub icon hasn&apos;t been opened in a while) — tap above to refresh.
            </p>
          )}
          {pushSuccess && <p className="font-rajdhani text-[11px] text-emerald-700 dark:text-emerald-400 mt-2">You&apos;ll be notified when you&apos;re selected in a squad.</p>}
          {pushError && <p className="font-rajdhani text-[11px] text-crimson mt-2">{pushError}</p>}
        </section>

        {/* ── Admin-managed (read-only) ── */}
        <section className="rounded-lg border border-dashed border-[#D4C9B0] dark:border-ink-5 p-5">
          <h2 className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-500 mb-3">Managed by admin</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <ReadOnlyField label="Full Name" value={profile?.name} />
            <ReadOnlyField label="Club Gmail" value={profile?.gmail_id} />
            {profile?.inducted_on && (
              <ReadOnlyField label="Inducted On" value={new Date(profile.inducted_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
            )}
          </div>
          <p className="font-rajdhani text-[11px] text-[#78716C] dark:text-zinc-500 mt-3 italic">
            Name, email and wallet balance can only be changed by the admin. Contact Muthu to update these.
          </p>
        </section>

        {/* ── Feedback ── */}
        {error && (
          <div role="alert" className="bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 font-rajdhani text-sm px-4 py-3 rounded">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-rajdhani text-sm px-4 py-3 rounded">
            ✓ Profile updated successfully.
          </div>
        )}
      </div>

      {/* ── Sticky save bar ── */}
      <div className="sticky bottom-[4.5rem] md:bottom-0 z-30 bg-white/95 dark:bg-ink-2/95 backdrop-blur border-t border-[#D4C9B0] dark:border-ink-5 px-5 md:px-8 lg:px-10 py-3">
        <div className="max-w-2xl flex items-center justify-between gap-3">
          <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 hidden sm:block">Changes to My Details apply when you save.</p>
          <button
            onClick={handleSave}
            disabled={saving || uploadingPhoto}
            className="w-full sm:w-auto font-rajdhani text-sm font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded transition-colors">
            {saving || uploadingPhoto ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      <footer className="border-t border-[#E2DACE] dark:border-ink-4 py-5 text-center font-rajdhani text-xs text-[#78716C] dark:text-zinc-600">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <p className="font-rajdhani text-sm text-[#57534E] dark:text-zinc-400">{value ?? '—'}</p>
    </div>
  )
}

function StatsColumn({ title, totals }: { title: string; totals: PlayerStatsTotals }) {
  if (totals.matches === 0) {
    return (
      <div>
        <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-600 mb-2">{title}</p>
        <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-600">No matches.</p>
      </div>
    )
  }
  const rows: [string, string][] = [
    ['Matches',  String(totals.matches)],
    ['Runs',     String(totals.runs)],
    ['Average',  totals.battingAverage != null ? totals.battingAverage.toFixed(2) : '—'],
    ['S/R',      totals.strikeRate != null ? totals.strikeRate.toFixed(2) : '—'],
    ['Wickets',  String(totals.wickets)],
    ['Economy',  totals.economy != null ? totals.economy.toFixed(2) : '—'],
    ['MVP Pts',  totals.mvpPoints.toFixed(2)],
  ]
  return (
    <div>
      <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-600 mb-2">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between border-b border-[#D4C9B0] dark:border-ink-5 pb-1">
            <span className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">{label}</span>
            <span className="font-cinzel text-sm font-bold text-[#1C1917] dark:text-parchment">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
