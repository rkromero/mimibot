'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Send, Loader2, RefreshCw, AlertCircle, CheckCircle2, Package,
  MapPin, Phone, MessageCircle,
} from 'lucide-react'
import EntregarSheet from '@/components/repartidor/EntregarSheet'
import type { Pedido } from '@/components/repartidor/PedidoCard'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpresoPendiente = {
  id: string
  fecha: string
  total: string
  expresoNombre: string | null
  expresoDireccion: string | null
  metodoEntrega: string | null
  cliente: {
    id: string
    nombre: string
    apellido: string
    direccion: string | null
    localidad: string | null
    provincia: string | null
  }
  items: Array<{
    id: string
    cantidad: number
    producto: { id: string; nombre: string; sku: string }
  }>
}

type ListosResponse = {
  expreso: ExpresoPendiente[]
}

type PedidosResponse = {
  data: Pedido[]
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchListos(): Promise<ListosResponse> {
  const res = await fetch('/api/repartidor/listos')
  if (!res.ok) throw new Error('No se pudieron cargar los pedidos')
  return res.json() as Promise<ListosResponse>
}

async function fetchRuta(): Promise<PedidosResponse> {
  const res = await fetch('/api/repartidor/pedidos')
  if (!res.ok) throw new Error('No se pudieron cargar los pedidos en ruta')
  return res.json() as Promise<PedidosResponse>
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExpresoPendienteCard({
  pedido,
  onAceptar,
  loading,
}: {
  pedido: ExpresoPendiente
  onAceptar: (id: string) => void
  loading: boolean
}) {
  const nombreDestino = pedido.expresoNombre ?? `${pedido.cliente.nombre} ${pedido.cliente.apellido}`
  const direccion = pedido.expresoDireccion
    ?? [pedido.cliente.direccion, pedido.cliente.localidad, pedido.cliente.provincia]
        .filter(Boolean).join(', ')
  const itemsText = pedido.items.slice(0, 2).map((i) => `${i.cantidad}× ${i.producto.nombre}`).join(' · ')
  const extraCount = pedido.items.length > 2 ? ` +${pedido.items.length - 2}` : ''
  const totalStr = Number(pedido.total).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base text-foreground truncate">
            {[pedido.cliente.nombre, pedido.cliente.apellido].filter(Boolean).join(' ')}
          </p>
          <div className="flex items-center gap-1.5 mb-0.5">
            <Send size={14} className="text-blue-500 shrink-0" />
            <p className="text-sm text-muted-foreground truncate">{nombreDestino}</p>
          </div>
          {direccion && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{direccion}</span>
            </p>
          )}
        </div>
        <p className="font-bold text-foreground shrink-0">{totalStr}</p>
      </div>

      {pedido.items.length > 0 && (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Package size={13} className="shrink-0" />
          <span className="truncate">{itemsText}{extraCount}</span>
        </p>
      )}

      <button
        type="button"
        onClick={() => onAceptar(pedido.id)}
        disabled={loading}
        className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.98]"
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Aceptando...</>
          : <><CheckCircle2 size={16} /> Aceptar expreso</>
        }
      </button>
    </div>
  )
}

function RutaExpresoPedidoCard({ pedido, onDelivered }: { pedido: Pedido; onDelivered: () => void }) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isDismissing, setIsDismissing] = useState(false)

  async function handleOpenInbox() {
    try {
      const res = await fetch(`/api/clientes/${pedido.cliente.id}/conversacion`, { method: 'POST' })
      if (!res.ok) return
      const json = await res.json() as { data: { conversationId: string } }
      router.push(`/inbox?conversation=${json.data.conversationId}`)
    } catch { /* ignore */ }
  }

  function dismissCard() {
    setIsDismissing(true)
    setTimeout(() => onDelivered(), 350)
  }

  const nombreDestino = `${pedido.cliente.nombre} ${pedido.cliente.apellido}`
  const direccion = [pedido.cliente.direccion, pedido.cliente.localidad, pedido.cliente.provincia]
    .filter(Boolean).join(', ')
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(direccion || nombreDestino)}`
  const itemsText = pedido.items.slice(0, 2).map((i) => `${i.cantidad}× ${i.producto.nombre}`).join(' · ')
  const extraCount = pedido.items.length > 2 ? ` +${pedido.items.length - 2}` : ''
  const totalStr = Number(pedido.total).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  const cleanPhone = pedido.cliente.telefono?.replace(/\D/g, '') ?? ''

  return (
    <>
      <article className={`bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm transition-all duration-300 ease-out ${isDismissing ? 'opacity-0 -translate-y-2 scale-95 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Send size={14} className="text-blue-500 shrink-0" />
              <p className="font-bold text-base text-foreground truncate">{nombreDestino}</p>
            </div>
            {direccion && (
              <p className="text-sm text-muted-foreground line-clamp-1">{direccion}</p>
            )}
          </div>
          <p className="font-bold text-foreground shrink-0">{totalStr}</p>
        </div>

        {pedido.items.length > 0 && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Package size={13} className="shrink-0" />
            <span className="truncate">{itemsText}{extraCount}</span>
          </p>
        )}

        <div className="grid grid-cols-4 gap-2">
          {pedido.cliente.telefono ? (
            <a href={`tel:${pedido.cliente.telefono}`} className="flex flex-col items-center justify-center gap-1 min-h-[48px] bg-secondary hover:bg-secondary/80 active:bg-secondary/60 rounded-xl transition-colors text-secondary-foreground">
              <Phone size={17} strokeWidth={2} />
              <span className="text-[11px] font-medium">Llamar</span>
            </a>
          ) : (
            <span className="flex flex-col items-center justify-center gap-1 min-h-[48px] rounded-xl bg-muted/40 opacity-40 cursor-not-allowed text-muted-foreground">
              <Phone size={17} />
              <span className="text-[11px] font-medium">Llamar</span>
            </span>
          )}

          {cleanPhone ? (
            <button type="button" onClick={() => void handleOpenInbox()} className="flex flex-col items-center justify-center gap-1 min-h-[48px] bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 rounded-xl transition-colors text-green-700 dark:text-green-400">
              <MessageCircle size={17} strokeWidth={2} />
              <span className="text-[11px] font-medium">WhatsApp</span>
            </button>
          ) : (
            <span className="flex flex-col items-center justify-center gap-1 min-h-[48px] rounded-xl bg-muted/40 opacity-40 cursor-not-allowed text-muted-foreground">
              <MessageCircle size={17} />
              <span className="text-[11px] font-medium">WhatsApp</span>
            </span>
          )}

          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center gap-1 min-h-[48px] bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-xl transition-colors text-blue-700 dark:text-blue-400">
            <MapPin size={17} strokeWidth={2} />
            <span className="text-[11px] font-medium">Mapa</span>
          </a>

          <button type="button" onClick={() => setSheetOpen(true)} className="flex flex-col items-center justify-center gap-1 min-h-[48px] bg-primary hover:bg-primary/90 active:bg-primary/80 rounded-xl transition-colors text-primary-foreground">
            <CheckCircle2 size={17} strokeWidth={2} />
            <span className="text-[11px] font-medium">Entregar</span>
          </button>
        </div>
      </article>

      <EntregarSheet
        pedidoId={pedido.id}
        clienteNombre={nombreDestino}
        saldoPendiente={pedido.saldoPendiente}
        metodoEntrega="expreso"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onDelivered={dismissCard}
      />
    </>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
      <div className="w-14 h-14 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'aceptar' | 'ruta'

export default function FabricaEntregasPage() {
  const [tab, setTab] = useState<Tab>('aceptar')
  const [aceptandoId, setAceptandoId] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: listosData, isLoading: listosLoading, error: listosError, refetch: listosRefetch } = useQuery({
    queryKey: ['fabrica-listos'],
    queryFn: fetchListos,
    refetchInterval: 30_000,
  })

  const { data: rutaData, isLoading: rutaLoading, error: rutaError, refetch: rutaRefetch } = useQuery({
    queryKey: ['fabrica-ruta'],
    queryFn: fetchRuta,
    refetchInterval: 30_000,
  })

  const expresosPendientes = listosData?.expreso ?? []
  const rutaExpreso = (rutaData?.data ?? []).filter((p) => p.metodoEntrega === 'expreso')

  const { mutate: aceptar } = useMutation({
    mutationFn: async (id: string) => {
      setAceptandoId(id)
      const res = await fetch('/api/repartidor/aceptar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoIds: [id] }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'Error al aceptar')
      }
    },
    onSettled: () => setAceptandoId(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fabrica-listos'] })
      void qc.invalidateQueries({ queryKey: ['fabrica-ruta'] })
      // También invalida la vista del repartidor para que desaparezca de su lista
      void qc.invalidateQueries({ queryKey: ['repartidor-listos'] })
      setTab('ruta')
    },
  })

  const isError = listosError ?? rutaError
  const isLoading = listosLoading || rutaLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60dvh]">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center gap-4">
        <AlertCircle size={32} className="text-destructive" />
        <p className="font-bold text-foreground">Error al cargar</p>
        <button
          onClick={() => { void listosRefetch(); void rutaRefetch() }}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium flex items-center gap-2"
        >
          <RefreshCw size={15} />
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-0 shrink-0">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Send size={20} className="text-blue-500" />
          Entregas Expreso
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-background mt-3 shrink-0">
        <button
          onClick={() => setTab('aceptar')}
          className={`relative flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${tab === 'aceptar' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Para aceptar
          {expresosPendientes.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs rounded-full bg-blue-600 text-white font-bold">
              {expresosPendientes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('ruta')}
          className={`relative flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${tab === 'ruta' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Mi ruta
          {rutaExpreso.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-xs rounded-full bg-blue-600 text-white font-bold">
              {rutaExpreso.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'aceptar' && (
          <div className="p-4 space-y-3">
            {expresosPendientes.length === 0
              ? <EmptyState icon={<Send size={24} />} text="No hay expresos pendientes de aceptar" />
              : expresosPendientes.map((p) => (
                  <ExpresoPendienteCard
                    key={p.id}
                    pedido={p}
                    onAceptar={(id) => aceptar(id)}
                    loading={aceptandoId === p.id}
                  />
                ))
            }
          </div>
        )}

        {tab === 'ruta' && (
          <div className="p-4 space-y-3">
            {rutaExpreso.length === 0
              ? <EmptyState icon={<CheckCircle2 size={24} />} text="No tenés expresos en tu ruta" />
              : rutaExpreso.map((p) => (
                  <RutaExpresoPedidoCard
                    key={p.id}
                    pedido={p}
                    onDelivered={() => {
                      void qc.invalidateQueries({ queryKey: ['fabrica-ruta'] })
                    }}
                  />
                ))
            }
          </div>
        )}
      </div>
    </div>
  )
}
