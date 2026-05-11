'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, ShoppingCart, Package, LayoutGrid, BarChart3, Map, Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Session } from 'next-auth'

type Props = { user: Session['user'] }

const AGENT_TABS = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/crm/clientes', label: 'Clientes', icon: Users },
  { href: '/crm/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { href: '/crm/productos', label: 'Productos', icon: Package },
  { href: '/pipeline', label: 'Pipeline', icon: LayoutGrid },
]

const ADMIN_TABS = [
  { href: '/crm/clientes', label: 'Clientes', icon: Users },
  { href: '/crm/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { href: '/crm/productos', label: 'Productos', icon: Package },
  { href: '/stock', label: 'Stock', icon: Boxes },
  { href: '/pipeline', label: 'Pipeline', icon: LayoutGrid },
]

const GERENTE_TABS = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/territorios', label: 'Territorios', icon: Map },
  { href: '/crm/clientes', label: 'Clientes', icon: Users },
  { href: '/crm/pedidos', label: 'Pedidos', icon: ShoppingCart },
]

export default function BottomNav({ user }: Props) {
  const pathname = usePathname()
  const tabs = user.role === 'admin' ? ADMIN_TABS : user.role === 'gerente' ? GERENTE_TABS : AGENT_TABS

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t border-border bg-card pb-safe">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active =
          href === '/dashboard'
            ? pathname === '/dashboard' || pathname.startsWith('/dashboard/')
            : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
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
