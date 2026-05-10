import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TerritorioDetailView from '@/components/territorios/TerritorioDetailView'

export const metadata = { title: 'Detalle de Territorio' }

export default async function TerritorioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role === 'agent') redirect('/dashboard')

  const { id } = await params
  return <TerritorioDetailView id={id} role={session.user.role} />
}
