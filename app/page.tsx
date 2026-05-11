import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function RootPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role === 'admin') redirect('/admin/dashboard')
  redirect('/dashboard')
}
