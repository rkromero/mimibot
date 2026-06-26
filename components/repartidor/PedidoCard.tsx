'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Phone, MessageCircle, Navigation, CheckCircle, Package } from 'lucide-react'
import EntregarSheet from './EntregarSheet'
import { construirMapsUrl } from '@/lib/repartidor/route-ui'
import { formatFechaInstanteAR } from '@/lib/dates'

type Item = {
  id: string
  cantidad: number
  producto: { nombre: string; sku: string }
}

type Cliente = {
  id: string
  nombre: string
  apellido: string
  direccion: string | null
  localidad: string | null
  provincia: string | null
  telefono: string | null
  lat: number | null
  lng: number | null
}

export type Pedido = {
  id: string
  fecha: string
  total: string
  saldoPendiente: string
  metodoEntrega: string | null
  ordenRuta: number | null
  cliente: Cliente
  items: Item[]
}

export default function PedidoCard({ id, fecha, total, saldoPendiente, metodoEntrega, ordenRuta, cliente, items }: Pedido) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isDismissing, setIsDismissing] = useState(false)
  const [isOpeningInbox, setIsOpeningInbox] = useState(false)
  const qc = useQueryClient()

  async function handleOpenInbox() {
    setIsOpeningInbox(true)
    try {
      const res = await fetch(`/api/clientes/${cliente.id}/conversacion`, { method: 'POST' })
      if (!res.ok) return
      const json = await res.json() as { data: { conversationId: string } }
      router.push(`/inbox?conversation=${json.data.conversationId}`)
    } catch {
      // ignore
    } finally {
      setIsOpeningInbox(false)
    }
  }

  function dismissCard() {
    setIsDismissing(true)
    setTimeout(() => {
      void qc.invalidateQueries({ queryKey: ['repartidor-pedidos'] })
    }, 350)
  }

  function handleNavegar() {
    window.open(construirMapsUrl(cliente), '_blank', 'noopener,noreferrer')
  }

  const addressParts = [cliente.direccion, cliente.localidad, cliente.provincia].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  const cleanPhone = cliente.telefono?.replace(/\D/g, '') ?? ''

  const itemsText = items
    .slice(0, 3)
    .map((i) => `${i.cantidad}× ${i.producto.nombre}`)
    .join(' · ')
  const extraCount = items.length > 3 ? ` +${items.length - 3} más` : ''

  const fechaStr = formatFechaInstanteAR(fecha, true)
  const totalStr = Number(total).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  })

  return (
    <>
      <article className={`bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm transition-all duration-300 ease-out ${isDismissing ? 'opacity-0 -translate-y-2 scale-95 pointer-events-none' : 'opacity-100 translate-y-0 scale-100'}`}>
        {/* Header: badge de parada + cliente + total */}
        <div className="flex items-start gap-3">
          {/* Badge nº de parada (orden_ruta) */}
          <span
            className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground font-bold text-base leading-none tabular-nums"
            aria-label={ordenRuta != null ? `Parada número ${ordenRuta}` : 'Sin orden de ruta'}
          >
            {ordenRuta ?? '–'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-lg leading-tight text-foreground truncate">
              {cliente.nombre} {cliente.apellido}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5 leading-snug line-clamp-2">
              {fullAddress || <span className="italic">Sin dirección</span>}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-foreground text-lg leading-tight">{totalStr}</p>
            <p className="text-xs text-muted-foreground">{fechaStr}</p>
          </div>
        </div>

        {/* Items */}
        {items.length > 0 && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Package size={13} className="shrink-0" />
            <span className="truncate">{itemsText}{extraCount}</span>
          </p>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-4 gap-2 pt-0.5">
          {/* Llamar */}
          {cliente.telefono ? (
            <a
              href={`tel:${cliente.telefono}`}
              className="flex flex-col items-center justify-center gap-1 min-h-[52px] bg-secondary hover:bg-secondary/80 active:bg-secondary/60 rounded-xl transition-colors text-secondary-foreground"
              aria-label={`Llamar a ${cliente.nombre}`}
            >
              <Phone size={18} strokeWidth={2} />
              <span className="text-[11px] font-medium">Llamar</span>
            </a>
          ) : (
            <span className="flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl bg-muted/40 opacity-40 cursor-not-allowed text-muted-foreground">
              <Phone size={18} />
              <span className="text-[11px] font-medium">Llamar</span>
            </span>
          )}

          {/* WhatsApp */}
          {cleanPhone ? (
            <button
              type="button"
              onClick={() => void handleOpenInbox()}
              disabled={isOpeningInbox}
              className="flex flex-col items-center justify-center gap-1 min-h-[52px] bg-green-100 hover:bg-green-200 active:bg-green-300 dark:bg-green-900/30 dark:hover:bg-green-900/50 rounded-xl transition-colors text-green-700 dark:text-green-400 disabled:opacity-60"
              aria-label={`Escribir por WhatsApp a ${cliente.nombre}`}
            >
              <MessageCircle size={18} strokeWidth={2} />
              <span className="text-[11px] font-medium">WhatsApp</span>
            </button>
          ) : (
            <span className="flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl bg-muted/40 opacity-40 cursor-not-allowed text-muted-foreground">
              <MessageCircle size={18} />
              <span className="text-[11px] font-medium">WhatsApp</span>
            </span>
          )}

          {/* Navegar (Google Maps) */}
          <button
            type="button"
            onClick={handleNavegar}
            className="flex flex-col items-center justify-center gap-1 min-h-[52px] bg-blue-100 hover:bg-blue-200 active:bg-blue-300 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-xl transition-colors text-blue-700 dark:text-blue-400"
            aria-label="Navegar con Google Maps"
          >
            <Navigation size={18} strokeWidth={2} />
            <span className="text-[11px] font-medium">Navegar</span>
          </button>

          {/* Entregar */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex flex-col items-center justify-center gap-1 min-h-[52px] bg-primary hover:bg-primary/90 active:bg-primary/80 rounded-xl transition-colors text-primary-foreground"
            aria-label="Entregar y cobrar"
          >
            <CheckCircle size={18} strokeWidth={2} />
            <span className="text-[11px] font-medium">Entregar</span>
          </button>
        </div>
      </article>

      <EntregarSheet
        pedidoId={id}
        clienteNombre={`${cliente.nombre} ${cliente.apellido}`}
        saldoPendiente={saldoPendiente}
        metodoEntrega={metodoEntrega}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onDelivered={dismissCard}
      />
    </>
  )
}
