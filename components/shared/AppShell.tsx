'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/shared/Sidebar'
import BottomNav from '@/components/shared/BottomNav'
import GlobalSearch from '@/components/shared/GlobalSearch'
import type { Session } from 'next-auth'

type Props = {
  user: Session['user']
  children: React.ReactNode
}

export default function AppShell({ user, children }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)

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

  return (
    <>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar user={user} onSearchOpen={() => setSearchOpen(true)} />
        <main className="flex-1 min-w-0 overflow-hidden">
          {children}
        </main>
        <BottomNav user={user} onSearchOpen={() => setSearchOpen(true)} />
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
