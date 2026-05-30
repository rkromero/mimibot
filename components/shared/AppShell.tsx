'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'
import Sidebar, { filterGroups } from '@/components/shared/Sidebar'
import BottomNav from '@/components/shared/BottomNav'
import GlobalSearch from '@/components/shared/GlobalSearch'
import CreatePedidoModal from '@/components/crm/pedidos/CreatePedidoModal'
import Avatar from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'
import type { Session } from 'next-auth'

type User = Session['user']
type Role = 'admin' | 'gerente' | 'agent' | 'vendedor'

type Props = {
  user: User
  children: React.ReactNode
}

export default function AppShell({ user, children }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [newPedidoOpen, setNewPedidoOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Global Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const groups = filterGroups(user.role as Role)

  return (
    <>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar user={user} onSearchOpen={() => setSearchOpen(true)} />

        {/* Column wrapper: mobile header + main */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Mobile sticky header */}
          <header className="md:hidden flex items-center h-12 px-4 border-b border-border bg-card shrink-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
            <span className="flex-1 text-center text-sm font-semibold text-foreground">
              Mimi Alfajores
            </span>
            {/* Spacer to keep title centered */}
            <span className="w-7" aria-hidden />
          </header>

          <main className="flex-1 min-w-0 overflow-hidden">
            {children}
          </main>
        </div>

        <BottomNav user={user} onSearchOpen={() => setSearchOpen(true)} onNewPedido={() => setNewPedidoOpen(true)} />
      </div>

      {/* Mobile left drawer */}
      {drawerOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-50 bg-black/40 md:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />

          {/* Drawer panel */}
          <aside className="fixed left-0 top-0 bottom-0 z-50 w-64 bg-card border-r border-border flex flex-col md:hidden">
            <div className="h-12 flex items-center px-4 border-b border-border shrink-0">
              <span className="flex-1 text-sm font-semibold text-foreground">Mimi Alfajores</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cerrar menú"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 py-2 px-2 overflow-y-auto" aria-label="Navegación">
              {groups.map((group, gi) => (
                <div key={group.label} className={cn('pb-1', gi > 0 && 'pt-3')}>
                  <p className="px-2.5 pb-0.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive =
                        item.href === '/dashboard'
                          ? pathname === '/dashboard' || pathname.startsWith('/dashboard/')
                          : pathname.startsWith(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setDrawerOpen(false)}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-100',
                            isActive
                              ? 'bg-accent text-foreground font-medium'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                        >
                          <Icon size={15} strokeWidth={1.75} />
                          {item.label}
                        </Link>
                      )
                    })}
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
        </>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      {newPedidoOpen && <CreatePedidoModal onClose={() => setNewPedidoOpen(false)} />}
    </>
  )
}
