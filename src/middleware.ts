import { withAuth } from 'next-auth/middleware'

export default withAuth({
  callbacks: {
    authorized({ token }) {
      return !!token
    },
  },
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: ['/gc/:path*', '/gc-review', '/gc-players', '/admin/:path*'],
}