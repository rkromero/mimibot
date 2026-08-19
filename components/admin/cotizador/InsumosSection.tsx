'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import { useToast } from '@/components/shared/ToastProvider'

export type Insumo = {
  id: string
  nombre: string
  tipo: 'galletita' | 'dulce_de_leche' | 'chocolate' | 'bobina' | 'caja' | 'otro'
  unidad: 'kg' | 'unidad'
  precio: string
  activo: boolean
}

type InsumoForm = {
  nombre: string
  tipo: Insumo['tipo']
  unidad: Insumo['unidad']
  precio: string
}

export const TIPO_INSUMO_LABEL: Record<Insumo['tipo'], string> = {
  galletita: 'Galletita',
  dulce_de_leche: 'Dulce de leche',
  chocolate: 'Chocolate',
  bobina: 'Bobina',
  caja: 'Caja',
  otro: 'Otro',
}

export const inputClass = cn(
  'w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
)

function fmtPrecio(value: string): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value))
}

function emptyForm(): InsumoForm {
  return { nombre: '', tipo: 'otro', unidad: 'kg', precio: '' }
}

export default function InsumosSection() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: insumos = [], isLoading } = useQuery<Insumo[]>({
    queryKey: ['cotizador-insumos'],
    queryFn: async () => {
      const res = await fetch('/api/admin/cotizador/insumos')
      if (!res.ok) throw new Error('Error al cargar insumos')
      const json = await res.json() as { data: Insumo[] }
      return json.data
    },
  })

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<InsumoForm>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleting, setDeleting] = useState<Insumo | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['cotizador-insumos'] })
    void queryClient.invalidateQueries({ queryKey: ['cotizador-recetas'] })
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(i: Insumo) {
    setEditingId(i.id)
    setForm({ nombre: i.nombre, tipo: i.tipo, unidad: i.unidad, precio: i.precio })
    setFormError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const precio = Number(form.precio)
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return }
    if (!Number.isFinite(precio) || precio <= 0) { setFormError('El precio debe ser mayor a 0'); return }

    setIsSaving(true)
    try {
      const res = await fetch(
        editingId ? `/api/admin/cotizador/insumos/${editingId}` : '/api/admin/cotizador/insumos',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: form.nombre.trim(), tipo: form.tipo, unidad: form.unidad, precio }),
        },
      )
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setFormError(data.error ?? 'Error al guardar')
        return
      }
      invalidate()
      setShowModal(false)
      toast.success(editingId ? 'Insumo actualizado' : 'Insumo creado')
    } catch {
      setFormError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/cotizador/insumos/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setDeleteError(data.error ?? 'Error al eliminar')
        return
      }
      invalidate()
      setDeleting(null)
      toast.success('Insumo dado de baja')
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
          <h2 className="text-sm font-semibold text-foreground">Insumos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Precios por kg (componentes de receta) o por unidad (bobina y caja).
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Nuevo insumo
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Cargando...</p>
      ) : insumos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No hay insumos cargados</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Nombre</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Unidad</th>
                <th className="py-2 pr-3 font-medium text-right">Precio</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 w-16" />
              </tr>
            </thead>
            <tbody>
              {insumos.map((i) => (
                <tr key={i.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">{i.nombre}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{TIPO_INSUMO_LABEL[i.tipo]}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{i.unidad === 'kg' ? 'por kg' : 'por unidad'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{fmtPrecio(i.precio)}</td>
                  <td className="py-2 pr-3">
                    <span className={cn(
                      'inline-flex px-1.5 py-0.5 rounded-full text-[11px] font-medium',
                      i.activo
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
                    )}>
                      {i.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(i)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                      {i.activo && (
                        <button
                          onClick={() => { setDeleteError(null); setDeleting(i) }}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                          title="Dar de baja"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <button className="absolute inset-0" onClick={() => setShowModal(false)} aria-label="Cerrar" />
          <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-md shadow-xl">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              {editingId ? 'Editar insumo' : 'Nuevo insumo'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
                <input
                  autoFocus
                  required
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Galletita vainilla"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Tipo *</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as Insumo['tipo'] }))}
                    className={inputClass}
                  >
                    {(Object.keys(TIPO_INSUMO_LABEL) as Insumo['tipo'][]).map((t) => (
                      <option key={t} value={t}>{TIPO_INSUMO_LABEL[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Unidad *</label>
                  <select
                    value={form.unidad}
                    onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value as Insumo['unidad'] }))}
                    className={inputClass}
                  >
                    <option value="kg">por kg</option>
                    <option value="unidad">por unidad</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Precio {form.unidad === 'kg' ? 'por kg' : 'por unidad'} *
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  value={form.precio}
                  onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>

              {formError && <p className="text-xs text-destructive">{formError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear insumo'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
          title="Dar de baja insumo"
          description={`¿Dar de baja "${deleting.nombre}"? Las recetas que lo usan dejan de sumarlo al costo hasta que lo reactives.`}
          warning={deleteError ?? undefined}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
          isPending={isDeleting}
        />
      )}
    </section>
  )
}
