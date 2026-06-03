'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ImageIcon, Loader2, AlertCircle } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { useToast } from '@/components/shared/ToastProvider'

export const dynamic = 'force-dynamic'

type EstadoPago = 'impago' | 'parcial' | 'pagado'

type Entrega = {
  id: string
  entregadoAt: string | null
  total: string
  firmaUrl: string | null
  estadoPago: EstadoPago
  pagoCobradoAt: string | null
  cobradorNombre: string | null
  clienteNombre: string | null
  clienteApellido: string | null
  clienteLocalidad: string | null
  repartidorNombre: string | null
  repartidorId: string | null
}

type Repartidor = {
  id: string
  name: string | null
}

type ApiResponse = {
  data: Entrega[]
  repartidores: Repartidor[]
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]!
}

function buildUrl(desde: string, hasta: string, repartidorId: string) {
  const params = new URLSearchParams()
  if (desde) params.set('desde', desde)
  if (hasta) params.set('hasta', hasta)
  if (repartidorId) params.set('repartidorId', repartidorId)
  const q = params.toString()
  return `/api/admin/entregas${q ? `?${q}` : ''}`
}

function formatMoney(v: string | number) {
  return `$${parseFloat(String(v)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function formatDateTime(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const PAGO_BADGE: Record<EstadoPago, { label: string; cls: string }> = {
  pagado: { label: 'Cobrado', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  parcial: { label: 'Parcial', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  impago: { label: 'Impago', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
}

function PagoBadge({ estado }: { estado: EstadoPago }) {
  const { label, cls } = PAGO_BADGE[estado]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

function FirmaModal({ firmaUrl, onClose }: { firmaUrl: string; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['firma-signed-url', firmaUrl],
    queryFn: async () => {
      const res = await fetch(`/api/attachments/url?key=${encodeURIComponent(firmaUrl)}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error('No se pudo cargar la firma')
      const json = await res.json() as { url: string }
      return json.url
    },
    staleTime: 25 * 60 * 1000,
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-5 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-accent text-muted-foreground transition-colors"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
        <h3 className="font-semibold text-base mb-4">Firma del receptor</h3>
        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-destructive text-sm">
            <AlertCircle size={20} />
            No se pudo cargar la firma
          </div>
        )}
        {data && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data} alt="Firma del receptor" className="w-full rounded-lg border border-border bg-white" />
        )}
      </div>
    </div>
  )
}

type RendicionRow = {
  repartidorId: string | null
  repartidorNombre: string
  count: number
  totalEntregado: number
  totalCobrado: number
  totalPendiente: number
}

function RendicionTable({ entregas }: { entregas: Entrega[] }) {
  const rows = useMemo<RendicionRow[]>(() => {
    const map = new Map<string, RendicionRow>()
    for (const e of entregas) {
      const key = e.repartidorId ?? '__sin_repartidor__'
      const existing = map.get(key) ?? {
        repartidorId: e.repartidorId,
        repartidorNombre: e.repartidorNombre ?? 'Sin asignar',
        count: 0,
        totalEntregado: 0,
        totalCobrado: 0,
        totalPendiente: 0,
      }
      const total = parseFloat(e.total || '0')
      existing.count++
      existing.totalEntregado += total
      if (e.estadoPago === 'pagado') existing.totalCobrado += total
      else existing.totalPendiente += total
      map.set(key, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.totalEntregado - a.totalEntregado)
  }, [entregas])

  const totales = useMemo(() => ({
    count: rows.reduce((s, r) => s + r.count, 0),
    totalEntregado: rows.reduce((s, r) => s + r.totalEntregado, 0),
    totalCobrado: rows.reduce((s, r) => s + r.totalCobrado, 0),
    totalPendiente: rows.reduce((s, r) => s + r.totalPendiente, 0),
  }), [rows])

  if (rows.length === 0) return null

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden mb-5">
      <div className="px-4 py-2.5 border-b border-border bg-muted/40">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rendición por repartidor</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Repartidor', 'Entregas', 'Entregado', 'Cobrado', 'Pendiente'].map((h, i) => (
                <th key={h} className={`px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.repartidorId ?? 'none'} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{r.repartidorNombre}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.totalEntregado)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400 font-medium">{formatMoney(r.totalCobrado)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-700 dark:text-red-400 font-medium">{formatMoney(r.totalPendiente)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-semibold">
              <td className="px-4 py-2.5">Total general</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{totales.count}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(totales.totalEntregado)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400">{formatMoney(totales.totalCobrado)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-red-700 dark:text-red-400">{formatMoney(totales.totalPendiente)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export default function AdminEntregasPage() {
  const today = toDateStr(new Date())
  const yesterday = toDateStr(new Date(Date.now() - 86_400_000))

  const [desde, setDesde] = useState(today)
  const [hasta, setHasta] = useState(today)
  const [repartidorId, setRepartidorId] = useState('')
  const [firmaModal, setFirmaModal] = useState<string | null>(null)
  const [mutatingId, setMutatingId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const toast = useToast()

  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['admin-entregas', desde, hasta, repartidorId],
    queryFn: () => fetch(buildUrl(desde, hasta, repartidorId)).then((r) => r.json()),
    staleTime: 30_000,
  })

  const entregas = useMemo(() => data?.data ?? [], [data])
  const repartidores = useMemo(() => data?.repartidores ?? [], [data])

  const { mutate: marcarPago } = useMutation({
    mutationFn: async ({ id, estadoPago }: { id: string; estadoPago: EstadoPago }) => {
      const res = await fetch(`/api/admin/entregas/${id}/pago`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estadoPago }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error al actualizar')
      }
      return res.json()
    },
    onMutate: ({ id }) => setMutatingId(id),
    onSuccess: () => {
      setMutatingId(null)
      void queryClient.invalidateQueries({ queryKey: ['admin-entregas'] })
      toast.success('Estado de cobro actualizado')
    },
    onError: (err) => {
      setMutatingId(null)
      toast.error(err instanceof Error ? err.message : 'Error al actualizar el cobro')
    },
  })

  const totalSum = useMemo(() => entregas.reduce((acc, e) => acc + parseFloat(e.total || '0'), 0), [entregas])
  const totalCobrado = useMemo(() => entregas.filter((e) => e.estadoPago === 'pagado').reduce((acc, e) => acc + parseFloat(e.total || '0'), 0), [entregas])
  const totalPendiente = useMemo(() => totalSum - totalCobrado, [totalSum, totalCobrado])

  const inputCls = 'px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring transition-colors'
  const btnBase = 'px-3 py-1.5 text-sm rounded-md border transition-colors font-medium'
  const isHoy = desde === today && hasta === today
  const isAyer = desde === yesterday && hasta === yesterday

  const TABLE_HEADERS = ['Fecha/hora', 'Cliente', 'Localidad', 'Repartidor', 'Total', 'Estado pago', 'Marcar cobro', 'Firma']

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Pedidos entregados"
        description={isLoading ? 'Cargando...' : `${entregas.length} ${entregas.length === 1 ? 'entrega' : 'entregas'}`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button
          onClick={() => { setDesde(today); setHasta(today) }}
          className={isHoy ? `${btnBase} bg-primary text-primary-foreground border-primary` : `${btnBase} border-border text-muted-foreground hover:bg-accent hover:text-foreground`}
        >
          Hoy
        </button>
        <button
          onClick={() => { setDesde(yesterday); setHasta(yesterday) }}
          className={isAyer ? `${btnBase} bg-primary text-primary-foreground border-primary` : `${btnBase} border-border text-muted-foreground hover:bg-accent hover:text-foreground`}
        >
          Ayer
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Repartidor</label>
          <select value={repartidorId} onChange={(e) => setRepartidorId(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>{r.name ?? r.id}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Entregas</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{entregas.length}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total entregado</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{formatMoney(totalSum)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Cobrado</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-0.5">{formatMoney(totalCobrado)}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Pendiente</p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-0.5">{formatMoney(totalPendiente)}</p>
          </div>
        </div>
      )}

      {/* Rendición por repartidor */}
      {!isLoading && !isError && <RendicionTable entregas={entregas} />}

      {/* Table */}
      {isError ? (
        <EmptyState
          title="Error al cargar"
          description="No se pudieron obtener las entregas."
          action={{ label: 'Reintentar', onClick: () => void refetch() }}
        />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {TABLE_HEADERS.map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${
                        i === 4 ? 'text-right' : i >= 5 ? 'text-center' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} cols={8} />)
                ) : entregas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No hay entregas para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  entregas.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDateTime(e.entregadoAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {[e.clienteNombre, e.clienteApellido].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.clienteLocalidad ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.repartidorNombre ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(e.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <PagoBadge estado={e.estadoPago} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {mutatingId === e.id ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground mx-auto" />
                        ) : (
                          <select
                            value={e.estadoPago}
                            disabled={mutatingId !== null}
                            onChange={(ev) => marcarPago({ id: e.id, estadoPago: ev.target.value as EstadoPago })}
                            className="text-xs px-2 py-1 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="impago">Impago</option>
                            <option value="parcial">Parcial</option>
                            <option value="pagado">Cobrado</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.firmaUrl ? (
                          <button
                            onClick={() => setFirmaModal(e.firmaUrl!)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <ImageIcon size={12} />
                            Ver
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {firmaModal && <FirmaModal firmaUrl={firmaModal} onClose={() => setFirmaModal(null)} />}
    </div>
  )
}
