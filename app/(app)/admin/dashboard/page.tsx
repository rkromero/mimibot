import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/dashboard/admin/AdminDashboard'
import GerenteDashboard from '@/components/dashboard/gerente/GerenteDashboard'

export default async function AdminDashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const { role } = session.user

  // Only admin and gerente may access this page; everyone else goes to their home
  if (role !== 'admin' && role !== 'gerente') redirect('/dashboard')

  const now = new Date()

  // Gerente sees team metrics filtered by their territory
  if (role === 'gerente') {
    return (
      <div className="h-full overflow-y-auto">
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

  // Admin sees full team metrics
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Dashboard de Equipo</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Seguimiento de metas del equipo de ventas
            </p>
          </div>
        </div>
        <AdminDashboard
          currentAnio={now.getFullYear()}
          currentMes={now.getMonth() + 1}
        />
      </div>
    </div>
  )
}
