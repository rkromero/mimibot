'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PipelineStage, User } from '@/types/db'

type Props = {
  stages: PipelineStage[]
  onClose: () => void
}

type AgentOption = Pick<User, 'id' | 'name' | 'avatarColor'>

export default function CreateLeadModal({ stages, onClose }: Props) {
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    stageId: stages[0]?.id ?? '',
    assignedTo: '',
    budget: '',
    productInterest: '',
    notes: '',
    source: 'manual' as const,
  })

  const { data: agents = [] } = useQuery<AgentOption[]>({
    queryKey: ['agents-list'],
    queryFn: async () => {
      const res = await fetch('/api/users?role=agent&active=true')
      if (!res.ok) return []
      const json = await res.json() as { data: AgentOption[] }
      return json.data
    },
    staleTime: 60_000,
  })

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.contactName.trim()) {
      setError('El nombre del contacto es requerido')
      return
    }
    if (!form.stageId) {
      setError('Seleccioná una etapa')
      return
    }

    startTransition(async () => {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: form.contactName.trim(),
          contactPhone: form.contactPhone.trim() || undefined,
          contactEmail: form.contactEmail.trim() || undefined,
          stageId: form.stageId,
          assignedTo: form.assignedTo || undefined,
          budget: form.budget ? Number(form.budget) : undefined,
          productInterest: form.productInterest.trim() || undefined,
          notes: form.notes.trim() || undefined,
          source: form.source,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(typeof data.error === 'string' ? data.error : 'Error al crear lead')
        return
      }

      void queryClient.invalidateQueries({ queryKey: ['leads'] })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        className="absolute inset-0 bg-black/20 dark:bg-black/40"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="relative z-10 w-full max-w-md bg-background border border-border rounded-lg shadow-lg">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Nuevo lead</h2>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {/* Contacto */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
            <input
              autoFocus
              required
              value={form.contactName}
              onChange={(e) => set('contactName', e.target.value)}
              placeholder="Nombre del contacto"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => set('contactPhone', e.target.value)}
                placeholder="+549..."
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                placeholder="email@ejemplo.com"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Etapa *</label>
              <select
                value={form.stageId}
                onChange={(e) => set('stageId', e.target.value)}
                className={inputClass}
              >
                {stages.filter((s) => !s.isTerminal).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Asignar a</label>
              <select
                value={form.assignedTo}
                onChange={(e) => set('assignedTo', e.target.value)}
                className={inputClass}
              >
                <option value="">Sin asignar</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name ?? a.id}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Presupuesto</label>
              <input
                type="number"
                min="0"
                value={form.budget}
                onChange={(e) => set('budget', e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Producto / Interés</label>
              <input
                value={form.productInterest}
                onChange={(e) => set('productInterest', e.target.value)}
                placeholder="Ej: Plan Pro"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Notas</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Observaciones iniciales..."
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
              {isPending ? 'Creando...' : 'Crear lead'}
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

const inputClass = cn(
  'w-full px-3 py-1.5 text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)
