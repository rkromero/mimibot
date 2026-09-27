import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TableroView from '@/components/admin/tablero/TableroView'

export const metadata = { title: 'Tablero de comando' }

/** Análisis → Tablero de comando. Solo admin (incluye gastos y resultado). */
export default async function TableroPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'admin') redirect('/admin/dashboard')
  return <TableroView />
}
