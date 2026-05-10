import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReasignacionMasivaView from '@/components/territorios/ReasignacionMasivaView'

export const metadata = { title: 'Reasignación Masiva de Clientes' }

export default async function ReasignacionPage() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') redirect('/territorios')

  return <ReasignacionMasivaView />
}
