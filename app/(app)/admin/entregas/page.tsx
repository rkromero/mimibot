'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ImageIcon, Loader2, AlertCircle, DollarSign } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { useToast } from '@/components/shared/ToastProvider'

export const dynamic = 'force-dynamic'

type EstadoPago = 'impago' | 'parcial' | 'pagado'
type MetodoPago = 'efectivo' | 'transferencia'

type Entrega = {
  id: string
  entregadoAt: string | null
  total: string
  montoPagado: string
  saldoPendiente: string
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

type Repartidor = { id: string; name: string | null }

type MetodoPagoEntry = {
  repartidorId: string | null
  metodoPago: string | null
  total: string
}

type ApiResponse = {
  data: Entrega[]
  repartidores: Repartidor[]
  metodosPago: MetodoPagoEntry[]
}

type PagoResult = {
  data: { montoPagado: string; saldoPendiente: string; estadoPago: string }
  sobrante: string
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-5 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-accent text-muted-foreground transition-colors" aria-label="Cerrar">
          <X size={16} />
        </button>
        <h3 className="font-semibold text-base mb-4">Firma del receptor</h3>
        {isLoading && <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>}
        {error && <div className="flex flex-col items-center justify-center h-40 gap-2 text-destructive text-sm"><AlertCircle size={20} />No se pudo cargar la firma</div>}
        {data && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data} alt="Firma del receptor" className="w-full rounded-lg border border-border bg-white" />
        )}
      </div>
    </div>
  )
}

function PagoModal({ entrega, onClose }: { entrega: Entrega; onClose: () => void }) {
  const saldoNum = Math.max(0, parseFloat(entrega.saldoPendiente || '0'))
  const [monto, setMonto] = useState(saldoNum.toFixed(2))
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [lastError, setLastError] = useState<string | null>(null)
  const toast = useToast()
  const queryClient = useQueryClient()

  const { mutate, isPending } = useMutation({
    mutationFn: async (): Promise<PagoResult> => {
      const res = await fetch(`/api/admin/entregas/${entrega.id}/pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: parseFloat(monto), metodoPago }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error al registrar el pago')
      }
      return res.json() as Promise<PagoResult>
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-entregas'] })
      toast.success('Pago registrado correctamente')
      if (parseFloat(result.sobrante) > 0) {
        toast.info(`Saldo a favor del cliente: ${formatMoney(result.sobrante)}`)
      }
      onClose()
    },
    onError: (err) => {
      setLastError(err instanceof Error ? err.message : 'Error al registrar el pago')
    },
  })

  const montoNum = parseFloat(monto)
  const isValid = !isNaN(montoNum) && montoNum > 0
  const clienteLabel = [entrega.clienteNombre, entrega.clienteApellido].filter(Boolean).join(' ') || 'Sin nombre'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-5 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} disabled={isPending} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-accent text-muted-foreground transition-colors" aria-label="Cerrar">
          <X size={16} />
        </button>
        <h3 className="font-semibold text-base mb-0.5">Registrar pago</h3>
        <p className="text-sm text-muted-foreground mb-4">{clienteLabel} · Saldo: {formatMoney(entrega.saldoPendiente)}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Monto</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={monto}
              onChange={(e) => { setMonto(e.target.value); setLastError(null) }}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {isValid && montoNum > saldoNum && saldoNum > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                El monto supera el saldo — el sobrante quedará como crédito del cliente.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Método de pago</label>
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>

          {lastError && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{lastError}</p>
                <button
                  onClick={() => { setLastError(null); mutate() }}
                  className="text-xs underline mt-1 hover:no-underline"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => mutate()}
            disabled={!isValid || isPending}
            className="flex-1 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            {isPending ? 'Registrando...' : 'Confirmar pago'}
          </button>
        </div>
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
  efectivo: number
  transferencia: number
}

function RendicionTable({ entregas, metodosPago }: { entregas: Entrega[]; metodosPago: MetodoPagoEntry[] }) {
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
        efectivo: 0,
        transferencia: 0,
      }
      existing.count++
      existing.totalEntregado += parseFloat(e.total || '0')
      existing.totalCobrado += parseFloat(e.montoPagado || '0')
      existing.totalPendiente += parseFloat(e.saldoPendiente || '0')
      map.set(key, existing)
    }

    for (const m of metodosPago) {
      const key = m.repartidorId ?? '__sin_repartidor__'
      const row = map.get(key)
      if (!row) continue
      const t = parseFloat(m.total || '0')
      if (m.metodoPago === 'efectivo') row.efectivo += t
      else if (m.metodoPago === 'transferencia') row.transferencia += t
    }

    return Array.from(map.values()).sort((a, b) => b.totalEntregado - a.totalEntregado)
  }, [entregas, metodosPago])

  const totales = useMemo(() => ({
    count: rows.reduce((s, r) => s + r.count, 0),
    totalEntregado: rows.reduce((s, r) => s + r.totalEntregado, 0),
    totalCobrado: rows.reduce((s, r) => s + r.totalCobrado, 0),
    totalPendiente: rows.reduce((s, r) => s + r.totalPendiente, 0),
    efectivo: rows.reduce((s, r) => s + r.efectivo, 0),
    transferencia: rows.reduce((s, r) => s + r.transferencia, 0),
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
              {['Repartidor', 'Entregas', 'Entregado', 'Cobrado', 'Pendiente', 'Efectivo ↑', 'Transferencia ↑'].map((h, i) => (
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
                <td className="px-4 py-2.5 text-right tabular-nums text-blue-700 dark:text-blue-400 font-medium">{formatMoney(r.efectivo)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-purple-700 dark:text-purple-400 font-medium">{formatMoney(r.transferencia)}</td>
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
              <td className="px-4 py-2.5 text-right tabular-nums text-blue-700 dark:text-blue-400">{formatMoney(totales.efectivo)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-purple-700 dark:text-purple-400">{formatMoney(totales.transferencia)}</td>
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
  const [pagoEntrega, setPagoEntrega] = useState<Entrega | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['admin-entregas', desde, hasta, repartidorId],
    queryFn: () => fetch(buildUrl(desde, hasta, repartidorId)).then((r) => r.json()),
    staleTime: 30_000,
  })

  const entregas = useMemo(() => data?.data ?? [], [data])
  const repartidores = useMemo(() => data?.repartidores ?? [], [data])
  const metodosPago = useMemo(() => data?.metodosPago ?? [], [data])

  const totalSum = useMemo(() => entregas.reduce((acc, e) => acc + parseFloat(e.total || '0'), 0), [entregas])
  const totalCobrado = useMemo(() => entregas.reduce((acc, e) => acc + parseFloat(e.montoPagado || '0'), 0), [entregas])
  const totalPendiente = useMemo(() => entregas.reduce((acc, e) => acc + parseFloat(e.saldoPendiente || '0'), 0), [entregas])

  const inputCls = 'px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring transition-colors'
  const btnBase = 'px-3 py-1.5 text-sm rounded-md border transition-colors font-medium'
  const isHoy = desde === today && hasta === today
  const isAyer = desde === yesterday && hasta === yesterday

  const TABLE_HEADERS = ['Fecha/hora', 'Cliente', 'Localidad', 'Repartidor', 'Total', 'Saldo', 'Estado', 'Cobro', 'Firma']

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
      {!isLoading && !isError && <RendicionTable entregas={entregas} metodosPago={metodosPago} />}

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
                        i === 4 || i === 5 ? 'text-right' : i >= 6 ? 'text-center' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} cols={9} />)
                ) : entregas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No hay entregas para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  entregas.map((e) => {
                    const saldo = parseFloat(e.saldoPendiente || '0')
                    return (
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
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${saldo > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                          {formatMoney(e.saldoPendiente)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <PagoBadge estado={e.estadoPago} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {saldo > 0 ? (
                            <button
                              onClick={() => setPagoEntrega(e)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                            >
                              <DollarSign size={11} />
                              Cobrar
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
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
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {firmaModal && <FirmaModal firmaUrl={firmaModal} onClose={() => setFirmaModal(null)} />}
      {pagoEntrega && <PagoModal entrega={pagoEntrega} onClose={() => setPagoEntrega(null)} />}
    </div>
  )
}
