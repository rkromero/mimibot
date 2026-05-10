'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Pencil, PowerOff, Trash2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import ProductoModal from './ProductoModal'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'

type Producto = {
  id: string
  nombre: string
  descripcion: string | null
  precio: string
  activo: boolean
}

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function ProductosListView() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<null | 'create' | { mode: 'edit'; producto: Producto }>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingProducto, setDeletingProducto] = useState<Producto | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos'],
    queryFn: async () => {
      const res = await fetch('/api/productos')
      if (!res.ok) throw new Error('Error al cargar productos')
      const json = await res.json() as { data: Producto[] }
      return json.data
    },
    staleTime: 30_000,
  })

  const filtered = productos.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return p.nombre.toLowerCase().includes(q) || (p.descripcion ?? '').toLowerCase().includes(q)
  })

  async function handleDeleteProducto() {
    if (!deletingProducto) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/productos/${deletingProducto.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setDeleteError(data.error ?? 'Error al eliminar')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['productos'] })
      setDeletingProducto(null)
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleToggleActivo(producto: Producto) {
    setTogglingId(producto.id)
    try {
      const res = await fetch(`/api/productos/${producto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !producto.activo }),
      })
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['productos'] })
      }
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground">Productos</h1>
        {isAdmin && (
          <button
            onClick={() => setModalMode('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            Nuevo Producto
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full max-w-sm pl-9 pr-3 py-1.5 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando productos...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {search ? 'Sin resultados' : 'No hay productos registrados'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Nombre</th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Descripción</th>
                <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Precio</th>
                <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Estado</th>
                {isAdmin && (
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-foreground">{p.nombre}</td>
                  <td className="py-2.5 px-3 text-muted-foreground max-w-xs truncate">
                    {p.descripcion ? (
                      <span title={p.descripcion}>
                        {p.descripcion.length > 60 ? p.descripcion.slice(0, 60) + '...' : p.descripcion}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium">{formatMoney(p.precio)}</td>
                  <td className="py-2.5 px-3">
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      p.activo
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
                    )}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setModalMode({ mode: 'edit', producto: p })}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleActivo(p)}
                          disabled={togglingId === p.id}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          title={p.activo ? 'Desactivar' : 'Activar'}
                        >
                          <PowerOff size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteError(null)
                            setDeletingProducto(p)
                          }}
                          className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalMode === 'create' && (
        <ProductoModal onClose={() => setModalMode(null)} />
      )}
      {modalMode !== null && modalMode !== 'create' && 'mode' in modalMode && modalMode.mode === 'edit' && (
        <ProductoModal producto={modalMode.producto} onClose={() => setModalMode(null)} />
      )}

      {deletingProducto && (
        <ConfirmDeleteModal
          title="Eliminar producto"
          description={`¿Eliminar "${deletingProducto.nombre}"? Esta acción no se puede deshacer.`}
          warning={deleteError ?? undefined}
          onConfirm={handleDeleteProducto}
          onClose={() => setDeletingProducto(null)}
          isPending={isDeleting}
        />
      )}
    </div>
  )
}
