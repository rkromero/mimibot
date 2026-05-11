'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Props = { role: 'admin' | 'gerente' | 'agent' }

export default function HomeRedirect({ role }: Props) {
  const router = useRouter()

  useEffect(() => {
    if (role === 'admin') router.replace('/admin/dashboard')
    else if (role === 'gerente') router.replace('/dashboard')
    else router.replace('/agent/home')
  }, [role, router])

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
