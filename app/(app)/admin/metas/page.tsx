import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MetasAdminView from '@/components/admin/metas/MetasAdminView'

export const metadata = { title: 'Metas Mensuales' }

export default async function MetasAdminPage() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') redirect('/pipeline')
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Metas Mensuales</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cargá los objetivos de cada vendedor por mes.
          </p>
        </div>
        <MetasAdminView />
      </div>
    </div>
  )
}
