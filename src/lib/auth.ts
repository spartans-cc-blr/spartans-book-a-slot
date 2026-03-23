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
    // Allow anyone to sign in — player lookup happens in jwt callback
    async signIn({ user }) {
      return true
    },

        // AFTER
    async jwt({ token, user }) {
      if (user?.email) {
        const supabase = createServiceClient()
        const { data: player } = await supabase
          .from('players')
          .select('id, name, is_captain, status, active, photo_url')
          .eq('gmail_id', user.email.toLowerCase())
          .single()
    
        token.playerId     = player?.id ?? null
        token.playerName   = player?.name ?? null
        token.isCaptain    = player?.is_captain ?? false
        token.playerStatus = player?.status ?? null
        token.isAdmin      = ADMIN_EMAILS.includes(user.email.toLowerCase())
    
        // Save Google profile photo on first sign-in if not already set
        const googlePhoto = user.image ?? null
        if (player?.id && googlePhoto && !player.photo_url) {
          await supabase
            .from('players')
            .update({ photo_url: googlePhoto })
            .eq('id', player.id)
        }
        token.photoUrl = player?.photo_url ?? googlePhoto
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
