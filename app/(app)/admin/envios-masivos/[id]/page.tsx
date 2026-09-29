import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import EnvioDetalleView from '@/components/admin/envios-masivos/EnvioDetalleView'

export const metadata = { title: 'Envío masivo' }

/** Detalle de un envío masivo. Solo admin. */
export default async function EnvioDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'admin') redirect('/admin/dashboard')
  const { id } = await params
  return <EnvioDetalleView id={id} />
}
