'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from 'next-auth/react'

type AgentOption = { id: string; name: string | null }

type Props = {
  clienteId: string
  agents: AgentOption[]
  defaultAsignadoA?: string | null
  onClose: () => void
  onCreated: () => void
}

const TIPOS = [
  { value: 'visita', label: 'Visita' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'email', label: 'Email' },
  { value: 'tarea', label: 'Tarea' },
  { value: 'nota', label: 'Nota' },
] as const

const inputClass = cn(
  'w-full px-3 py-1.5 text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

export default function ActividadModal({ clienteId, agents, defaultAsignadoA, onClose, onCreated }: Props) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const [tipo, setTipo] = useState<string>('tarea')
  const [titulo, setTitulo] = useState('')
  const [notas, setNotas] = useState('')
  const [fechaProgramada, setFechaProgramada] = useState('')
  const [asignadoA, setAsignadoA] = useState(defaultAsignadoA ?? '')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) { setError('El título es requerido'); return }
    setError(null)
    setIsPending(true)
    try {
      const res = await fetch(`/api/clientes/${clienteId}/actividades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          titulo: titulo.trim(),
          notas: notas.trim() || null,
          fechaProgramada: fechaProgramada ? new Date(fechaProgramada).toISOString() : null,
          asignadoA: asignadoA || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error: string }
        setError(d.error ?? 'Error al guardar')
        return
      }
      onCreated()
      onClose()
    } catch {
      setError('Error de conexión')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <button className="absolute inset-0" onClick={onClose} aria-label="Cerrar" />
      <div className="relative bg-card border border-border rounded-lg p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Nueva Actividad</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Tipo */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Tipo</label>
            <div className="flex gap-1.5 flex-wrap">
              {TIPOS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    tipo === t.value
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Título *</label>
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Visita para presentar propuesta"
              className={inputClass}
            />
          </div>

          {/* Fecha programada */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Fecha programada</label>
            <input
              type="datetime-local"
              value={fechaProgramada}
              onChange={(e) => setFechaProgramada(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Asignado a (solo admin) */}
          {isAdmin && agents.length > 0 && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Asignar a</label>
              <select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} className={inputClass}>
                <option value="">Sin asignar</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name ?? a.id}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Notas</label>
            <textarea
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalles adicionales..."
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
              {isPending ? 'Guardando...' : 'Crear Actividad'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
