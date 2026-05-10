'use client'

import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, Map } from 'lucide-react'
import { X } from 'lucide-react'
import PeriodoSelector from '@/components/dashboard/admin/PeriodoSelector'
import EquipoResumen from '@/components/dashboard/admin/EquipoResumen'
import VendedoresGrid from '@/components/dashboard/admin/VendedoresGrid'
import RankingSection from '@/components/dashboard/admin/RankingSection'
import VendedorModal from '@/components/dashboard/admin/VendedorModal'
import type { Session } from 'next-auth'

type User = Session['user']

type MetricaAvance = { alcanzado: number; pct: number; proyeccion: number; estado: 'en_curso' | 'cumplida' | 'no_cumplida' }
type MetaAvance = {
  meta: { id: string; vendedorId: string; periodoAnio: number; periodoMes: number; clientesNuevosObjetivo: number; pedidosObjetivo: number; montoCobradoObjetivo: string; conversionLeadsObjetivo: string }
  clientesNuevos: MetricaAvance
  pedidos: MetricaAvance
  montoCobrado: MetricaAvance
  conversionLeads: MetricaAvance
}
type AgentUser = { id: string; name: string | null; email: string; role: string; avatarColor: string; isActive: boolean }
type Territorio = { id: string; nombre: string; sinAgente: boolean; agente: { id: string } | null }

interface Props {
  user: User
  currentAnio: number
  currentMes: number
}

export default function GerenteDashboard({ currentAnio, currentMes }: Props) {
  const [anio, setAnio] = useState(currentAnio)
  const [mes, setMes] = useState(currentMes)
  const [territorioFiltro, setTerritorioFiltro] = useState<string>('')
  const [avances, setAvances] = useState<MetaAvance[] | null>(null)
  const [agentes, setAgentes] = useState<AgentUser[] | null>(null)
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [selectedVendedorId, setSelectedVendedorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async (a: number, m: number, tid: string) => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ anio: String(a), mes: String(m) })
      if (tid) qs.set('territorioId', tid)

      const [avancesRes, usersRes, territoriosRes] = await Promise.all([
        fetch(`/api/metas/avance?${qs.toString()}`),
        fetch('/api/users'),
        fetch('/api/territorios'),
      ])

      if (!avancesRes.ok) throw new Error('Error al cargar avances')
      if (!usersRes.ok) throw new Error('Error al cargar usuarios')

      const avancesJson = (await avancesRes.json()) as { data: MetaAvance[] }
      const usersJson = (await usersRes.json()) as { data: AgentUser[] }
      const territoriosJson = territoriosRes.ok
        ? ((await territoriosRes.json()) as { data: Territorio[] }).data
        : []

      setAvances(avancesJson.data ?? [])
      setAgentes(usersJson.data?.filter((u) => u.role === 'agent') ?? [])
      setTerritorios(territoriosJson)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData(anio, mes, territorioFiltro)
  }, [anio, mes, territorioFiltro, fetchData])

  function handlePeriodo(a: number, m: number) {
    setAnio(a)
    setMes(m)
    setSelectedVendedorId(null)
  }

  // Compute gerente-scoped users: only agents visible in avances
  const avanceVendedorIds = new Set(avances?.map((a) => a.meta.vendedorId) ?? [])
  const visibleAgentes = agentes?.filter((u) => avanceVendedorIds.has(u.id) || true) ?? []

  // Alerts
  const territoriosSinAgente = territorios.filter((t) => t.sinAgente)
  const now = new Date()
  const isCurrentPeriod = now.getFullYear() === anio && now.getMonth() + 1 === mes
  const dayOfMonth = now.getDate()
  const bajoProgreso = isCurrentPeriod && dayOfMonth > 15
    ? (avances ?? []).filter((a) =>
        ['clientesNuevos', 'pedidos', 'montoCobrado', 'conversionLeads'].some(
          (k) => (a[k as keyof MetaAvance] as MetricaAvance).pct < 50 &&
                 (a[k as keyof MetaAvance] as MetricaAvance).estado === 'en_curso',
        ),
      )
    : []

  // Agents from avances scope that have no meta
  const agentesConMeta = new Set(avances?.map((a) => a.meta.vendedorId) ?? [])
  const agentesVisiblesIds = new Set(visibleAgentes.map((u) => u.id))
  const sinMeta = visibleAgentes.filter((u) => u.isActive && !agentesConMeta.has(u.id))

  const allAlertas = [
    ...territoriosSinAgente.map((t) => ({
      id: `sin-agente-${t.id}`,
      tipo: 'warning' as const,
      mensaje: `El territorio "${t.nombre}" no tiene agente asignado.`,
    })),
    ...sinMeta.map((u) => ({
      id: `sin-meta-${u.id}`,
      tipo: 'warning' as const,
      mensaje: `${u.name ?? u.email} no tiene meta cargada para este período.`,
    })),
    ...bajoProgreso.map((a) => {
      const u = agentes?.find((u) => u.id === a.meta.vendedorId)
      return {
        id: `bajo-${a.meta.vendedorId}`,
        tipo: 'danger' as const,
        mensaje: `${u?.name ?? u?.email ?? 'Agente'} tiene avance < 50% a mitad del mes.`,
      }
    }),
  ].filter((a) => !dismissed.has(a.id))

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <PeriodoSelector anio={anio} mes={mes} onChange={handlePeriodo} />
        {territorios.length > 0 && (
          <select
            value={territorioFiltro}
            onChange={(e) => { setTerritorioFiltro(e.target.value); setSelectedVendedorId(null) }}
            className="text-sm border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos mis territorios</option>
            {territorios.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
          <div className="h-48 rounded-lg border border-border bg-muted/30 animate-pulse" />
        </div>
      )}

      {!loading && !error && avances !== null && (
        <>
          {/* Alertas */}
          {allAlertas.length > 0 && (
            <div className="space-y-2">
              {allAlertas.map((alerta) => (
                <div key={alerta.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                  alerta.tipo === 'danger'
                    ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
                    : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300'
                }`}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span className="flex-1">{alerta.mensaje}</span>
                  <button onClick={() => setDismissed((p) => new Set([...p, alerta.id]))} className="shrink-0 p-0.5">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {avances.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
              <Map size={32} strokeWidth={1.5} />
              <p className="text-sm">No hay metas cargadas para este período en tus territorios.</p>
            </div>
          ) : (
            <>
              <EquipoResumen avances={avances} />
              <RankingSection avances={avances} users={visibleAgentes as Parameters<typeof RankingSection>[0]['users']} />
              <VendedoresGrid
                avances={avances}
                users={visibleAgentes as Parameters<typeof VendedoresGrid>[0]['users']}
                onSelectVendedor={setSelectedVendedorId}
              />
            </>
          )}
        </>
      )}

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
