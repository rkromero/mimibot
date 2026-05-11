import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import Sidebar from '@/components/shared/Sidebar'
import BottomNav from '@/components/shared/BottomNav'
import PinLock from '@/components/shared/PinLock'
import OfflineBanner from '@/components/shared/OfflineBanner'
import { ToastProvider } from '@/components/shared/ToastProvider'
import AppShell from '@/components/shared/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <ToastProvider>
        <PinLock>
          <OfflineBanner />
          <AppShell user={session.user}>
            {children}
          </AppShell>
        </PinLock>
      </ToastProvider>
    </SessionProvider>
  )
}
