'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import {
  Home,
  MessageSquare,
  Plus,
  Users,
  MoreHorizontal,
  LayoutGrid,
  Package,
  BarChart3,
  Map,
  Settings,
  LogOut,
  ShoppingCart,
  Boxes,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Session } from 'next-auth'
import BottomSheet from '@/components/shared/BottomSheet'

type Props = {
  user: Session['user']
  onNewPedido?: () => void
  onSearchOpen?: () => void
}

// ─── Admin / Gerente tabs (unchanged) ────────────────────────────────────────

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

// ─── Inbox unread badge ───────────────────────────────────────────────────────

function useUnreadCount(enabled: boolean) {
  const { data } = useQuery<number>({
    queryKey: ['inbox-unread'],
    queryFn: async () => {
      const res = await fetch('/api/inbox?filter=mine')
      if (!res.ok) return 0
      const json = (await res.json()) as { data: Array<{ unreadCount: number }> }
      return (json.data ?? []).reduce((sum, item) => sum + (item.unreadCount ?? 0), 0)
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  return data ?? 0
}

// ─── Generic link tab ────────────────────────────────────────────────────────

function NavTab({
  href,
  label,
  icon: Icon,
  active,
  children,
}: {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
  children?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors min-h-[56px]',
        active ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <span className="relative">
        <Icon size={22} strokeWidth={active ? 2 : 1.75} />
        {children}
      </span>
      <span className={cn('font-medium', active && 'font-semibold')}>{label}</span>
    </Link>
  )
}

// ─── Agent navigation ─────────────────────────────────────────────────────────

function AgentNav({ user, onNewPedido, onSearchOpen }: Props) {
  const pathname = usePathname()
  const [masOpen, setMasOpen] = useState(false)
  const unreadCount = useUnreadCount(user.role === 'agent')

  const inicioActive = pathname === '/' || pathname.startsWith('/agent/home')
  const inboxActive = pathname.startsWith('/inbox')
  const clientesActive = pathname.startsWith('/crm/clientes')

  return (
    <>
      {/* Tab: Inicio */}
      <NavTab href="/agent/home" label="Inicio" icon={Home} active={inicioActive} />

      {/* Tab: Inbox (with badge) */}
      <NavTab href="/inbox" label="Inbox" icon={MessageSquare} active={inboxActive}>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </NavTab>

      {/* Center button: Nuevo Pedido */}
      <button
        type="button"
        onClick={() => onNewPedido?.()}
        aria-label="Nuevo pedido"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted-foreground min-h-[56px]"
      >
        <span className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg -mt-4">
          <Plus size={24} strokeWidth={2} />
        </span>
        <span className="font-medium">Pedido</span>
      </button>

      {/* Tab: Buscar */}
      <button
        type="button"
        onClick={onSearchOpen}
        aria-label="Buscar"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted-foreground min-h-[56px] transition-colors"
      >
        <Search size={22} strokeWidth={1.75} />
        <span className="font-medium">Buscar</span>
      </button>

      {/* Tab: Más */}
      <button
        type="button"
        onClick={() => setMasOpen(true)}
        aria-label="Más opciones"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted-foreground min-h-[56px] transition-colors"
      >
        <MoreHorizontal size={22} strokeWidth={1.75} />
        <span className="font-medium">Más</span>
      </button>

      {/* BottomSheet: Más menú */}
      <BottomSheet open={masOpen} onClose={() => setMasOpen(false)} title="Menú">
        <nav className="flex flex-col">
          <Link
            href="/pipeline"
            onClick={() => setMasOpen(false)}
            className="flex items-center gap-3 p-4 rounded-xl hover:bg-accent active:bg-accent min-h-[56px]"
          >
            <LayoutGrid size={20} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground">Pipeline</span>
          </Link>
          <Link
            href="/crm/productos"
            onClick={() => setMasOpen(false)}
            className="flex items-center gap-3 p-4 rounded-xl hover:bg-accent active:bg-accent min-h-[56px]"
          >
            <Package size={20} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground">Productos</span>
          </Link>
          <Link
            href="/dashboard"
            onClick={() => setMasOpen(false)}
            className="flex items-center gap-3 p-4 rounded-xl hover:bg-accent active:bg-accent min-h-[56px]"
          >
            <BarChart3 size={20} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground">Dashboard</span>
          </Link>
          <Link
            href="/territorios"
            onClick={() => setMasOpen(false)}
            className="flex items-center gap-3 p-4 rounded-xl hover:bg-accent active:bg-accent min-h-[56px]"
          >
            <Map size={20} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground">Territorios</span>
          </Link>
          <Link
            href="/settings/bot"
            onClick={() => setMasOpen(false)}
            className="flex items-center gap-3 p-4 rounded-xl hover:bg-accent active:bg-accent min-h-[56px]"
          >
            <Settings size={20} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground">Configuración</span>
          </Link>

          <div className="border-t border-border my-2" />

          <button
            type="button"
            onClick={() => signOut()}
            className="flex items-center gap-3 p-4 rounded-xl hover:bg-accent active:bg-accent min-h-[56px] w-full text-left"
          >
            <LogOut size={20} className="text-red-500 shrink-0" />
            <span className="text-sm font-medium text-red-500">Cerrar sesión</span>
          </button>
        </nav>
      </BottomSheet>
    </>
  )
}

// ─── Admin / Gerente generic tabs ─────────────────────────────────────────────

function GenericTabs({ tabs, pathname, onSearchOpen }: { tabs: typeof ADMIN_TABS; pathname: string; onSearchOpen?: () => void }) {
  return (
    <>
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
      <button
        type="button"
        onClick={onSearchOpen}
        aria-label="Buscar"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted-foreground min-h-[56px] transition-colors"
      >
        <Search size={22} strokeWidth={1.75} />
        <span className="font-medium">Buscar</span>
      </button>
    </>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function BottomNav({ user, onNewPedido, onSearchOpen }: Props) {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t border-border bg-card pb-safe">
      {user.role === 'admin' && (
        <GenericTabs tabs={ADMIN_TABS} pathname={pathname} onSearchOpen={onSearchOpen} />
      )}
      {user.role === 'gerente' && (
        <GenericTabs tabs={GERENTE_TABS} pathname={pathname} onSearchOpen={onSearchOpen} />
      )}
      {user.role === 'agent' && (
        <AgentNav user={user} onNewPedido={onNewPedido} onSearchOpen={onSearchOpen} />
      )}
    </nav>
  )
}
