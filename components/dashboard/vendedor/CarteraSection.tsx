'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Users } from 'lucide-react'

interface Props {
  vendedorId: string
}

interface ClienteRow {
  estadoActividad: 'activo' | 'inactivo' | 'perdido' | null
}

interface ApiResponse {
  data: ClienteRow[]
}

export default function CarteraSection({ vendedorId: _ }: Props) {
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ['cartera-stats'],
    queryFn: async () => {
      const res = await fetch('/api/clientes')
      if (!res.ok) throw new Error('Error al cargar cartera')
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60_000,
  })

  const clientes = data?.data ?? []
  const activos = clientes.filter((c) => c.estadoActividad === 'activo').length
  const inactivos = clientes.filter((c) => c.estadoActividad === 'inactivo').length
  const perdidos = clientes.filter((c) => c.estadoActividad === 'perdido').length

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
