'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import { useToast } from '@/components/shared/ToastProvider'
import { inputClass, type Insumo } from './InsumosSection'

type RecetaItem = {
  recetaId: string
  insumoId: string
  gramos: string
  insumo: Insumo
}

type Receta = {
  id: string
  gramaje: number
  activo: boolean
  updatedAt: string
  items: RecetaItem[]
}

type DraftItem = { insumoId: string; gramos: string }

export default function RecetasSection() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: recetas = [], isLoading } = useQuery<Receta[]>({
    queryKey: ['cotizador-recetas'],
    queryFn: async () => {
      const res = await fetch('/api/admin/cotizador/recetas')
      if (!res.ok) throw new Error('Error al cargar recetas')
      const json = await res.json() as { data: Receta[] }
      return json.data
    },
  })

  const { data: insumos = [] } = useQuery<Insumo[]>({
    queryKey: ['cotizador-insumos'],
    queryFn: async () => {
      const res = await fetch('/api/admin/cotizador/insumos')
      if (!res.ok) throw new Error('Error al cargar insumos')
      const json = await res.json() as { data: Insumo[] }
      return json.data
    },
  })

  const insumosKg = insumos.filter((i) => i.unidad === 'kg' && i.activo)

  const [showCreate, setShowCreate] = useState(false)
  const [nuevoGramaje, setNuevoGramaje] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [deleting, setDeleting] = useState<Receta | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['cotizador-recetas'] })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const gramaje = Number(nuevoGramaje)
    if (!Number.isInteger(gramaje) || gramaje <= 0) {
      setCreateError('El gramaje debe ser un entero mayor a 0')
      return
    }
    setIsCreating(true)
    try {
      const res = await fetch('/api/admin/cotizador/recetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gramaje, items: [] }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setCreateError(data.error ?? 'Error al crear')
        return
      }
      invalidate()
      setShowCreate(false)
      setNuevoGramaje('')
      toast.success(`Receta de ${gramaje} g creada`)
    } catch {
      setCreateError('Error de conexión')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/cotizador/recetas/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setDeleteError(data.error ?? 'Error al eliminar')
        return
      }
      invalidate()
      setDeleting(null)
      toast.success('Receta dada de baja')
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section className="bg-card border border-border rounded-lg p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Recetas por gramaje</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Componentes en gramos de cada insumo por kg. La suma debería coincidir con el gramaje.
          </p>
        </div>
        <button
          onClick={() => { setCreateError(null); setShowCreate(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Nueva receta
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Cargando...</p>
      ) : recetas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No hay recetas cargadas</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {recetas.map((receta) => (
            <RecetaCard
              key={`${receta.id}:${receta.updatedAt}`}
              receta={receta}
              insumosKg={insumosKg}
              onChanged={invalidate}
              onBaja={() => { setDeleteError(null); setDeleting(receta) }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <button className="absolute inset-0" onClick={() => setShowCreate(false)} aria-label="Cerrar" />
          <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-sm shadow-xl">
            <h2 className="text-sm font-semibold text-foreground mb-4">Nueva receta</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Gramaje (g) *</label>
                <input
                  autoFocus
                  required
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={nuevoGramaje}
                  onChange={(e) => setNuevoGramaje(e.target.value)}
                  placeholder="Ej: 65"
                  className={inputClass}
                />
              </div>
              {createError && <p className="text-xs text-destructive">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isCreating ? 'Creando...' : 'Crear receta'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Dar de baja receta"
          description={`¿Dar de baja la receta de ${deleting.gramaje} g? No se va a ofrecer más al cotizar.`}
          warning={deleteError ?? undefined}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
          isPending={isDeleting}
        />
      )}
    </section>
  )
}

function RecetaCard({
  receta,
  insumosKg,
  onChanged,
  onBaja,
}: {
  receta: Receta
  insumosKg: Insumo[]
  onChanged: () => void
  onBaja: () => void
}) {
  const toast = useToast()
  const [items, setItems] = useState<DraftItem[]>(
    receta.items.map((i) => ({ insumoId: i.insumoId, gramos: i.gramos })),
  )
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const suma = items.reduce((acc, i) => acc + (Number(i.gramos) || 0), 0)
  const sumaOk = Math.abs(suma - receta.gramaje) < 0.005
  const usados = new Set(items.map((i) => i.insumoId))
  const disponibles = insumosKg.filter((i) => !usados.has(i.id))

  function nombreInsumo(insumoId: string): string {
    return (
      insumosKg.find((i) => i.id === insumoId)?.nombre
      ?? receta.items.find((i) => i.insumoId === insumoId)?.insumo.nombre
      ?? 'Insumo'
    )
  }

  async function handleSave() {
    setError(null)
    const payload = items.map((i) => ({ insumoId: i.insumoId, gramos: Number(i.gramos) }))
    if (payload.some((i) => !Number.isFinite(i.gramos) || i.gramos <= 0)) {
      setError('Todos los componentes necesitan gramos mayores a 0')
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/cotizador/recetas/${receta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al guardar')
        return
      }
      onChanged()
      toast.success(`Receta de ${receta.gramaje} g guardada`)
    } catch {
      setError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReactivar() {
    setError(null)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/cotizador/recetas/${receta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: true }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al reactivar')
        return
      }
      onChanged()
      toast.success(`Receta de ${receta.gramaje} g reactivada`)
    } catch {
      setError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={cn('border border-border rounded-lg p-3', !receta.activo && 'opacity-60')}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{receta.gramaje} g</span>
          {!receta.activo && (
            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              Inactiva
            </span>
          )}
        </div>
        {receta.activo ? (
          <button
            onClick={onBaja}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Dar de baja"
          >
            <Trash2 size={13} />
          </button>
        ) : (
          <button
            onClick={handleReactivar}
            disabled={isSaving}
            className="px-2 py-1 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Reactivar
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={item.insumoId} className="flex items-center gap-2">
            <span className="flex-1 text-xs text-foreground truncate">{nombreInsumo(item.insumoId)}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={item.gramos}
              onChange={(e) =>
                setItems((prev) => prev.map((p, i) => (i === index ? { ...p, gramos: e.target.value } : p)))
              }
              className={cn(inputClass, 'w-24 text-right')}
            />
            <span className="text-xs text-muted-foreground w-4">g</span>
            <button
              onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
              className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
              title="Quitar componente"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin componentes</p>
        )}
      </div>

      {disponibles.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) setItems((prev) => [...prev, { insumoId: e.target.value, gramos: '' }])
          }}
          className={cn(inputClass, 'mt-2 text-muted-foreground')}
        >
          <option value="">+ Agregar componente...</option>
          {disponibles.map((i) => (
            <option key={i.id} value={i.id}>{i.nombre}</option>
          ))}
        </select>
      )}

      <div className="flex items-center justify-between mt-3">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs',
            sumaOk ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400',
          )}
        >
          {!sumaOk && <AlertTriangle size={12} />}
          Suma: {suma.toLocaleString('es-AR', { maximumFractionDigits: 2 })} g
          {!sumaOk && ` — no coincide con ${receta.gramaje} g`}
        </span>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}
