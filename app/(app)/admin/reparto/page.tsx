import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import RepartoActivoView from '@/components/admin/reparto/RepartoActivoView'

export const metadata = { title: 'Reparto en curso' }
export const dynamic = 'force-dynamic'

export default async function AdminRepartoPage() {
  const session = await auth()
  if (!session || !['admin', 'gerente'].includes(session.user.role)) redirect('/pipeline')

  return (
    <div className="h-full overflow-y-auto">
      <RepartoActivoView />
    </div>
  )
}
