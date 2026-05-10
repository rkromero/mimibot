import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TerritoriosListView from '@/components/territorios/TerritoriosListView'

export const metadata = { title: 'Territorios' }

export default async function TerritoriosPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role === 'agent') redirect('/dashboard')

  return <TerritoriosListView role={session.user.role} />
}
