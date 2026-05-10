import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/dashboard/admin/AdminDashboard'

export default async function AdminDashboardPage() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') redirect('/dashboard')
  const now = new Date()
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
