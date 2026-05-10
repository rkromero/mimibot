import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import VendedorDashboard from '@/components/dashboard/vendedor/VendedorDashboard'
import GerenteDashboard from '@/components/dashboard/gerente/GerenteDashboard'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role === 'admin') redirect('/admin/dashboard')

  const now = new Date()

  if (session.user.role === 'gerente') {
    return (
      <div className="h-full overflow-y-auto pb-20 md:pb-0">
        <div className="p-4 md:p-6 space-y-6">
          <div>
            <h1 className="text-xl font-semibold">Dashboard de Gerencia</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Seguimiento de tus territorios y agentes
            </p>
          </div>
          <GerenteDashboard
            user={session.user}
            currentAnio={now.getFullYear()}
            currentMes={now.getMonth() + 1}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <VendedorDashboard user={session.user} />
      </div>
    </div>
  )
}
