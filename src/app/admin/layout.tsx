import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      {/* Admin top bar */}
      <header className="bg-ink-2 border-b border-ink-5 h-12 flex items-center px-5 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-gold to-gold-dim flex items-center justify-center font-cinzel font-black text-ink text-xs"
            style={{ clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)' }}>
            S
          </div>
          <span className="font-cinzel text-gold-dim text-xs tracking-widest">SPARTANS CC</span>
          <span className="font-rajdhani text-zinc-700 text-xs tracking-widest">/ ADMIN</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {session.user?.image && (
            <img src={session.user.image} alt="" className="w-6 h-6 rounded-full opacity-80" />
          )}
          <span className="font-rajdhani text-xs text-zinc-600 hidden sm:block">{session.user?.email}</span>
          <a href="/api/auth/signout"
            className="font-rajdhani text-xs text-zinc-700 hover:text-zinc-400 border border-ink-5 px-3 py-1 rounded transition-colors">
            Sign out
          </a>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
