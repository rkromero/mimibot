import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import VendedorDashboard from '@/components/dashboard/vendedor/VendedorDashboard'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const { role } = session.user

  // Admin and gerente belong in /admin/dashboard; redirect them there
  if (role === 'admin' || role === 'gerente') redirect('/admin/dashboard')

  // vendedor and agent see their personal KPIs / Mi Cartera
  return (
    <div className="h-full overflow-y-auto pb-20 md:pb-0">
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
        <VendedorDashboard user={session.user} />
      </div>
    </div>
  )
}
