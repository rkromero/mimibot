'use client'

import { X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { PedidoImpagoCliente } from '@/lib/metas/progreso-vendedor.service'

interface Props {
  open: boolean
  onClose: () => void
  mes: string // e.g. "Mayo 2026"
  impagos: PedidoImpagoCliente[]
}

const fmtARS = (v: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v)

export default function ImpagoModal({ open, onClose, mes, impagos }: Props) {
  if (!open) return null

  const totalAdeudado = impagos.reduce((sum, c) => sum + c.montoAdeudado, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/50"
      aria-modal="true"
      role="dialog"
    >
      {/* Desktop backdrop */}
      <div
        className="absolute inset-0 hidden md:block"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — full height mobile, centered card desktop */}
      <div className="relative flex flex-col h-full w-full bg-card md:h-auto md:max-h-[80vh] md:rounded-xl md:border md:border-border md:shadow-2xl md:max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground leading-tight">
              Clientes con Pedidos Impagos
            </h2>
            <p className="text-xs text-muted-foreground">{mes}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary bar */}
        {impagos.length > 0 && (
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 shrink-0">
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
              {impagos.length} {impagos.length === 1 ? 'cliente' : 'clientes'} · Total adeudado:{' '}
              <span className="font-bold">{fmtARS(totalAdeudado)}</span>
            </p>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {impagos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                <span className="text-2xl">✓</span>
              </div>
              <p className="text-sm font-medium text-foreground">Sin pedidos impagos</p>
              <p className="text-xs text-muted-foreground mt-1">
                Todos los pedidos del mes están cobrados.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {impagos.map((cliente) => (
                <li
                  key={cliente.clienteId}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {cliente.clienteNombre}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cliente.cantidadPedidos}{' '}
                      {cliente.cantidadPedidos === 1 ? 'pedido impago' : 'pedidos impagos'}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
                      {fmtARS(cliente.montoAdeudado)}
                    </p>
                  </div>

                  {/* Link */}
                  <Link
                    href={`/crm/clientes/${cliente.clienteId}`}
                    onClick={onClose}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    aria-label={`Ver detalle de ${cliente.clienteNombre}`}
                  >
                    <ExternalLink size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer close button — mobile */}
        <div className="shrink-0 p-4 border-t border-border bg-card md:hidden">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
