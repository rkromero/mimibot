'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, PowerOff, Trash2, Download, Copy } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import ProductoModal from './ProductoModal'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import DataTable from '@/components/data-table/DataTable'

type Producto = {
  id: string
  marcaId: string
  marcaNombre: string | null
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

type Marca = { id: string; nombre: string; slug: string; activo: boolean; esDefault: boolean }

const UNIDAD_LABELS: Record<string, string> = {
  unidad: 'Unidad',
  caja_12: 'Caja x12',
  caja_24: 'Caja x24',
  display: 'Display',
}

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

// "MIM-003" → "MIM-004" (conserva el padding). Sin número final → vacío,
// para que el backend genere el SKU automáticamente.
function incrementSku(sku: string | null): string {
  if (!sku) return ''
  const match = /^(.*?)(\d+)$/.exec(sku)
  if (!match) return ''
  const [, prefix, num] = match
  const next = String(parseInt(num!, 10) + 1).padStart(num!.length, '0')
  return `${prefix}${next}`
}

// Copia para duplicar: todos los campos menos id, con SKU incrementado.
function buildDuplicate(row: Producto): Partial<Producto> {
  return {
    marcaId: row.marcaId,
    sku: incrementSku(row.sku),
    nombre: row.nombre,
    descripcion: row.descripcion,
    precio: row.precio,
    costo: row.costo,
    categoria: row.categoria,
    imagenUrl: row.imagenUrl,
    unidadVenta: row.unidadVenta,
    pesoG: row.pesoG,
    ivaPct: row.ivaPct,
    stockMinimo: row.stockMinimo,
  }
}

export default function ProductosListView() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const queryClient = useQueryClient()
  const [modalMode, setModalMode] = useState<
    null | 'create' | { mode: 'edit'; producto: Producto } | { mode: 'duplicate'; producto: Partial<Producto> }
  >(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingProducto, setDeletingProducto] = useState<Producto | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [marcaFilter, setMarcaFilter] = useState('')

  const { data: marcasList = [] } = useQuery<Marca[]>({
    queryKey: ['marcas', 'activas'],
    queryFn: async () => {
      const res = await fetch('/api/marcas?soloActivas=true')
      if (!res.ok) return []
      const json = await res.json() as { data: Marca[] }
      return json.data
    },
    enabled: isAdmin,
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
      void queryClient.invalidateQueries({ queryKey: ['/api/productos'] })
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
      if (res.ok) void queryClient.invalidateQueries({ queryKey: ['/api/productos'] })
    } finally {
      setTogglingId(null)
    }
  }

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await fetch('/api/export/productos')
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `productos_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  const extraParams: Record<string, string> = {}
  if (isAdmin && includeInactive) extraParams['includeInactive'] = 'true'
  if (isAdmin && marcaFilter) extraParams['marcaId'] = marcaFilter

  const columns = [
    {
      key: 'sku',
      label: 'SKU',
      render: (row: Producto) => (
        <span className="text-muted-foreground font-mono text-xs">{row.sku ?? '—'}</span>
      ),
    },
    {
      key: 'nombre',
      label: 'Nombre',
      sortable: true,
      render: (row: Producto) => (
        <span className="font-medium text-foreground">
          {row.nombre}
          {row.descripcion && (
            <span className="block text-xs text-muted-foreground font-normal truncate max-w-[200px]">
              {row.descripcion}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'marca',
      label: 'Marca',
      render: (row: Producto) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
          {row.marcaNombre ?? 'Sin marca'}
        </span>
      ),
    },
    {
      key: 'categoria',
      label: 'Categoría',
      headerClassName: 'hidden md:table-cell',
      className: 'text-muted-foreground hidden md:table-cell',
      render: (row: Producto) => <span>{row.categoria ?? '—'}</span>,
    },
    {
      key: 'unidadVenta',
      label: 'Unidad',
      headerClassName: 'hidden lg:table-cell',
      className: 'text-muted-foreground hidden lg:table-cell',
      render: (row: Producto) => <span>{UNIDAD_LABELS[row.unidadVenta] ?? row.unidadVenta}</span>,
    },
    {
      key: 'precio',
      label: 'Precio',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right font-medium',
      render: (row: Producto) => <span>{formatMoney(row.precio)}</span>,
    },
    ...(isAdmin
      ? [
          {
            key: 'costo',
            label: 'Costo',
            headerClassName: 'text-right hidden lg:table-cell',
            className: 'text-right text-muted-foreground hidden lg:table-cell',
            render: (row: Producto) => <span>{row.costo ? formatMoney(row.costo) : '—'}</span>,
          },
        ]
      : []),
    {
      key: 'activo',
      label: 'Estado',
      render: (row: Producto) => (
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium',
            row.activo
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
          )}
        >
          {row.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            label: '',
            render: (row: Producto) => (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); setModalMode({ mode: 'edit', producto: row }) }}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Editar"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setModalMode({ mode: 'duplicate', producto: buildDuplicate(row) }) }}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Duplicar"
                >
                  <Copy size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); void handleToggleActivo(row) }}
                  disabled={togglingId === row.id}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title={row.activo ? 'Desactivar' : 'Activar'}
                >
                  <PowerOff size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeletingProducto(row) }}
                  className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground">Productos</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            CSV
          </button>
          {isAdmin && (
            <>
              <label className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="rounded"
                />
                Inactivos
              </label>
              <button
                onClick={() => setModalMode('create')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                Nuevo Producto
              </button>
            </>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 mb-4">
          <select
            value={marcaFilter}
            onChange={(e) => setMarcaFilter(e.target.value)}
            className="border border-border rounded-lg px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todas las marcas</option>
            {marcasList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
          {marcaFilter && (
            <button
              onClick={() => setMarcaFilter('')}
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      )}

      <DataTable<Producto>
        endpoint="/api/productos"
        columns={columns}
        extraParams={extraParams}
        defaultPageSize={50}
        searchPlaceholder="Buscar por nombre, SKU o categoría..."
        emptyMessage={includeInactive ? 'No hay productos registrados' : 'No hay productos activos'}
      />

      {modalMode === 'create' && (
        <ProductoModal onClose={() => setModalMode(null)} isAdmin={isAdmin} />
      )}
      {modalMode !== null && modalMode !== 'create' && 'mode' in modalMode && (
        <ProductoModal producto={modalMode.producto} onClose={() => setModalMode(null)} isAdmin={isAdmin} />
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
