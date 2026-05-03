import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SettingsNav from './SettingsNav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') redirect('/pipeline')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 h-12 border-b border-border shrink-0">
        <h1 className="text-md font-semibold">Configuración</h1>
        <SettingsNav />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  )
}
