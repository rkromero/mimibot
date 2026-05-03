'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/settings/bot',    label: 'Bot IA' },
  { href: '/settings/stages', label: 'Etapas' },
  { href: '/settings/team',   label: 'Equipo' },
]

export default function SettingsNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            'px-3 py-1 text-sm rounded-md transition-colors duration-100',
            pathname === tab.href
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
