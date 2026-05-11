'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'

type Producto = {
  id: string
  sku: string | null
  nombre: string
  descripcion: string | null
  precio: string
  costo: string | null
  categoria: string | null
  imagenUrl: string | null
  unidadVenta: string
  pesoG: number | null
  ivaPct: string
  stockMinimo: number
  activo: boolean
}

type Props = {
  producto?: Partial<Producto>
  onClose: () => void
  isAdmin?: boolean
}

const inputClass = cn(
  'w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

const selectClass = cn(
  'w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

const CATEGORIAS = ['Alfajor', 'Galletita', 'Display', 'Combo', 'Otro']
const IVA_OPTIONS = [
  { value: '21.00', label: '21% (general)' },
  { value: '10.50', label: '10.5% (reducida)' },
  { value: '0.00', label: '0% (exento)' },
]
const UNIDADES = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'caja_12', label: 'Caja x12' },
  { value: 'caja_24', label: 'Caja x24' },
  { value: 'display', label: 'Display' },
]

export default function ProductoModal({ producto, onClose, isAdmin = false }: Props) {
  const queryClient = useQueryClient()
  const isEdit = !!producto?.id

  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    sku: producto?.sku ?? '',
    nombre: producto?.nombre ?? '',
    descripcion: producto?.descripcion ?? '',
    precio: producto?.precio ?? '',
    costo: producto?.costo ?? '',
    categoria: producto?.categoria ?? '',
    imagenUrl: producto?.imagenUrl ?? '',
    unidadVenta: producto?.unidadVenta ?? 'unidad',
    pesoG: producto?.pesoG != null ? String(producto.pesoG) : '',
    ivaPct: producto?.ivaPct ?? '21.00',
    stockMinimo: producto?.stockMinimo != null ? String(producto.stockMinimo) : '0',
  })

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    const precio = parseFloat(form.precio)
    if (!form.precio || isNaN(precio) || precio <= 0) { setError('El precio debe ser mayor a 0'); return }

    setIsPending(true)
    try {
      const url = isEdit ? `/api/productos/${producto!.id}` : '/api/productos'
      const method = isEdit ? 'PATCH' : 'POST'

      const body: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        precio: form.precio,
        categoria: form.categoria.trim() || null,
        unidadVenta: form.unidadVenta,
        ivaPct: form.ivaPct,
        stockMinimo: form.stockMinimo ? parseInt(form.stockMinimo, 10) : 0,
        imagenUrl: form.imagenUrl.trim() || null,
      }

      if (form.sku.trim()) body.sku = form.sku.trim().toUpperCase()
      if (form.pesoG) body.pesoG = parseInt(form.pesoG, 10)
      if (isAdmin && form.costo) body.costo = form.costo

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <button className="absolute inset-0" onClick={onClose} aria-label="Cerrar" />
      <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-xl shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">
            {isEdit ? 'Editar Producto' : 'Nuevo Producto'}
          </h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-muted-foreground mb-1">SKU</label>
              <input
                value={form.sku}
                onChange={(e) => set('sku', e.target.value)}
                placeholder="MIM-001"
                className={inputClass}
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-muted-foreground mb-1">Categoría</label>
              <input
                list="categorias-list"
                value={form.categoria}
                onChange={(e) => set('categoria', e.target.value)}
                placeholder="Ej: Alfajor"
                className={inputClass}
              />
              <datalist id="categorias-list">
                {CATEGORIAS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

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
              rows={2}
              value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              placeholder="Descripción breve..."
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Precio de venta ($) *</label>
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
            {isAdmin && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Costo ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costo}
                  onChange={(e) => set('costo', e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Unidad de venta</label>
              <select
                value={form.unidadVenta}
                onChange={(e) => set('unidadVenta', e.target.value)}
                className={selectClass}
              >
                {UNIDADES.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">IVA</label>
              <select
                value={form.ivaPct}
                onChange={(e) => set('ivaPct', e.target.value)}
                className={selectClass}
              >
                {IVA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Peso (g)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.pesoG}
                onChange={(e) => set('pesoG', e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Stock mínimo</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.stockMinimo}
                onChange={(e) => set('stockMinimo', e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">URL de imagen</label>
            <input
              type="url"
              value={form.imagenUrl}
              onChange={(e) => set('imagenUrl', e.target.value)}
              placeholder="https://..."
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
