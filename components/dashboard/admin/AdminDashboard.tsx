'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import PeriodoSelector from './PeriodoSelector'
import EquipoResumen from './EquipoResumen'
import VendedoresGrid from './VendedoresGrid'
import RankingSection, { type GerenteEquipo } from './RankingSection'
import AlertasPanel from './AlertasPanel'
import VendedorModal from './VendedorModal'

type Territorio = { id: string; nombre: string }
type GerenteUser = { id: string; name: string | null; email: string; role: 'admin' | 'gerente' | 'agent' }

type EstadoMeta = 'en_curso' | 'cumplida' | 'no_cumplida'

interface MetricaAvance {
  alcanzado: number
  pct: number
  proyeccion: number
  estado: EstadoMeta
}

interface MetaAvance {
  meta: {
    id: string
    vendedorId: string
    periodoAnio: number
    periodoMes: number
    clientesNuevosObjetivo: number
    pedidosObjetivo: number
    montoCobradoObjetivo: string
    conversionLeadsObjetivo: string
  }
  clientesNuevos: MetricaAvance
  pedidos: MetricaAvance
  montoCobrado: MetricaAvance
  conversionLeads: MetricaAvance
}

interface User {
  id: string
  name: string | null
  email: string
  role: 'admin' | 'gerente' | 'agent'
  avatarColor: string
  isActive: boolean
}

interface AdminDashboardProps {
  currentAnio: number
  currentMes: number
}

function isLastWeekOfMonth(date: Date): boolean {
  const year = date.getFullYear()
  const month = date.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  return date.getDate() >= lastDay - 6
}

export default function AdminDashboard({
  currentAnio,
  currentMes,
}: AdminDashboardProps) {
  const [anio, setAnio] = useState(currentAnio)
  const [mes, setMes] = useState(currentMes)
  const [territorioFiltro, setTerritorioFiltro] = useState('')
  const [gerenteFiltro, setGerenteFiltro] = useState('')
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [gerentes, setGerentes] = useState<GerenteUser[]>([])
  const [avances, setAvances] = useState<MetaAvance[] | null>(null)
  const [users, setUsers] = useState<User[] | null>(null)
  const [equipos, setEquipos] = useState<GerenteEquipo[]>([])
  const [rankingMode, setRankingMode] = useState<'vendedor' | 'gerente'>('vendedor')
  const [selectedVendedorId, setSelectedVendedorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load static filter options + equipos por gerente (para el toggle "Por gerente")
  useEffect(() => {
    void Promise.all([
      fetch('/api/territorios').then(async (r) => r.ok ? ((await r.json()) as { data: Territorio[] }).data : []),
      fetch('/api/users?role=gerente').then(async (r) => r.ok ? ((await r.json()) as { data: GerenteUser[] }).data : []),
      fetch('/api/admin/gerentes-equipos').then(async (r) => r.ok ? ((await r.json()) as { data: GerenteEquipo[] }).data : []),
    ]).then(([t, g, eq]) => { setTerritorios(t); setGerentes(g); setEquipos(eq) })
  }, [])

  const fetchData = useCallback(async (a: number, m: number, tid: string, gid: string) => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ anio: String(a), mes: String(m) })
      if (tid) qs.set('territorioId', tid)
      else if (gid) qs.set('gerenteId', gid)

      const [avancesRes, usersRes] = await Promise.all([
        fetch(`/api/metas/avance?${qs.toString()}`),
        fetch('/api/users'),
      ])

      if (!avancesRes.ok) throw new Error('Error al cargar avances')
      if (!usersRes.ok) throw new Error('Error al cargar usuarios')

      const avancesJson = (await avancesRes.json()) as { data: MetaAvance[] }
      const usersJson = (await usersRes.json()) as { data: User[] }

      setAvances(avancesJson.data ?? [])
      setUsers(usersJson.data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData(anio, mes, territorioFiltro, gerenteFiltro)
  }, [anio, mes, territorioFiltro, gerenteFiltro, fetchData])

  function handlePeriodoChange(a: number, m: number) {
    setAnio(a)
    setMes(m)
    setSelectedVendedorId(null)
  }

  const showCargarMetas = isLastWeekOfMonth(new Date())

  return (
    <div className="space-y-6">
      {/* Period selector + filters + action button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodoSelector anio={anio} mes={mes} onChange={handlePeriodoChange} />
          {territorios.length > 0 && (
            <select
              value={territorioFiltro}
              onChange={(e) => { setTerritorioFiltro(e.target.value); setGerenteFiltro(''); setSelectedVendedorId(null) }}
              className="text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todos los territorios</option>
              {territorios.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          )}
          {gerentes.length > 0 && (
            <select
              value={gerenteFiltro}
              onChange={(e) => { setGerenteFiltro(e.target.value); setTerritorioFiltro(''); setSelectedVendedorId(null) }}
              className="text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todos los gerentes</option>
              {gerentes.map((g) => (
                <option key={g.id} value={g.id}>{g.name ?? g.email}</option>
              ))}
            </select>
          )}
        </div>
        {showCargarMetas && (
          <Link
            href="/admin/metas"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors duration-100"
          >
            Cargar metas del próximo mes
          </Link>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-lg border border-border bg-muted/30 animate-pulse"
              />
            ))}
          </div>
          <div className="h-48 rounded-lg border border-border bg-muted/30 animate-pulse" />
        </div>
      )}

      {/* Content */}
      {!loading && !error && avances !== null && users !== null && (
        <>
          <AlertasPanel
            avances={avances}
            users={users}
            anio={anio}
            mes={mes}
          />
          <EquipoResumen avances={avances} />
          <RankingSection
            avances={avances}
            users={users}
            equipos={equipos}
            modo={rankingMode}
            onModoChange={setRankingMode}
          />
          <VendedoresGrid
            avances={avances}
            users={users}
            onSelectVendedor={setSelectedVendedorId}
          />
        </>
      )}

      {/* Vendor detail modal */}
      {selectedVendedorId !== null && (
        <VendedorModal
          vendedorId={selectedVendedorId}
          anio={anio}
          mes={mes}
          onClose={() => setSelectedVendedorId(null)}
        />
      )}
    </div>
  )
}
