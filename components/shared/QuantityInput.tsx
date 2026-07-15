'use client'

import { useState } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type ProductInfo = {
  nombre: string
  precio: string
  stockActual: number
}

type Props = {
  produto: ProductInfo
  initialQty?: number
  initialPrice?: string
  onConfirm: (qty: number, precioUnitario: string) => void
  onClose: () => void
}

const QUICK_CHIPS = [6, 12, 24, 48] as const

function formatMoney(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function QuantityInput({
  produto,
  initialQty = 1,
  initialPrice,
  onConfirm,
  onClose,
}: Props) {
  // La cantidad vive como string para permitir borrar/tipear libre;
  // qty es el valor numérico ya validado (1..stock).
  const [qtyStr, setQtyStr] = useState<string>(String(Math.max(1, initialQty)))
  const [priceStr, setPriceStr] = useState<string>(initialPrice ?? produto.precio)

  const clamp = (n: number) => Math.max(1, Math.min(produto.stockActual, n))
  const parsedQty = parseInt(qtyStr, 10)
  const qty = Number.isFinite(parsedQty) ? clamp(parsedQty) : 1

  const pricePerUnit = parseFloat(priceStr) || 0
  const subtotal = qty * pricePerUnit

  const setQtyValue = (n: number) => setQtyStr(String(clamp(n)))
  const decrement = () => setQtyValue(qty - 1)
  const increment = () => setQtyValue(qty + 1)

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-end bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full bg-card rounded-t-2xl p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold text-foreground">{produto.nombre}</span>
            <span className="text-sm text-muted-foreground">
              {formatMoney(pricePerUnit)} por unidad
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-11 h-11 -mr-2 -mt-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quantity row */}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={decrement}
            disabled={qty <= 1}
            className="w-14 h-14 rounded-full border border-border flex items-center justify-center text-foreground disabled:opacity-40 active:scale-95 transition-all"
            aria-label="Disminuir cantidad"
          >
            <Minus size={20} />
          </button>

          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={produto.stockActual}
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => setQtyStr(String(qty))}
            aria-label="Cantidad"
            className="w-28 text-center text-3xl font-bold text-foreground tabular-nums rounded-xl border border-border bg-background px-2 py-2 focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />

          <button
            onClick={increment}
            disabled={qty >= produto.stockActual}
            className="w-14 h-14 rounded-full border border-border flex items-center justify-center text-primary disabled:opacity-40 active:scale-95 transition-all"
            aria-label="Aumentar cantidad"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Quick chips */}
        <div className="flex gap-2 flex-wrap justify-center">
          {QUICK_CHIPS.map((chip) => {
            const isDisabled = chip > produto.stockActual
            const isActive = qty === chip
            return (
              <button
                key={chip}
                onClick={() => !isDisabled && setQtyValue(chip)}
                disabled={isDisabled}
                className={cn(
                  'px-4 py-2 rounded-lg border text-sm font-medium transition-colors min-h-[44px]',
                  isActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-foreground hover:bg-muted',
                  isDisabled && 'opacity-40 cursor-not-allowed'
                )}
              >
                ×{chip}
              </button>
            )
          })}
        </div>

        {/* Stock indicator */}
        <p className="text-xs text-muted-foreground text-center">
          Stock disponible: {produto.stockActual}
        </p>

        {/* Precio unitario editable */}
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="precio-unitario" className="text-sm text-muted-foreground">
            Precio unitario
          </label>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">$</span>
            <input
              id="precio-unitario"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              className="w-28 text-right text-base font-semibold rounded-lg border border-border px-2 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Subtotal */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-xl font-bold text-foreground">{formatMoney(subtotal)}</span>
        </div>

        {/* Confirm button */}
        <button
          onClick={() => {
            const parsed = parseFloat(priceStr)
            const finalPrice = Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : produto.precio
            onConfirm(qty, finalPrice)
          }}
          className="w-full py-4 bg-primary text-primary-foreground rounded-xl text-base font-semibold active:scale-[0.98] transition-transform"
        >
          Agregar al pedido
        </button>
      </div>
    </div>
  )
}
