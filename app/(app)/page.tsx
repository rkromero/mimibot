import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import MiDiaView from '@/components/dashboard/vendedor/MiDiaView'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await auth()

  if (!session) redirect('/login')

  const { role, id, name } = session.user

  if (role === 'admin') redirect('/admin/dashboard')
  if (role === 'gerente') redirect('/dashboard')

  // role === 'agent' (or any other future role falls through to Mi día)
  return (
    <MiDiaView user={{ id, name: name ?? null, role }} />
  )
}
