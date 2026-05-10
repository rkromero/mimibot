'use client'

import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'

type Props = { territorioId: string; nombre: string; onClose: () => void; onDone: () => void }

export default function ConfirmBajaModal({ territorioId, nombre, onClose, onDone }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleBaja = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/territorios/${territorioId}`, { method: 'DELETE' })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'No se pudo dar de baja'); return }
      onDone()
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Dar de baja territorio</h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertTriangle size={15} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            ¿Dar de baja <span className="font-semibold">"{nombre}"</span>? Esta acción no se puede deshacer. El territorio no puede tener clientes asignados.
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleBaja}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-medium bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Confirmar baja'}
          </button>
        </div>
      </div>
    </div>
  )
}
