import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MiDiaView from '@/components/dashboard/vendedor/MiDiaView'

export const dynamic = 'force-dynamic'

export default async function AgentHomePage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'agent') redirect('/')

  const { id, name, role } = session.user
  return <MiDiaView user={{ id, name: name ?? null, role }} />
}
