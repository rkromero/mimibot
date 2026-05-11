'use client'

import {
  ShoppingCart,
  DollarSign,
  MessageSquare,
  Phone,
  Activity,
} from 'lucide-react'
import { relativeTime } from '@/lib/utils'

type Movimiento = {
  tipo: string
  descripcion: string
  creadoEn: string
  clienteNombre?: string
}

type Props = {
  items: Movimiento[]
  isLoading?: boolean
}

function IconByTipo({ tipo }: { tipo: string }) {
  switch (tipo) {
    case 'pedido':
      return <ShoppingCart size={18} className="text-muted-foreground" />
    case 'pago':
      return <DollarSign size={18} className="text-muted-foreground" />
    case 'mensaje':
      return <MessageSquare size={18} className="text-muted-foreground" />
    case 'llamada':
      return <Phone size={18} className="text-muted-foreground" />
    default:
      return <Activity size={18} className="text-muted-foreground" />
  }
}

export default function UltimosMovimientos({ items, isLoading = false }: Props) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-2">
        Últimos movimientos
      </h2>

      {isLoading ? (
        <div className="flex flex-col">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-3 border-b border-border last:border-b-0"
            >
              <div className="w-9 h-9 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-3.5 bg-muted animate-pulse rounded w-2/3" />
                <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
              </div>
              <div className="h-3 bg-muted animate-pulse rounded w-10 shrink-0" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Aún no hay actividad hoy.
        </p>
      ) : (
        <div className="flex flex-col">
          {items.map((mov, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-3 border-b border-border last:border-b-0"
            >
              {/* Icon */}
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <IconByTipo tipo={mov.tipo} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {mov.clienteNombre ?? mov.tipo}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {mov.descripcion}
                </p>
              </div>

              {/* Time */}
              <p className="text-xs text-muted-foreground shrink-0">
                {relativeTime(mov.creadoEn)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
