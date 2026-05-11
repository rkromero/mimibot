import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await auth()

  if (!session) redirect('/login')

  const { role } = session.user

  if (role === 'admin') redirect('/admin/dashboard')
  if (role === 'gerente') redirect('/dashboard')

  // Agents go to their day view
  redirect('/agent/home')
}
