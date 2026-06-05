'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, LogOut, WifiOff } from 'lucide-react'
import { signOut } from 'next-auth/react'

export default function RepartidorShell({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js')
    }

    // Online/offline detection
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  function handleRefresh() {
    void qc.invalidateQueries({ queryKey: ['repartidor-pedidos'] })
    void qc.invalidateQueries({ queryKey: ['repartidor-listos'] })
  }

  return (
    <div className="flex flex-col h-dvh bg-background">
      <header
        className="sticky top-0 z-20 bg-card border-b border-border shadow-sm shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="h-14 flex items-center gap-1 px-4">
          <h1 className="flex-1 text-xl font-bold text-foreground tracking-tight">
            Mis entregas
          </h1>
          <button
            type="button"
            onClick={handleRefresh}
            aria-label="Refrescar lista"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-accent active:bg-accent/70 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={18} />
          </button>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            aria-label="Cerrar sesión"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-accent active:bg-accent/70 text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>

        {!isOnline && (
          <div className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-amber-500 text-white text-xs font-medium">
            <WifiOff size={12} />
            Sin conexión — los pedidos pueden estar desactualizados
          </div>
        )}
      </header>

      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {children}
      </main>
    </div>
  )
}
