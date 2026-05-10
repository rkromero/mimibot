import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import Sidebar from '@/components/shared/Sidebar'
import BottomNav from '@/components/shared/BottomNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar user={session.user} />
        <main className="flex-1 min-w-0 overflow-hidden">
          {children}
        </main>
        <BottomNav user={session.user} />
      </div>
    </SessionProvider>
  )
}
