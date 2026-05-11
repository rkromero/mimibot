'use client'

import { useState, useEffect } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

export default function OfflineBanner() {
  const queryClient = useQueryClient()
  const [offline, setOffline] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    setOffline(!navigator.onLine)

    function handleOnline() {
      setOffline(false)
      setSyncing(true)
      // Ask SW to flush queue
      navigator.serviceWorker?.controller?.postMessage({ type: 'FLUSH_QUEUE' })
      setTimeout(() => setSyncing(false), 3000)
    }
    function handleOffline() { setOffline(true) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Listen for SW sync-done messages
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
      if ((e.data as { type: string })?.type === 'OFFLINE_SYNC_DONE') {
        void queryClient.invalidateQueries()
        setPendingCount((n) => Math.max(0, n - 1))
      }
    })

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [queryClient])

  // Track queued count by intercepting fetch responses
  useEffect(() => {
    const orig = window.fetch
    window.fetch = async (...args) => {
      const res = await orig(...args)
      if (res.status === 202) {
        const clone = res.clone()
        clone.json().then((data: { queued?: boolean }) => {
          if (data.queued) setPendingCount((n) => n + 1)
        }).catch(() => undefined)
      }
      return res
    }
    return () => { window.fetch = orig }
  }, [])

  if (!offline && !syncing && pendingCount === 0) return null

  return (
    <div className={`fixed top-0 inset-x-0 z-[150] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium transition-all ${
      offline
        ? 'bg-amber-500 text-white'
        : 'bg-green-500 text-white'
    }`}>
      {offline ? (
        <>
          <WifiOff size={13} />
          Sin conexión — las acciones se sincronizarán al reconectar
          {pendingCount > 0 && <span className="ml-1 bg-white/20 rounded-full px-1.5">{pendingCount} pendientes</span>}
        </>
      ) : (
        <>
          <RefreshCw size={13} className="animate-spin" />
          Sincronizando acciones offline...
        </>
      )}
    </div>
  )
}
