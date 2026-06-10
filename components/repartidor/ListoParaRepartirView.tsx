'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin, Package, RefreshCw, CheckSquare, Square, Truck, AlertCircle, Send } from 'lucide-react'
import { useToast } from '@/components/shared/ToastProvider'

type PedidoListo = {
  id: string
  fecha: string
  total: string
  esReparto: boolean
  metodoEntrega: 'retiro_fabrica' | 'expreso' | null
  expresoNombre: string | null
  expresoDireccion: string | null
  cliente: {
    nombre: string
    apellido: string
    direccion: string | null
    localidad: string | null
    provincia: string | null
  }
  items: Array<{ id: string; cantidad: number; producto: { nombre: string; sku: string | null } }>
}

type ApiResponse = {
  camioneta: PedidoListo[]
  expreso: PedidoListo[]
  conUbicacion: PedidoListo[]
  sinUbicacion: PedidoListo[]
}

type SubTab = 'camioneta' | 'expreso'

function formatMoney(v: string | number) {
  return Number(v).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  })
}

function RowSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4 animate-pulse">
      <div className="mt-0.5 w-6 h-6 bg-muted rounded shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-5 w-2/3 bg-muted rounded" />
        <div className="h-4 w-4/5 bg-muted rounded" />
        <div className="h-4 w-1/3 bg-muted rounded" />
      </div>
    </div>
  )
}

function PedidoList({
  pedidos,
  selected,
  onToggle,
  onToggleAll,
}: {
  pedidos: PedidoListo[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
}) {
  const allSelected = pedidos.length > 0 && selected.size === pedidos.length

  return (
    <>
      {/* Select-all header */}
      <button
        onClick={onToggleAll}
        className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 w-full text-left active:bg-accent/50 transition-colors"
      >
        <div className="w-6 h-6 flex items-center justify-center shrink-0">
          {allSelected ? (
            <CheckSquare size={20} className="text-primary" />
          ) : (
            <Square size={20} className="text-muted-foreground" />
          )}
        </div>
        <span className="text-sm font-medium text-foreground">
          {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {selected.size}/{pedidos.length}
        </span>
      </button>

      {/* List */}
      <div className="divide-y divide-border pb-[80px]">
        {pedidos.map((pedido) => {
          const isSelected = selected.has(pedido.id)
          const addressParts = [pedido.cliente.direccion, pedido.cliente.localidad, pedido.cliente.provincia].filter(Boolean)
          const address = addressParts.join(', ')
          const itemsText = pedido.items
            .slice(0, 2)
            .map((i) => `${i.cantidad}× ${i.producto.nombre}`)
            .join(' · ')
          const extra = pedido.items.length > 2 ? ` +${pedido.items.length - 2} más` : ''
          const fechaStr = new Date(pedido.fecha).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
          })

          return (
            <button
              key={pedido.id}
              onClick={() => onToggle(pedido.id)}
              className={`flex items-start gap-3 w-full text-left px-4 py-4 transition-colors active:bg-accent/50 ${isSelected ? 'bg-primary/5' : ''}`}
            >
              <div className="mt-0.5 w-6 h-6 flex items-center justify-center shrink-0">
                {isSelected ? (
                  <CheckSquare size={22} className="text-primary" />
                ) : (
                  <Square size={22} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground leading-tight">
                    {pedido.cliente.nombre} {pedido.cliente.apellido}
                  </p>
                  <span className="text-sm font-bold text-foreground shrink-0 tabular-nums">
                    {formatMoney(pedido.total)}
                  </span>
                </div>
                {address ? (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5 line-clamp-1">
                    <MapPin size={12} className="shrink-0" />
                    {address}
                  </p>
                ) : pedido.metodoEntrega === 'expreso' && pedido.expresoNombre ? (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5 line-clamp-1">
                    <Send size={12} className="shrink-0" />
                    {pedido.expresoNombre}
                    {pedido.expresoDireccion && ` · ${pedido.expresoDireccion}`}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic mt-0.5">Sin dirección</p>
                )}
                {pedido.items.length > 0 && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1 line-clamp-1">
                    <Package size={11} className="shrink-0" />
                    {itemsText}{extra}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{fechaStr}</p>
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

function EmptyTab({ tipo }: { tipo: SubTab }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[35dvh] px-6 text-center gap-3">
      <span className="text-5xl leading-none select-none">{tipo === 'camioneta' ? '🚛' : '📦'}</span>
      <p className="font-semibold text-lg text-foreground mt-1">
        Sin pedidos de {tipo === 'camioneta' ? 'camioneta' : 'expreso'}
      </p>
      <p className="text-muted-foreground text-sm">
        No hay pedidos de {tipo === 'camioneta' ? 'camioneta' : 'expreso'} pendientes de aceptar.
      </p>
    </div>
  )
}

export default function ListoParaRepartirView({ onRutaArmada }: { onRutaArmada: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()

  const [subTab, setSubTab] = useState<SubTab>('camioneta')
  const [selectedCamioneta, setSelectedCamioneta] = useState<Set<string>>(new Set())
  const [selectedExpreso, setSelectedExpreso] = useState<Set<string>>(new Set())
  const [initializedCamioneta, setInitializedCamioneta] = useState(false)
  const [initializedExpreso, setInitializedExpreso] = useState(false)

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ApiResponse>({
    queryKey: ['repartidor-listos'],
    queryFn: async () => {
      const res = await fetch('/api/repartidor/listos')
      if (!res.ok) throw new Error('No se pudieron cargar los pedidos')
      return res.json() as Promise<ApiResponse>
    },
    refetchInterval: 60_000,
  })

  const camioneta = useMemo(() => data?.camioneta ?? [], [data])
  const expreso = useMemo(() => data?.expreso ?? [], [data])

  // Auto-select all when data first arrives
  useEffect(() => {
    if (camioneta.length > 0 && !initializedCamioneta) {
      setSelectedCamioneta(new Set(camioneta.map((p) => p.id)))
      setInitializedCamioneta(true)
    }
  }, [camioneta, initializedCamioneta])

  useEffect(() => {
    if (expreso.length > 0 && !initializedExpreso) {
      setSelectedExpreso(new Set(expreso.map((p) => p.id)))
      setInitializedExpreso(true)
    }
  }, [expreso, initializedExpreso])

  // Switch to the tab that has pedidos if current tab is empty
  useEffect(() => {
    if (!isLoading && camioneta.length === 0 && expreso.length > 0) {
      setSubTab('expreso')
    } else if (!isLoading && expreso.length === 0 && camioneta.length > 0) {
      setSubTab('camioneta')
    }
  }, [isLoading, camioneta.length, expreso.length])

  const activePedidos = subTab === 'camioneta' ? camioneta : expreso
  const activeSelected = subTab === 'camioneta' ? selectedCamioneta : selectedExpreso
  const setActiveSelected = subTab === 'camioneta' ? setSelectedCamioneta : setSelectedExpreso

  function toggle(id: string) {
    setActiveSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (activeSelected.size === activePedidos.length) {
      setActiveSelected(new Set())
    } else {
      setActiveSelected(new Set(activePedidos.map((p) => p.id)))
    }
  }

  const { mutate, isPending } = useMutation({
    mutationFn: async (pedidoIds: string[]) => {
      const res = await fetch('/api/repartidor/aceptar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoIds }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Error al aceptar pedidos')
      }
      return res.json() as Promise<{ actualizados: unknown[]; omitidos: unknown[] }>
    },
    onSuccess: (result) => {
      const n = Array.isArray(result.actualizados) ? result.actualizados.length : 0
      toast.success(`${n} ${n === 1 ? 'pedido aceptado' : 'pedidos aceptados'} — la ruta está lista`)
      void qc.invalidateQueries({ queryKey: ['repartidor-listos'] })
      void qc.invalidateQueries({ queryKey: ['repartidor-pedidos'] })
      setSelectedCamioneta(new Set())
      setSelectedExpreso(new Set())
      setInitializedCamioneta(false)
      setInitializedExpreso(false)
      onRutaArmada()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50dvh] px-6 text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle size={26} className="text-destructive" />
        </div>
        <div>
          <p className="font-bold text-lg text-foreground">Error al cargar</p>
          <p className="text-sm text-muted-foreground mt-1">No se pudieron obtener los pedidos.</p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="min-h-[52px] px-8 py-3 bg-primary text-primary-foreground rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
          Reintentar
        </button>
      </div>
    )
  }

  if (camioneta.length === 0 && expreso.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50dvh] px-6 text-center gap-3">
        <span className="text-6xl leading-none select-none">✅</span>
        <p className="font-bold text-xl text-foreground mt-2">Sin pedidos por aceptar</p>
        <p className="text-muted-foreground text-sm">
          Fábrica aún no marcó pedidos como listos para repartir.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar: Camioneta / Expreso */}
      <div className="flex border-b border-border bg-card shrink-0">
        <button
          onClick={() => setSubTab('camioneta')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            subTab === 'camioneta'
              ? 'text-amber-600 border-b-2 border-amber-500'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Truck size={15} />
          Camioneta
          {camioneta.length > 0 && (
            <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs rounded-full font-bold ${
              subTab === 'camioneta'
                ? 'bg-amber-500 text-white'
                : 'bg-muted text-muted-foreground'
            }`}>
              {camioneta.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab('expreso')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            subTab === 'expreso'
              ? 'text-blue-600 border-b-2 border-blue-500'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Send size={15} />
          Expreso
          {expreso.length > 0 && (
            <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs rounded-full font-bold ${
              subTab === 'expreso'
                ? 'bg-blue-500 text-white'
                : 'bg-muted text-muted-foreground'
            }`}>
              {expreso.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activePedidos.length === 0 ? (
          <EmptyTab tipo={subTab} />
        ) : (
          <PedidoList
            pedidos={activePedidos}
            selected={activeSelected}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />
        )}
      </div>

      {/* Sticky footer */}
      {activePedidos.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-4 py-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          <button
            onClick={() => mutate(Array.from(activeSelected))}
            disabled={activeSelected.size === 0 || isPending}
            className={`w-full min-h-[52px] rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all text-white ${
              subTab === 'camioneta' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isPending ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                {subTab === 'camioneta' ? <Truck size={18} /> : <Send size={18} />}
                Aceptar {subTab === 'camioneta' ? 'camioneta' : 'expreso'}
                {activeSelected.size > 0 && (
                  <span className="ml-1 bg-white/25 rounded-full px-2 py-0.5 text-xs font-bold">
                    {activeSelected.size}
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
