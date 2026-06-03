'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Phone, MessageCircle, MapPin, CheckCircle, Package } from 'lucide-react'
import EntregarSheet from './EntregarSheet'

type Item = {
  id: string
  cantidad: number
  producto: { nombre: string; sku: string }
}

type Cliente = {
  nombre: string
  apellido: string
  direccion: string | null
  localidad: string | null
  provincia: string | null
  telefono: string | null
}

export type Pedido = {
  id: string
  fecha: string
  total: string
  cliente: Cliente
  items: Item[]
}

export default function PedidoCard({ id, fecha, total, cliente, items }: Pedido) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isDismissing, setIsDismissing] = useState(false)
  const qc = useQueryClient()

  function handleDelivered() {
    setIsDismissing(true)
    // Delay invalidation so the fade-out animation plays first
    setTimeout(() => {
      void qc.invalidateQueries({ queryKey: ['repartidor-pedidos'] })
    }, 350)
  }

  const addressParts = [cliente.direccion, cliente.localidad, cliente.provincia].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  const destination = fullAddress || `${cliente.nombre} ${cliente.apellido}`
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
  const cleanPhone = cliente.telefono?.replace(/\D/g, '') ?? ''

  const itemsText = items
    .slice(0, 3)
    .map((i) => `${i.cantidad}× ${i.producto.nombre}`)
    .join(' · ')
  const extraCount = items.length > 3 ? ` +${items.length - 3} más` : ''

  const fechaStr = new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  const totalStr = Number(total).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  })

  return (
    <>
      <article className={`bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm transition-all duration-300 ease-out ${isDismissing ? 'opacity-0 -translate-y-2 scale-95 pointer-events-none' : 'opacity-100 translate-y-0 scale-100'}`}>
        {/* Header: cliente + total */}
        <div className="flex items-start justify-between gap-3">
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
            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-1 min-h-[52px] bg-green-100 hover:bg-green-200 active:bg-green-300 dark:bg-green-900/30 dark:hover:bg-green-900/50 rounded-xl transition-colors text-green-700 dark:text-green-400"
              aria-label={`Escribir por WhatsApp a ${cliente.nombre}`}
            >
              <MessageCircle size={18} strokeWidth={2} />
              <span className="text-[11px] font-medium">WhatsApp</span>
            </a>
          ) : (
            <span className="flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl bg-muted/40 opacity-40 cursor-not-allowed text-muted-foreground">
              <MessageCircle size={18} />
              <span className="text-[11px] font-medium">WhatsApp</span>
            </span>
          )}

          {/* Mapa */}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-1 min-h-[52px] bg-blue-100 hover:bg-blue-200 active:bg-blue-300 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-xl transition-colors text-blue-700 dark:text-blue-400"
            aria-label="Abrir en Google Maps"
          >
            <MapPin size={18} strokeWidth={2} />
            <span className="text-[11px] font-medium">Mapa</span>
          </a>

          {/* Entregar */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex flex-col items-center justify-center gap-1 min-h-[52px] bg-primary hover:bg-primary/90 active:bg-primary/80 rounded-xl transition-colors text-primary-foreground"
            aria-label="Marcar como entregado"
          >
            <CheckCircle size={18} strokeWidth={2} />
            <span className="text-[11px] font-medium">Entregar</span>
          </button>
        </div>
      </article>

      <EntregarSheet
        pedidoId={id}
        clienteNombre={`${cliente.nombre} ${cliente.apellido}`}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onDelivered={handleDelivered}
      />
    </>
  )
}
