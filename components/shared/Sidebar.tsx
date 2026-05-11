'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, Inbox, Settings, LogOut, Users, Package, ShoppingCart,
  Building2, BarChart3, Target, Map, TrendingDown, Boxes, Layers, Search,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import Avatar from '@/components/shared/Avatar'
import type { Session } from 'next-auth'

type User = Session['user']
type Role = 'admin' | 'gerente' | 'agent'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  roles?: Role[]
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const ALL_ROLES: Role[] = ['admin', 'gerente', 'agent']

const RAW_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Operación',
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: LayoutGrid, roles: ALL_ROLES },
      { href: '/inbox', label: 'Inbox', icon: Inbox, roles: ALL_ROLES },
      { href: '/crm/pedidos', label: 'Pedidos', icon: ShoppingCart, roles: ALL_ROLES },
    ],
  },
  {
    label: 'Maestros',
    items: [
      { href: '/crm/clientes', label: 'Clientes', icon: Users, roles: ALL_ROLES },
      { href: '/crm/productos', label: 'Productos', icon: Package, roles: ALL_ROLES },
      { href: '/stock', label: 'Stock', icon: Boxes, roles: ALL_ROLES },
      { href: '/territorios', label: 'Territorios', icon: Map, roles: ['admin', 'gerente'] },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { href: '/dashboard', label: 'Mi Dashboard', icon: BarChart3, roles: ['agent', 'gerente'] },
      { href: '/admin/dashboard', label: 'Dashboard', icon: BarChart3, roles: ['admin'] },
      { href: '/admin/metas', label: 'Metas', icon: Target, roles: ['admin', 'gerente'] },
      { href: '/reportes/morosos', label: 'Morosos', icon: TrendingDown, roles: ['admin', 'gerente'] },
    ],
  },
  {
    label: 'Administración',
    items: [
      { href: '/admin/configuracion', label: 'Config. Negocio', icon: Settings, roles: ['admin'] },
      { href: '/admin/empresa-config', label: 'Empresa', icon: Building2, roles: ['admin'] },
      { href: '/settings', label: 'Sistema', icon: Layers, roles: ['admin'] },
    ],
  },
]

function filterGroups(role: Role): NavGroup[] {
  return RAW_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0)
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  pathname,
}: NavItem & { pathname: string }) {
  const isActive =
    href === '/dashboard'
      ? pathname === '/dashboard' || pathname.startsWith('/dashboard/')
      : pathname.startsWith(href)

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-100',
        isActive
          ? 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon size={15} strokeWidth={1.75} />
      {label}
    </Link>
  )
}

export default function Sidebar({ user, onSearchOpen }: { user: User; onSearchOpen?: () => void }) {
  const pathname = usePathname()
  const groups = filterGroups(user.role as Role)

  return (
    <aside className="hidden md:flex flex-col w-52 border-r border-border bg-card shrink-0">
      <div className="h-12 flex items-center px-4 border-b border-border shrink-0">
        <span className="text-md font-semibold text-foreground flex-1">Mimi Alfajores</span>
        <button
          onClick={onSearchOpen}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Buscar (Ctrl+K)"
          aria-label="Abrir búsqueda"
        >
          <Search size={15} />
        </button>
      </div>

      <nav className="flex-1 py-2 px-2 overflow-y-auto" aria-label="Navegación principal">
        {groups.map((group, gi) => (
          <div key={group.label} className={cn('pb-1', gi > 0 && 'pt-3')}>
            <p className="px-2.5 pb-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarLink key={item.href} {...item} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3 shrink-0">
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
            aria-label="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}
