import type { Metadata } from 'next'
import RepartidorShell from '@/components/repartidor/RepartidorShell'

export const metadata: Metadata = {
  title: 'Repartos',
  manifest: '/manifest.webmanifest',
}

export default function RepartidorLayout({ children }: { children: React.ReactNode }) {
  return <RepartidorShell>{children}</RepartidorShell>
}
