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
  const json = await res.json() as { total?: number }
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

      {isLoading && (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-3 animate-pulse h-16"
            />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3">Error al cargar cartera</p>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/crm/clientes?estadoActividad=activo"
            className="rounded-lg border border-border bg-card p-3 text-center hover:bg-accent transition-colors"
          >
            <p className="text-2xl font-bold text-green-600 tabular-nums">{activos}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Activos</p>
          </Link>

          <Link
            href="/crm/clientes?estadoActividad=inactivo"
            className="rounded-lg border border-border bg-card p-3 text-center hover:bg-accent transition-colors"
          >
            <p className="text-2xl font-bold text-amber-600 tabular-nums">{inactivos}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Inactivos</p>
          </Link>

          <Link
            href="/crm/clientes?estadoActividad=perdido"
            className="rounded-lg border border-border bg-card p-3 text-center hover:bg-accent transition-colors"
          >
            <p className="text-2xl font-bold text-red-600 tabular-nums">{perdidos}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Perdidos</p>
          </Link>
        </div>
      )}
    </section>
  )
}
