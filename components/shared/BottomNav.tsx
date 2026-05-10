'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, ShoppingCart, Package, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Session } from 'next-auth'

type Props = { user: Session['user'] }

const TABS = [
  { href: '/crm/clientes', label: 'Clientes', icon: Users },
  { href: '/crm/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { href: '/crm/productos', label: 'Productos', icon: Package },
  { href: '/pipeline', label: 'Pipeline', icon: LayoutGrid },
]

export default function BottomNav({ user: _ }: Props) {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t border-border bg-card pb-safe">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors min-h-[56px]',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon size={22} strokeWidth={active ? 2 : 1.75} />
            <span className={cn('font-medium', active && 'font-semibold')}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
