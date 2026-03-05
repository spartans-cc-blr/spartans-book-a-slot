'use client'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'

export default function AdminLoginPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-gold to-gold-dim flex items-center justify-center font-cinzel font-black text-ink text-2xl mx-auto mb-4"
            style={{ clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)' }}>
            S
          </div>
          <h1 className="font-cinzel text-xl font-bold text-gold tracking-wide">SPARTANS CC</h1>
          <p className="font-rajdhani text-zinc-500 text-sm mt-1">Coordinator Access</p>
        </div>

        {/* Card */}
        <div className="bg-ink-3 border border-ink-5 border-t-2 border-t-gold rounded p-6">
          <h2 className="font-cinzel text-base font-semibold text-parchment mb-1">Admin Sign In</h2>
          <p className="font-rajdhani text-zinc-500 text-sm mb-6">
            Sign in with the club Gmail to access the booking dashboard.
          </p>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-400 font-rajdhani text-sm px-4 py-3 rounded mb-4">
              {error === 'AccessDenied'
                ? 'Access denied. Only the club coordinator email can sign in.'
                : 'Sign in failed. Please try again.'}
            </div>
          )}

          <button
            onClick={() => signIn('google', { callbackUrl: '/admin' })}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-zinc-800 font-rajdhani font-bold text-sm tracking-wide py-3 px-4 rounded transition-colors">
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="font-rajdhani text-xs text-zinc-700 text-center mt-4">
            Only authorised club accounts can sign in
          </p>
        </div>

        <p className="text-center mt-6">
          <a href="/schedule" className="font-rajdhani text-xs text-zinc-600 hover:text-gold transition-colors">
            ← Back to public schedule
          </a>
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
