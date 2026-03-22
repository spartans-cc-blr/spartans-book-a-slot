'use client'
// app/profile/page.tsx (or app/profile/ProfilePage.tsx if using a server wrapper)
// Player self-service profile edit.
// Fields: photo, WhatsApp, DOB, jersey name/number, blood group, CricHeroes URL, primary/secondary skill.
// Wallet balance, inducted date, is_captain, status — read-only, admin-managed.

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { SiteNav } from '@/components/ui/SiteNav'

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
  jersey_number: number | null
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
        setJerseyNumber(p.jersey_number?.toString() ?? '')
        setBloodGroup(p.blood_group ?? '')
        setPrimarySkill(p.primary_skill ?? '')
        setSecondarySkill(p.secondary_skill ?? '')
        setCricheroes(p.cricheroes_url ?? '')
        setPhotoPreview(p.photo_url ?? null)
        setLoading(false)
      })
  }, [sessionStatus, player?.playerId])

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
        jersey_number:   jerseyNumber ? parseInt(jerseyNumber) : null,
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
      <div className="min-h-screen bg-ink grain">
        <SiteNav activePage="profile" />
        <div className="px-5 py-8 space-y-3 animate-pulse max-w-2xl mx-auto mt-8">
          {[0, 1, 2].map(i => <div key={i} className="h-16 bg-ink-3 rounded border border-ink-5" />)}
        </div>
      </div>
    )
  }

  if (!player?.playerId || player?.playerStatus === 'expelled') {
    return (
      <div className="min-h-screen bg-ink grain">
        <SiteNav activePage="profile" />
        <div className="px-5 py-12 text-center font-rajdhani text-zinc-500">
          {player?.playerStatus === 'expelled' ? 'Account suspended.' : 'Profile not available.'}
        </div>
      </div>
    )
  }

  const hasDues = profile && profile.wallet_balance < 0

  return (
    <div className="min-h-screen bg-ink grain">
      <SiteNav activePage="profile" />

      {/* Hero */}
      <div className="bg-ink-2 border-b border-ink-4 px-5 md:px-8 lg:px-10 py-7 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)' }} />
        <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-gold inline-block" />
          My Profile
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-parchment mb-1 tracking-wide">
          {profile?.name ?? player.playerName}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          {profile?.is_captain && (
            <span className="font-rajdhani text-[10px] font-bold bg-gold/10 border border-gold-dim text-gold px-2 py-0.5 rounded">
              CAPTAIN
            </span>
          )}
          {profile?.status === 'active' && (
            <span className="font-rajdhani text-[10px] font-bold bg-emerald-950 border border-emerald-800 text-emerald-400 px-2 py-0.5 rounded">
              ACTIVE
            </span>
          )}
          {profile?.inducted_on && (
            <span className="font-rajdhani text-xs text-zinc-600">
              Member since {new Date(profile.inducted_on).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-2xl">

        {/* ── PHOTO ── */}
        <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-4">
          <h2 className="font-cinzel text-sm text-gold font-semibold mb-4">Profile Photo</h2>
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <img
                src={photoPreview ?? '/default-avatar.png'}
                alt={profile?.name ?? ''}
                className="w-20 h-20 rounded-full object-cover border-2 border-gold-dim"
              />
              {photoFile && (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-gold rounded-full flex items-center justify-center text-ink text-xs font-bold">
                  ✓
                </span>
              )}
            </div>
            <div>
              <button onClick={() => fileInputRef.current?.click()}
                className="font-rajdhani text-xs font-bold tracking-wide border border-ink-5 hover:border-gold-dim text-zinc-400 hover:text-gold px-4 py-2 rounded transition-colors mb-2 block">
                {photoFile ? '✓ Photo selected — save to upload' : 'Choose Photo'}
              </button>
              <p className="font-rajdhani text-[10px] text-zinc-600">
                JPG, PNG or WebP · Max 5MB · Square crop recommended
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
          </div>
        </div>

        {/* ── READ-ONLY INFO ── */}
        <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-4">
          <h2 className="font-cinzel text-sm text-gold font-semibold mb-4">Club Details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <ReadOnlyField label="Full Name" value={profile?.name} />
            <ReadOnlyField label="Club Gmail" value={profile?.gmail_id} />
            <div>
              <label className="form-label">Wallet Balance</label>
              <p className={`font-rajdhani font-bold text-sm ${hasDues ? 'text-amber-400' : 'text-parchment'}`}>
                ₹{profile?.wallet_balance ?? 0}
                {hasDues && <span className="font-normal text-amber-600 ml-2">(dues outstanding)</span>}
              </p>
            </div>
            {profile?.inducted_on && (
              <ReadOnlyField label="Inducted On" value={new Date(profile.inducted_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
            )}
          </div>
          <p className="font-rajdhani text-[10px] text-zinc-700 mt-3 italic">
            Name, email and wallet balance are managed by the admin. Contact Muthu to update these.
          </p>
        </div>

        {/* ── EDITABLE FIELDS ── */}
        <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-4">
          <h2 className="font-cinzel text-sm text-gold font-semibold mb-4">Personal Details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">WhatsApp Number</label>
              <input
                type="tel"
                value={whatsapp}
                onChange={e => setWhatsapp(e.target.value)}
                placeholder="e.g. 919876543210"
                className="form-input"
              />
              <p className="font-rajdhani text-[10px] text-zinc-600 mt-1">Include country code</p>
            </div>
            <div>
              <label className="form-label">Date of Birth</label>
              <input
                type="date"
                value={dob}
                onChange={e => setDob(e.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Blood Group</label>
              <select value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} className="form-input">
                <option value="">Select...</option>
                {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── JERSEY ── */}
        <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-4">
          <h2 className="font-cinzel text-sm text-gold font-semibold mb-4">Jersey</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Jersey Name</label>
              <input
                type="text"
                value={jerseyName}
                onChange={e => setJerseyName(e.target.value)}
                placeholder="e.g. MUTHU"
                className="form-input uppercase"
              />
              <p className="font-rajdhani text-[10px] text-zinc-600 mt-1">Name printed on the back</p>
            </div>
            <div>
              <label className="form-label">Jersey Number</label>
              <input
                type="number"
                value={jerseyNumber}
                onChange={e => setJerseyNumber(e.target.value)}
                placeholder="e.g. 7"
                min={0}
                max={999}
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* ── SKILLS ── */}
        <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-4">
          <h2 className="font-cinzel text-sm text-gold font-semibold mb-4">Playing Skills</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Primary Skill</label>
              <select value={primarySkill} onChange={e => setPrimarySkill(e.target.value)} className="form-input">
                <option value="">Select...</option>
                {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Secondary Skill</label>
              <select value={secondarySkill} onChange={e => setSecondarySkill(e.target.value)} className="form-input">
                <option value="">Select...</option>
                {SKILLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── CRICHEROES ── */}
        <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-6">
          <h2 className="font-cinzel text-sm text-gold font-semibold mb-4">CricHeroes</h2>
          <div>
            <label className="form-label">CricHeroes Profile URL</label>
            <input
              type="url"
              value={cricheroes}
              onChange={e => setCricheroes(e.target.value)}
              placeholder="https://chshare.link/..."
              className="form-input"
            />
            <p className="font-rajdhani text-[10px] text-zinc-600 mt-1">
              Open your CricHeroes profile → Share → Copy link
            </p>
          </div>
          {cricheroes && (
            <a href={cricheroes} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-rajdhani text-xs text-zinc-500 hover:text-gold transition-colors">
              Test link ↗
            </a>
          )}
        </div>

        {/* ── ERROR / SUCCESS ── */}
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-400 font-rajdhani text-sm px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-950 border border-emerald-800 text-emerald-400 font-rajdhani text-sm px-4 py-3 rounded mb-4">
            ✓ Profile updated successfully.
          </div>
        )}

        {/* ── SAVE ── */}
        <div className="flex gap-3 justify-between items-center">
          <button onClick={() => router.push('/')}
            className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 border border-ink-5 px-4 py-2.5 rounded transition-colors">
            ← Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploadingPhoto}
            className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded transition-colors">
            {saving || uploadingPhoto ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <p className="font-rajdhani text-sm text-zinc-400">{value ?? '—'}</p>
    </div>
  )
}
