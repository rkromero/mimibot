'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function FabricaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full">
      <nav className="md:hidden flex border-b border-border bg-card shrink-0 px-4">
        <Link
          href="/fabrica"
          className={cn(
            'px-6 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors',
            pathname === '/fabrica'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Pedidos Confirmados
        </Link>
        <Link
          href="/fabrica/historico"
          className={cn(
            'px-6 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors',
            pathname.startsWith('/fabrica/historico')
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Histórico
        </Link>
      </nav>
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  )
}
