'use client'

import Link from 'next/link'
import { Clock, MapPin, AlertCircle, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'

type ParaHoy = {
  leadsInactivos: number
  visitasHoy: number
  cobranzasVencidas: number
  pedidosPorEntregar: number
}

type Props = {
  data: ParaHoy
  isLoading?: boolean
}

type CardDef = {
  key: keyof ParaHoy
  label: string
  icon: React.ElementType
  href?: string
  activeColor?: string
}

const CARDS: CardDef[] = [
  {
    key: 'leadsInactivos',
    label: 'Sin contactar',
    icon: Clock,
    href: '/pipeline',
    activeColor: 'text-amber-600',
  },
  {
    key: 'visitasHoy',
    label: 'Visitas hoy',
    icon: MapPin,
    // No href — disabled for now
  },
  {
    key: 'cobranzasVencidas',
    label: 'Cobranzas',
    icon: AlertCircle,
    href: '/reportes/morosos',
    activeColor: 'text-red-600',
  },
  {
    key: 'pedidosPorEntregar',
    label: 'Para entregar',
    icon: Truck,
    href: '/crm/pedidos?estado=en_reparto',
  },
]

export default function ParaHoySection({ data, isLoading = false }: Props) {
  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-[148px] h-28 rounded-2xl animate-pulse bg-muted shrink-0"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4">
      {CARDS.map(({ key, label, icon: Icon, href, activeColor }) => {
        const count = data[key]
        const hasActivity = count > 0
        const navigable = hasActivity && !!href

        const cardContent = (
          <div
            className={cn(
              'w-[148px] shrink-0 rounded-2xl border border-border bg-card p-4 flex flex-col gap-2',
              !hasActivity && 'opacity-60',
            )}
          >
            <Icon
              size={20}
              className={cn(
                'text-muted-foreground',
                hasActivity && activeColor,
              )}
            />
            <p
              className={cn(
                'text-3xl font-bold text-foreground',
                hasActivity && activeColor,
              )}
            >
              {count}
            </p>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
          </div>
        )

        if (navigable) {
          return (
            <Link key={key} href={href!} className="shrink-0">
              {cardContent}
            </Link>
          )
        }

        return <div key={key}>{cardContent}</div>
      })}
    </div>
  )
}
