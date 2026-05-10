'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Inbox, Settings, LogOut, Users, Package, ShoppingCart } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'
import type { Session } from 'next-auth'

type User = Session['user']

const NAV = [
  { href: '/pipeline', label: 'Pipeline', icon: LayoutGrid },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
]

const CRM_NAV = [
  { href: '/crm/clientes', label: 'Clientes', icon: Users },
  { href: '/crm/productos', label: 'Productos', icon: Package },
  { href: '/crm/pedidos', label: 'Pedidos', icon: ShoppingCart },
]

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex flex-col w-52 border-r border-border bg-card shrink-0">
      {/* Logo / nombre de la app */}
      <div className="h-12 flex items-center px-4 border-b border-border">
        <span className="text-md font-semibold text-foreground">CRM</span>
      </div>

      {/* Navegación principal */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-100',
              pathname.startsWith(href)
                ? 'bg-accent text-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </Link>
        ))}

        {/* CRM Section */}
        <div className="pt-3 pb-1">
          <p className="px-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            CRM
          </p>
          {CRM_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-100',
                pathname.startsWith(href)
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </Link>
          ))}
        </div>

        {user.role === 'admin' && (
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-100 mt-1',
              pathname.startsWith('/settings')
                ? 'bg-accent text-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Settings size={15} strokeWidth={1.75} />
            Configuración
          </Link>
        )}
      </nav>

      {/* Usuario actual */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2">
          <Avatar name={user.name ?? user.email} color={user.avatarColor} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user.name ?? 'Sin nombre'}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-100"
            title="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
