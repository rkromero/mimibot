'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users } from 'lucide-react'

interface CarteraStats {
  activos: number
  inactivos: number
  perdidos: number
}

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
  const [stats, setStats] = useState<CarteraStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCartera() {
      try {
        const res = await fetch('/api/clientes')
        if (!res.ok) throw new Error('Error al cargar cartera')
        const json = (await res.json()) as ApiResponse
        const clientes = json.data ?? []

        const activos = clientes.filter((c) => c.estadoActividad === 'activo').length
        const inactivos = clientes.filter((c) => c.estadoActividad === 'inactivo').length
        const perdidos = clientes.filter((c) => c.estadoActividad === 'perdido').length

        setStats({ activos, inactivos, perdidos })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }

    void fetchCartera()
  }, [])

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Mi Cartera</h2>
      </div>

      {loading && (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-3 animate-pulse h-16"
            />
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
      )}

      {stats && !loading && (
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/crm/clientes?estadoActividad=activo"
            className="rounded-lg border border-border bg-card p-3 text-center hover:bg-accent transition-colors"
          >
            <p className="text-2xl font-bold text-green-600 tabular-nums">{stats.activos}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Activos</p>
          </Link>

          <Link
            href="/crm/clientes?estadoActividad=inactivo"
            className="rounded-lg border border-border bg-card p-3 text-center hover:bg-accent transition-colors"
          >
            <p className="text-2xl font-bold text-amber-600 tabular-nums">{stats.inactivos}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Inactivos</p>
          </Link>

          <Link
            href="/crm/clientes?estadoActividad=perdido"
            className="rounded-lg border border-border bg-card p-3 text-center hover:bg-accent transition-colors"
          >
            <p className="text-2xl font-bold text-red-600 tabular-nums">{stats.perdidos}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Perdidos</p>
          </Link>
        </div>
      )}
    </section>
  )
}
