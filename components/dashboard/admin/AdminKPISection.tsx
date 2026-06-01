'use client'

import { useEffect, useState } from 'react'
import ClientesBarChart from './ClientesBarChart'
import type { AdminDashboardStats } from '@/lib/admin/dashboard.service'

interface Props {
  anio: number
  mes: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-AR').format(value)
}

export default function AdminKPISection({ anio, mes }: Props) {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setStats(null)
    fetch(`/api/admin/dashboard-kpis?anio=${anio}&mes=${mes}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Error al cargar indicadores')
        return (await r.json()) as { data: AdminDashboardStats }
      })
      .then((json) => setStats(json.data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Error al cargar indicadores'),
      )
      .finally(() => setLoading(false))
  }, [anio, mes])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-28 rounded-lg border border-border bg-muted/30 animate-pulse" />
          <div className="h-28 rounded-lg border border-border bg-muted/30 animate-pulse" />
        </div>
        <div className="h-72 rounded-lg border border-border bg-muted/30 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Productos vendidos
          </p>
          <p className="text-3xl font-bold tracking-tight leading-none">
            {formatNumber(stats.productosVendidos)}
          </p>
          <p className="text-sm text-muted-foreground mt-2">{stats.mesNombre}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Cartera activa
          </p>
          <p className="text-3xl font-bold tracking-tight leading-none">
            {formatCurrency(stats.carteraActiva)}
          </p>
          <p className="text-sm text-muted-foreground mt-2">{stats.mesNombre}</p>
        </div>
      </div>

      {/* Bar chart */}
      <ClientesBarChart data={stats.chartData} mes={stats.mesNombre} />
    </div>
  )
}
