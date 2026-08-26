'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { MOTIVOS_PERDIDA, type MotivoPerdida } from '@/lib/leads/motivos-perdida'

type Props = {
  leadName: string
  onConfirm: (motivo: MotivoPerdida, detalle: string | null) => void
  onCancel: () => void
}

/**
 * Se abre al mover un lead a "Cerrado Perdido": pide el motivo (obligatorio)
 * y un detalle opcional. Sin motivo no se puede cerrar.
 */
export default function MotivoPerdidaModal({ leadName, onConfirm, onCancel }: Props) {
  const [motivo, setMotivo] = useState<MotivoPerdida | ''>('')
  const [detalle, setDetalle] = useState('')

  const inputClass = cn(
    'w-full px-3 py-2 text-sm rounded-md border',
    'border-border bg-background text-foreground placeholder:text-muted-foreground',
    'focus:outline-none focus:ring-1 focus:ring-ring',
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-semibold text-foreground">Cerrar como perdido</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {leadName}. ¿Por qué se pierde? Sirve para saber si falla el seguimiento o la oferta.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Motivo</label>
          <select
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoPerdida | '')}
            className={inputClass}
          >
            <option value="">— Elegí un motivo —</option>
            {MOTIVOS_PERDIDA.map((m) => (
              <option key={m.codigo} value={m.codigo}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            Detalle <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <textarea
            rows={2}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Ej: le pareció caro el mínimo de bobina impresa"
            className={cn(inputClass, 'resize-none')}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!motivo}
            onClick={() => motivo && onConfirm(motivo, detalle.trim() || null)}
            className={cn(
              'px-3 py-2 text-sm font-medium rounded-md',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              'disabled:opacity-50',
            )}
          >
            Cerrar lead
          </button>
        </div>
      </div>
    </div>
  )
}
