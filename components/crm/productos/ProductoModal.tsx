'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'

type Producto = {
  id: string
  nombre: string
  descripcion: string | null
  precio: string
  activo: boolean
}

type Props = {
  producto?: Producto
  onClose: () => void
}

const inputClass = cn(
  'w-full px-3 py-1.5 text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

export default function ProductoModal({ producto, onClose }: Props) {
  const queryClient = useQueryClient()
  const isEdit = !!producto

  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    nombre: producto?.nombre ?? '',
    descripcion: producto?.descripcion ?? '',
    precio: producto?.precio ?? '',
  })

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.nombre.trim()) {
      setError('El nombre es requerido')
      return
    }
    const precio = parseFloat(form.precio)
    if (!form.precio || isNaN(precio) || precio < 0) {
      setError('El precio es requerido y debe ser un número válido')
      return
    }

    setIsPending(true)
    try {
      const url = isEdit ? `/api/productos/${producto!.id}` : '/api/productos'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          precio,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al guardar producto')
        return
      }

      void queryClient.invalidateQueries({ queryKey: ['productos'] })
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
      <div className="relative bg-card border border-border rounded-lg p-6 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">
            {isEdit ? 'Editar Producto' : 'Nuevo Producto'}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
            <input
              autoFocus
              required
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              placeholder="Nombre del producto"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Descripción</label>
            <textarea
              rows={3}
              value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              placeholder="Descripción del producto..."
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Precio *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.precio}
              onChange={(e) => set('precio', e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear Producto'}
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
