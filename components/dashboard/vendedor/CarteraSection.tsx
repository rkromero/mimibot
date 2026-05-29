'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Users } from 'lucide-react'

interface Props {
  vendedorId: string
}

interface CountResponse {
  activos: number
  inactivos: number
  perdidos: number
}

async function fetchEstadoCount(estado: string): Promise<number> {
  const res = await fetch(`/api/clientes?estadoActividad=${estado}&limit=1`)
  if (!res.ok) return 0
  const json = (await res.json()) as { total?: number }
  return json.total ?? 0
}

export default function CarteraSection({ vendedorId: _ }: Props) {
  const { data, isLoading, isError } = useQuery<CountResponse>({
    queryKey: ['cartera-stats'],
    queryFn: async () => {
      const [activos, inactivos, perdidos] = await Promise.all([
        fetchEstadoCount('activo'),
        fetchEstadoCount('inactivo'),
        fetchEstadoCount('perdido'),
      ])
      return { activos, inactivos, perdidos }
    },
    staleTime: 60_000,
  })

  const activos = data?.activos ?? 0
  const inactivos = data?.inactivos ?? 0
  const perdidos = data?.perdidos ?? 0

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Mi Cartera</h2>
      </div>

      {/* Loading — matches card height */}
      {isLoading && (
        <div className="rounded-xl border border-border bg-card animate-pulse h-[88px]" />
      )}

      {isError && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl p-4">
          Error al cargar cartera
        </p>
      )}

      {!isLoading && !isError && (
        /* Single horizontal card — 3 equal segments with vertical dividers.
           Works identically at 375px, 768px and 1440px. */
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex divide-x divide-border">
            <Link
              href="/crm/clientes?estadoActividad=activo"
              className="flex-1 flex flex-col items-center justify-center py-5 hover:bg-accent transition-colors min-h-[88px]"
            >
              <p className="text-3xl font-bold text-green-600 dark:text-green-500 tabular-nums leading-none">
                {activos}
              </p>
              <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wider font-medium">
                Activos
              </p>
            </Link>

            <Link
              href="/crm/clientes?estadoActividad=inactivo"
              className="flex-1 flex flex-col items-center justify-center py-5 hover:bg-accent transition-colors min-h-[88px]"
            >
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-500 tabular-nums leading-none">
                {inactivos}
              </p>
              <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wider font-medium">
                Inactivos
              </p>
            </Link>

            <Link
              href="/crm/clientes?estadoActividad=perdido"
              className="flex-1 flex flex-col items-center justify-center py-5 hover:bg-accent transition-colors min-h-[88px]"
            >
              <p className="text-3xl font-bold text-red-600 dark:text-red-500 tabular-nums leading-none">
                {perdidos}
              </p>
              <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wider font-medium">
                Perdidos
              </p>
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
