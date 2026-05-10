import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import VendedorDashboard from '@/components/dashboard/vendedor/VendedorDashboard'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role === 'admin') redirect('/admin/dashboard')
  return (
    <div className="h-full overflow-y-auto pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <VendedorDashboard user={session.user} />
      </div>
    </div>
  )
}
