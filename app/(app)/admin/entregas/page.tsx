'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ImageIcon, Loader2, AlertCircle } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

export const dynamic = 'force-dynamic'

type Entrega = {
  id: string
  entregadoAt: string | null
  total: string
  firmaUrl: string | null
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

function SkeletonRow() {
  return (
    <tr>
      {[0, 1, 2, 3, 4, 5].map((i) => (
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
          <img
            src={data}
            alt="Firma del receptor"
            className="w-full rounded-lg border border-border bg-white"
          />
        )}
      </div>
    </div>
  )
}

export default function AdminEntregasPage() {
  const today = new Date().toISOString().split('T')[0]!
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!

  const [desde, setDesde] = useState(thirtyDaysAgo)
  const [hasta, setHasta] = useState(today)
  const [repartidorId, setRepartidorId] = useState('')
  const [firmaModal, setFirmaModal] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['admin-entregas', desde, hasta, repartidorId],
    queryFn: () => fetch(buildUrl(desde, hasta, repartidorId)).then((r) => r.json()),
    staleTime: 30_000,
  })

  const entregas = useMemo(() => data?.data ?? [], [data])
  const repartidores = useMemo(() => data?.repartidores ?? [], [data])

  const totalSum = useMemo(
    () => entregas.reduce((acc, e) => acc + parseFloat(e.total || '0'), 0),
    [entregas],
  )

  const inputCls = 'px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring transition-colors'

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Historial de entregas"
        description={isLoading ? 'Cargando...' : `${entregas.length} ${entregas.length === 1 ? 'entrega' : 'entregas'}`}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
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
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total de entregas</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{entregas.length}</p>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Suma de totales</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{formatMoney(totalSum)}</p>
          </div>
        </div>
      )}

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
                  {['Fecha/hora', 'Cliente', 'Localidad', 'Repartidor', 'Total', 'Firma'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${i === 4 ? 'text-right' : i === 5 ? 'text-center' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)
                ) : entregas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
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
