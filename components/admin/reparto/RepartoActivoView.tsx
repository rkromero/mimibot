'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Truck, Clock, RotateCcw, User } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { useToast } from '@/components/shared/ToastProvider'

type EstadoPago = 'impago' | 'parcial' | 'pagado'

type Pedido = {
  id: string
  fecha: string
  total: string
  estadoPago: EstadoPago
  metodoEntrega: 'retiro_fabrica' | 'expreso' | null
  esReparto: boolean
  aceptadoAt: string | null
  clienteNombre: string | null
  clienteApellido: string | null
  repartidorId: string | null
  repartidorNombre: string | null
}

type Repartidor = { id: string; name: string | null }

type ApiResponse = {
  data: Pedido[]
  repartidores: Repartidor[]
}

type Grupo = {
  key: string
  nombre: string
  pedidos: Pedido[]
}

function formatMoney(v: string | number) {
  return `$${parseFloat(String(v)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function metodoEntregaLabel(p: Pedido): string {
  if (p.esReparto) return 'Reparto'
  if (p.metodoEntrega === 'expreso') return 'Expreso'
  if (p.metodoEntrega === 'retiro_fabrica') return 'Retiro en fábrica'
  return '—'
}

/** Antigüedad desde que el repartidor tomó el pedido (aceptadoAt). */
function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'recién'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  const rem = min % 60
  if (h < 24) return rem ? `hace ${h} h ${rem} min` : `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
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

function PedidoRow({
  pedido,
  confirming,
  isDevolviendo,
  onAskConfirm,
  onCancelConfirm,
  onConfirm,
}: {
  pedido: Pedido
  confirming: boolean
  isDevolviendo: boolean
  onAskConfirm: () => void
  onCancelConfirm: () => void
  onConfirm: () => void
}) {
  const cliente = [pedido.clienteNombre, pedido.clienteApellido].filter(Boolean).join(' ') || 'Sin nombre'

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-foreground truncate">{cliente}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Truck size={12} />
            {metodoEntregaLabel(pedido)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {timeAgo(pedido.aceptadoAt)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="font-semibold tabular-nums text-foreground">{formatMoney(pedido.total)}</span>
        <PagoBadge estado={pedido.estadoPago} />

        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">¿Devolver?</span>
            <button
              onClick={onConfirm}
              disabled={isDevolviendo}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium disabled:opacity-50"
            >
              {isDevolviendo && <Loader2 size={12} className="animate-spin" />}
              Sí, devolver
            </button>
            <button
              onClick={onCancelConfirm}
              disabled={isDevolviendo}
              className="px-2.5 py-1 rounded-md text-xs border border-border hover:bg-accent transition-colors disabled:opacity-50"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={onAskConfirm}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium whitespace-nowrap"
          >
            <RotateCcw size={12} />
            Devolver al pool
          </button>
        )}
      </div>
    </div>
  )
}

export default function RepartoActivoView() {
  const [repartidorId, setRepartidorId] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['admin-reparto-activo', repartidorId],
    queryFn: () => {
      const q = repartidorId ? `?repartidorId=${encodeURIComponent(repartidorId)}` : ''
      return fetch(`/api/admin/reparto-activo${q}`).then((r) => {
        if (!r.ok) throw new Error('Error al cargar')
        return r.json()
      })
    },
    staleTime: 30_000,
  })

  const pedidos = useMemo(() => data?.data ?? [], [data])
  const repartidores = useMemo(() => data?.repartidores ?? [], [data])

  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Grupo>()
    for (const p of pedidos) {
      const key = p.repartidorId ?? '__sin__'
      let g = map.get(key)
      if (!g) {
        g = { key, nombre: p.repartidorNombre ?? 'Sin asignar', pedidos: [] }
        map.set(key, g)
      }
      g.pedidos.push(p)
    }
    return Array.from(map.values())
  }, [pedidos])

  const { mutate: devolver, isPending, variables: devolviendoId } = useMutation({
    mutationFn: async (pedidoId: string) => {
      const res = await fetch(`/api/admin/pedidos/${pedidoId}/liberar-reparto`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'No se pudo devolver el pedido al pool')
      }
      return res.json()
    },
    onSuccess: () => {
      setConfirmingId(null)
      toast.success('Pedido devuelto al pool')
      void queryClient.invalidateQueries({ queryKey: ['admin-reparto-activo'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const inputCls = 'px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring transition-colors'

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Reparto en curso"
        description={isLoading ? 'Cargando...' : `${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'} en reparto`}
      />

      {/* Filtro por repartidor */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <label className="text-sm text-muted-foreground whitespace-nowrap">Repartidor</label>
        <select
          value={repartidorId}
          onChange={(e) => { setRepartidorId(e.target.value); setConfirmingId(null) }}
          className={inputCls}
        >
          <option value="">Todos</option>
          {repartidores.map((r) => (
            <option key={r.id} value={r.id}>{r.name ?? r.id}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : isError ? (
        <EmptyState
          title="Error al cargar"
          description="No se pudieron obtener los pedidos en reparto."
          action={{ label: 'Reintentar', onClick: () => void refetch() }}
        />
      ) : grupos.length === 0 ? (
        <EmptyState
          title="No hay pedidos en reparto"
          description="Cuando un repartidor tome un pedido del pool, aparecerá acá."
        />
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => (
            <div key={g.key} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <User size={14} className="text-muted-foreground" />
                  {g.nombre}
                </p>
                <span className="text-xs font-medium text-muted-foreground">
                  {g.pedidos.length} {g.pedidos.length === 1 ? 'pedido' : 'pedidos'}
                </span>
              </div>
              <div className="divide-y divide-border">
                {g.pedidos.map((p) => (
                  <PedidoRow
                    key={p.id}
                    pedido={p}
                    confirming={confirmingId === p.id}
                    isDevolviendo={isPending && devolviendoId === p.id}
                    onAskConfirm={() => setConfirmingId(p.id)}
                    onCancelConfirm={() => setConfirmingId(null)}
                    onConfirm={() => devolver(p.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
