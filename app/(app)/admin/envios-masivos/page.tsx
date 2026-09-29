import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EnviosMasivosView from '@/components/admin/envios-masivos/EnviosMasivosView'

export const metadata = { title: 'Envíos masivos' }

/** Operación → Envíos masivos. Solo admin. */
export default async function EnviosMasivosPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'admin') redirect('/admin/dashboard')
  return <EnviosMasivosView />
}
