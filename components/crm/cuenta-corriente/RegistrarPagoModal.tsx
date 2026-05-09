'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'

type Props = {
  clienteId: string
  onClose: () => void
  onSuccess: (result: PagoResult) => void
}

type PagoResult = {
  aplicaciones: Array<{
    pedidoId: string
    montoAplicado: string
  }>
  sobrante: string
}

const inputClass = cn(
  'w-full px-3 py-1.5 text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

export default function RegistrarPagoModal({ clienteId, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    monto: '',
    fecha: todayStr,
    descripcion: '',
  })

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const monto = parseFloat(form.monto)
    if (!form.monto || isNaN(monto) || monto <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }

    setIsPending(true)
    try {
      const res = await fetch(`/api/clientes/${clienteId}/cuenta-corriente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto,
          fecha: form.fecha,
          descripcion: form.descripcion.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al registrar el pago')
        return
      }

      const json = await res.json() as { data: PagoResult }

      void queryClient.invalidateQueries({ queryKey: ['clientes', clienteId, 'cc'] })
      void queryClient.invalidateQueries({ queryKey: ['clientes', clienteId, 'pedidos'] })
      void queryClient.invalidateQueries({ queryKey: ['clientes'] })

      onSuccess(json.data)
    } catch {
      setError('Error de conexión')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <button className="absolute inset-0" onClick={onClose} aria-label="Cerrar" />
      <div className="relative bg-card border border-border rounded-lg p-6 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Registrar Pago</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Monto *</label>
              <input
                autoFocus
                type="number"
                min="0.01"
                step="0.01"
                value={form.monto}
                onChange={(e) => set('monto', e.target.value)}
                placeholder="0.00"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Fecha *</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => set('fecha', e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Descripción (opcional)</label>
            <textarea
              rows={2}
              value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              placeholder="Ej: Pago con transferencia bancaria..."
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Registrando...' : 'Registrar Pago'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
