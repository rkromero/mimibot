'use client'

import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import ParaHoySection from './ParaHoySection'
import UltimosMovimientos from './UltimosMovimientos'

type Movimiento = {
  tipo: string
  descripcion: string
  creadoEn: string
  clienteNombre?: string
}

type ParaHoy = {
  leadsInactivos: number
  visitasHoy: number
  cobranzasVencidas: number
  pedidosPorEntregar: number
}

type HoyData = {
  nombre: string
  meta: {
    pedidosAlcanzados: number
    pedidosObjetivo: number
  } | null
  paraHoy: ParaHoy
  ultimosMovimientos: Movimiento[]
}

type Props = {
  user: {
    id: string
    name: string | null
    role: string
  }
}

const EMPTY_PARA_HOY: ParaHoy = {
  leadsInactivos: 0,
  visitasHoy: 0,
  cobranzasVencidas: 0,
  pedidosPorEntregar: 0,
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-32 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>

      {/* Para hoy skeleton */}
      <div>
        <div className="h-4 w-20 rounded bg-muted animate-pulse mb-3" />
        <div className="flex gap-3 -mx-4 px-4 overflow-x-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="w-[148px] h-28 rounded-2xl bg-muted animate-pulse shrink-0"
            />
          ))}
        </div>
      </div>

      {/* Button placeholder */}
      <div className="h-[68px] rounded-2xl bg-muted animate-pulse" />

      {/* Movimientos skeleton */}
      <div>
        <div className="h-4 w-36 rounded bg-muted animate-pulse mb-3" />
        <div className="flex flex-col">
          {Array.from({ length: 4 }).map((_, i) => (
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
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function MiDiaView({ user: _user }: Props) {
  const { data, isLoading } = useQuery<HoyData | null>({
    queryKey: ['dashboard-hoy'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/hoy')
      if (!res.ok) return null
      const json = (await res.json()) as { data: HoyData | null }
      return json.data ?? null
    },
    staleTime: 30_000,
  })

  return (
    <div className="h-full overflow-y-auto pb-[88px]">
      <div className="max-w-lg mx-auto p-4 space-y-6">

        {isLoading ? (
          <Skeleton />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Hola, {data?.nombre ?? 'vendedor'}!
                </h1>
                {data?.meta ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">
                      Pedidos: {data.meta.pedidosAlcanzados}/{data.meta.pedidosObjetivo}
                    </span>
                    <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            (data.meta.pedidosAlcanzados /
                              Math.max(1, data.meta.pedidosObjetivo)) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">Sin meta para este mes</p>
                )}
              </div>
            </div>

            {/* Para hoy */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">Para hoy</h2>
              <ParaHoySection
                data={data?.paraHoy ?? EMPTY_PARA_HOY}
                isLoading={false}
              />
            </div>

            {/* New order button */}
            <button
              type="button"
              className="w-full py-5 bg-primary text-primary-foreground rounded-2xl text-lg font-bold flex items-center justify-center gap-3 shadow-sm active:bg-primary/90 transition-colors"
            >
              <Plus size={24} />
              Nuevo pedido
            </button>

            {/* Últimos movimientos */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">Últimos movimientos</h2>
              </div>
              <UltimosMovimientos
                items={data?.ultimosMovimientos ?? []}
                isLoading={false}
              />
            </div>
          </>
        )}

      </div>
    </div>
  )
}
