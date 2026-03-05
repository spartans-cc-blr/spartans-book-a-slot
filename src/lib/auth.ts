import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

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
    // Only allow the club Gmail (and any additional admin emails) to sign in
    async signIn({ user }) {
      const email = user.email?.toLowerCase() ?? ''
      if (!ADMIN_EMAILS.includes(email)) {
        // Not an authorised admin — block sign in
        return false
      }
      return true
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).isAdmin = ADMIN_EMAILS.includes(
          session.user.email?.toLowerCase() ?? ''
        )
      }
      return session
    },

    async jwt({ token, user }) {
      return token
    },
  },

  pages: {
    signIn:  '/admin/login',
    error:   '/admin/login',    // Redirect here on auth errors (e.g. unauthorised email)
  },

  session: {
    strategy: 'jwt',
    maxAge:   8 * 60 * 60,    // 8 hours
  },
}

export default NextAuth(authOptions)
