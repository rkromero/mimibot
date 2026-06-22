'use client'

import { useEffect, useState } from 'react'
import ClientesBarChart from './ClientesBarChart'
import ClientesCreadosLineChart from './ClientesCreadosLineChart'
import type { AdminDashboardStats, Granularidad } from '@/lib/admin/dashboard.service'

interface Props {
  granularidad: Granularidad
  territorioId?: string
  gerenteId?: string
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

export default function AdminKPISection({ granularidad, territorioId, gerenteId }: Props) {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setStats(null)
    const qs = new URLSearchParams({ granularidad })
    if (territorioId) qs.set('territorioId', territorioId)
    else if (gerenteId) qs.set('gerenteId', gerenteId)
    fetch(`/api/admin/dashboard-kpis?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Error al cargar indicadores')
        return (await r.json()) as { data: AdminDashboardStats }
      })
      .then((json) => setStats(json.data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Error al cargar indicadores'),
      )
      .finally(() => setLoading(false))
  }, [granularidad, territorioId, gerenteId])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-28 rounded-lg border border-border bg-muted/30 animate-pulse" />
          <div className="h-28 rounded-lg border border-border bg-muted/30 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 rounded-lg border border-border bg-muted/30 animate-pulse" />
          <div className="h-72 rounded-lg border border-border bg-muted/30 animate-pulse" />
        </div>
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
          <p className="text-sm text-muted-foreground mt-2">{stats.rangoLabel}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Cartera activa
          </p>
          <p className="text-3xl font-bold tracking-tight leading-none">
            {formatCurrency(stats.carteraActiva)}
          </p>
          <p className="text-sm text-muted-foreground mt-2">{stats.rangoLabel}</p>
        </div>
      </div>

      {/* Charts side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ClientesBarChart data={stats.chartData} granularidad={stats.granularidad} rangoLabel={stats.rangoLabel} />
        <ClientesCreadosLineChart data={stats.clientesCreados} granularidad={stats.granularidad} rangoLabel={stats.rangoLabel} />
      </div>
    </div>
  )
}
