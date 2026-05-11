'use client'

import { useState, useRef } from 'react'
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
  onConfirm: (qty: number) => void
  onClose: () => void
}

const QUICK_CHIPS = [6, 12, 24, 48] as const

function formatMoney(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function QuantityInput({
  produto,
  initialQty = 1,
  onConfirm,
  onClose,
}: Props) {
  const [qty, setQty] = useState<number>(Math.max(1, initialQty))
  const hiddenInputRef = useRef<HTMLInputElement>(null)

  const pricePerUnit = parseFloat(produto.precio)
  const subtotal = qty * pricePerUnit

  const decrement = () => setQty((q) => Math.max(1, q - 1))
  const increment = () => setQty((q) => Math.min(produto.stockActual, q + 1))

  const handleQtyTap = () => {
    hiddenInputRef.current?.focus()
  }

  const handleHiddenInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseInt(e.target.value, 10)
    if (!isNaN(parsed) && parsed >= 1) {
      setQty(Math.min(produto.stockActual, parsed))
    } else if (e.target.value === '') {
      setQty(1)
    }
  }

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

          <button
            onClick={handleQtyTap}
            className="min-w-[64px] text-center text-3xl font-bold text-foreground tabular-nums"
            aria-label="Cantidad actual, toca para editar"
          >
            {qty}
          </button>

          {/* Hidden native input for direct typing */}
          <input
            ref={hiddenInputRef}
            type="number"
            inputMode="numeric"
            min={1}
            max={produto.stockActual}
            value={qty}
            onChange={handleHiddenInput}
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />

          <button
            onClick={increment}
            disabled={qty >= produto.stockActual}
            className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all"
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
                onClick={() => !isDisabled && setQty(chip)}
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

        {/* Subtotal */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-xl font-bold text-foreground">{formatMoney(subtotal)}</span>
        </div>

        {/* Confirm button */}
        <button
          onClick={() => onConfirm(qty)}
          className="w-full py-4 bg-primary text-primary-foreground rounded-xl text-base font-semibold active:scale-[0.98] transition-transform"
        >
          Agregar al pedido
        </button>
      </div>
    </div>
  )
}
