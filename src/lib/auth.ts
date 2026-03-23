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

    async jwt({ token, user }) {
      if (user?.email) {
        const supabase = createServiceClient()
        const { data: player, error: playerErr } = await supabase
          .from('players')
          .select('id, name, is_captain, status, active, photo_url')
          .eq('gmail_id', user.email.toLowerCase())
          .single()

        // PGRST116 = no rows found (valid: user not yet a registered player)
        // Any other error = schema problem, RLS misconfiguration, etc. — log it clearly
        if (playerErr && playerErr.code !== 'PGRST116') {
          console.error('[auth] player lookup error — check that add_player_status.sql has been run and RLS is not blocking service_role:', playerErr.message)
        }

        token.playerId     = player?.id ?? null
        token.playerName   = player?.name ?? null
        token.isCaptain    = player?.is_captain ?? false
        token.playerStatus = player?.status ?? null
        token.isAdmin      = ADMIN_EMAILS.includes(user.email.toLowerCase())
        token.photoUrl     = player?.photo_url ?? null
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).playerId     = token.playerId
        ;(session.user as any).playerName  = token.playerName
        ;(session.user as any).isCaptain   = token.isCaptain
        ;(session.user as any).playerStatus = token.playerStatus
        ;(session.user as any).isAdmin     = token.isAdmin
        ;(session.user as any).photoUrl    = token.photoUrl
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
