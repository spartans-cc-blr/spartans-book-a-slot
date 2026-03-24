import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { createServiceClient } from '@/lib/supabase'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      return true
    },

    async jwt({ token, user, trigger }) {
      // Runs on: first sign-in (user is present), token refresh (user is absent)
      // We re-fetch on first sign-in so the token is always fresh
      const email = user?.email ?? (token.email as string | undefined)

      if (email && (user || !token.playerId)) {
        // user present  = first sign-in, always re-fetch
        // !token.playerId = token exists but has no player yet (e.g. deployed while user was signed in)
        const supabase = createServiceClient()
        const { data: player, error: playerErr } = await supabase
          .from('players')
          .select('id, name, is_captain, is_gc, status, active, photo_url')
          .eq('gmail_id', email.toLowerCase())
          .single()

        // PGRST116 = no rows — valid for unregistered users, not an error
        if (playerErr && playerErr.code !== 'PGRST116') {
          console.error('[auth] player lookup error — check add_player_status.sql migration and RLS:', playerErr.message)
        }

        token.playerId     = player?.id ?? null
        token.playerName   = player?.name ?? null
        token.isCaptain    = player?.is_captain ?? false
        token.isGC         = player?.is_gc ?? false
        token.playerStatus = player?.status ?? null
        token.isAdmin      = ADMIN_EMAILS.includes(email.toLowerCase())
        token.photoUrl     = player?.photo_url ?? null
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).playerId      = token.playerId
        ;(session.user as any).playerName   = token.playerName
        ;(session.user as any).isCaptain    = token.isCaptain
        ;(session.user as any).isGC         = token.isGC
        ;(session.user as any).playerStatus = token.playerStatus
        ;(session.user as any).isAdmin      = token.isAdmin
        ;(session.user as any).photoUrl     = token.photoUrl
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge:   8 * 60 * 60,
  },
}

export default NextAuth(authOptions)
