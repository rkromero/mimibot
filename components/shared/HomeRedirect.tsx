'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getHomeRouteByRole } from '@/lib/auth-utils'

type Props = { role: 'admin' | 'gerente' | 'agent' | 'vendedor' | 'fabrica' | 'repartidor' | 'rtv' }

export default function HomeRedirect({ role }: Props) {
  const router = useRouter()

  useEffect(() => {
    router.replace(getHomeRouteByRole(role))
  }, [role, router])

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
