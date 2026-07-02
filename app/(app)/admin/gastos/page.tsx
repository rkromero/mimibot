'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayStrAR, formatFechaInstanteAR, fechaISO_AR } from '@/lib/dates'
import DataTable, { type DataTableColumn } from '@/components/data-table/DataTable'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import { useToast } from '@/components/shared/ToastProvider'

type Categoria = {
  id: string
  nombre: string
  tipo: 'costo_directo' | 'gasto_operativo'
}

type Gasto = {
  id: string
  fecha: string
  categoriaId: string
  categoriaNombre: string
  categoriaTipo: 'costo_directo' | 'gasto_operativo'
  monto: string
  descripcion: string | null
  proveedorId: string | null
  proveedorNombre: string | null
  comprobante: string | null
  metodoPago: 'efectivo' | 'transferencia' | 'mercadopago' | null
  registradoPorNombre: string | null
}

type Proveedor = {
  id: string
  nombre: string
}

type Resumen = {
  mes: string
  total: string
  costoDirecto: string
  gastoOperativo: string
  porCategoria: Array<{ categoriaId: string; nombre: string; tipo: string; total: string; cantidad: number }>
}

type GastoForm = {
  fecha: string
  categoriaId: string
  monto: string
  descripcion: string
  proveedorId: string
  comprobante: string
  metodoPago: string
}

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercadopago: 'MercadoPago',
}

const inputClass = cn(
  'w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
)

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function emptyForm(): GastoForm {
  return {
    fecha: todayStrAR(),
    categoriaId: '',
    monto: '',
    descripcion: '',
    proveedorId: '',
    comprobante: '',
    metodoPago: '',
  }
}

export default function GastosPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [mes, setMes] = useState(todayStrAR().slice(0, 7))
  const [filterCategoria, setFilterCategoria] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<GastoForm>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingGasto, setDeletingGasto] = useState<Gasto | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Alta inline de categoría dentro del modal
  const [showNuevaCategoria, setShowNuevaCategoria] = useState(false)
  const [nuevaCategoria, setNuevaCategoria] = useState({ nombre: '', tipo: 'gasto_operativo' })
  const [isSavingCategoria, setIsSavingCategoria] = useState(false)
  // Alta rápida de proveedor dentro del modal
  const [showNuevoProveedor, setShowNuevoProveedor] = useState(false)
  const [nuevoProveedorNombre, setNuevoProveedorNombre] = useState('')
  const [isSavingProveedor, setIsSavingProveedor] = useState(false)

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['gasto-categorias'],
    queryFn: async () => {
      const res = await fetch('/api/admin/gastos/categorias')
      if (!res.ok) return []
      const json = await res.json() as { data: Categoria[] }
      return json.data
    },
    staleTime: 60_000,
  })

  const { data: proveedoresList = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores-select'],
    queryFn: async () => {
      const res = await fetch('/api/admin/proveedores?limit=200&sortBy=nombre&sortDir=asc')
      if (!res.ok) return []
      const json = await res.json() as { data: Proveedor[] }
      return json.data
    },
    staleTime: 60_000,
  })

  const { data: resumen } = useQuery<Resumen | null>({
    queryKey: ['gastos-resumen', mes],
    queryFn: async () => {
      const res = await fetch(`/api/admin/gastos/resumen?mes=${mes}`)
      if (!res.ok) return null
      const json = await res.json() as { data: Resumen }
      return json.data
    },
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['/api/admin/gastos'] })
    void queryClient.invalidateQueries({ queryKey: ['gastos-resumen'] })
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setShowNuevaCategoria(false)
    setShowNuevoProveedor(false)
    setShowModal(true)
  }

  function openEdit(gasto: Gasto) {
    setEditingId(gasto.id)
    setForm({
      fecha: fechaISO_AR(gasto.fecha),
      categoriaId: gasto.categoriaId,
      monto: gasto.monto,
      descripcion: gasto.descripcion ?? '',
      proveedorId: gasto.proveedorId ?? '',
      comprobante: gasto.comprobante ?? '',
      metodoPago: gasto.metodoPago ?? '',
    })
    setFormError(null)
    setShowNuevaCategoria(false)
    setShowNuevoProveedor(false)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const monto = parseFloat(form.monto)
    if (!form.categoriaId) { setFormError('Elegí una categoría'); return }
    if (!Number.isFinite(monto) || monto <= 0) { setFormError('El monto debe ser mayor a 0'); return }

    setIsSaving(true)
    try {
      const payload = {
        fecha: form.fecha,
        categoriaId: form.categoriaId,
        monto,
        descripcion: form.descripcion.trim() || null,
        proveedorId: form.proveedorId || null,
        comprobante: form.comprobante.trim() || null,
        metodoPago: form.metodoPago || null,
      }
      const res = await fetch(
        editingId ? `/api/admin/gastos/${editingId}` : '/api/admin/gastos',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setFormError(data.error ?? 'Error al guardar')
        return
      }
      invalidate()
      setShowModal(false)
      toast.success(editingId ? 'Gasto actualizado' : 'Gasto registrado')
    } catch {
      setFormError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCrearCategoria() {
    if (!nuevaCategoria.nombre.trim()) return
    setIsSavingCategoria(true)
    try {
      const res = await fetch('/api/admin/gastos/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevaCategoria),
      })
      const json = await res.json() as { data?: Categoria; error?: string }
      if (!res.ok || !json.data) {
        setFormError(json.error ?? 'Error al crear la categoría')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['gasto-categorias'] })
      setForm((f) => ({ ...f, categoriaId: json.data!.id }))
      setShowNuevaCategoria(false)
      setNuevaCategoria({ nombre: '', tipo: 'gasto_operativo' })
      setFormError(null)
    } catch {
      setFormError('Error de conexión')
    } finally {
      setIsSavingCategoria(false)
    }
  }

  async function handleCrearProveedor() {
    if (!nuevoProveedorNombre.trim()) return
    setIsSavingProveedor(true)
    try {
      const res = await fetch('/api/admin/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoProveedorNombre.trim() }),
      })
      const json = await res.json() as { data?: Proveedor; error?: string }
      if (!res.ok || !json.data) {
        setFormError(json.error ?? 'Error al crear el proveedor')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['proveedores-select'] })
      void queryClient.invalidateQueries({ queryKey: ['/api/admin/proveedores'] })
      setForm((f) => ({ ...f, proveedorId: json.data!.id }))
      setShowNuevoProveedor(false)
      setNuevoProveedorNombre('')
      setFormError(null)
    } catch {
      setFormError('Error de conexión')
    } finally {
      setIsSavingProveedor(false)
    }
  }

  async function handleDelete() {
    if (!deletingGasto) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/gastos/${deletingGasto.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setDeleteError(data.error ?? 'Error al eliminar')
        return
      }
      invalidate()
      setDeletingGasto(null)
      toast.success('Gasto eliminado')
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setIsDeleting(false)
    }
  }

  const extraParams: Record<string, string> = { mes }
  if (filterCategoria) extraParams['categoriaId'] = filterCategoria

  const columns: DataTableColumn<Gasto>[] = [
    {
      key: 'fecha',
      label: 'Fecha',
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground whitespace-nowrap">{formatFechaInstanteAR(row.fecha)}</span>
      ),
    },
    {
      key: 'categoriaNombre',
      label: 'Categoría',
      render: (row) => (
        <div>
          <span className="font-medium text-foreground">{row.categoriaNombre}</span>
          <span className={cn(
            'block text-[10px] uppercase tracking-wide',
            row.categoriaTipo === 'costo_directo' ? 'text-amber-600' : 'text-muted-foreground',
          )}>
            {row.categoriaTipo === 'costo_directo' ? 'Costo directo' : 'Gasto operativo'}
          </span>
        </div>
      ),
    },
    {
      key: 'descripcion',
      label: 'Detalle',
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
      render: (row) => (
        <div className="max-w-[260px]">
          <span className="text-muted-foreground truncate block">{row.descripcion || '—'}</span>
          {row.proveedorNombre && <span className="text-xs text-muted-foreground/70">{row.proveedorNombre}</span>}
        </div>
      ),
    },
    {
      key: 'metodoPago',
      label: 'Método',
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell text-muted-foreground',
      render: (row) => (row.metodoPago ? METODO_LABELS[row.metodoPago] : '—'),
    },
    {
      key: 'monto',
      label: 'Monto',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right font-medium tabular-nums',
      render: (row) => <span>{formatMoney(row.monto)}</span>,
    },
    {
      key: 'actions',
      label: '',
      headerClassName: 'w-16',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(row) }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            title="Editar"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeletingGasto(row) }}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Eliminar"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4 md:mb-6 flex-wrap gap-3">
          <h1 className="text-xl font-semibold text-foreground">Gastos</h1>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={mes}
              onChange={(e) => e.target.value && setMes(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Mes"
            />
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={14} />
              Nuevo gasto
            </button>
          </div>
        </div>

        {/* Resumen del mes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Total del mes</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatMoney(resumen?.total ?? '0')}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Costos directos (materia prima)</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{formatMoney(resumen?.costoDirecto ?? '0')}</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground">Gastos operativos</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatMoney(resumen?.gastoOperativo ?? '0')}</p>
          </div>
        </div>

        {/* Desglose por categoría */}
        {resumen && resumen.porCategoria.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-4 mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Por categoría
            </p>
            <div className="space-y-2">
              {resumen.porCategoria.map((c) => {
                const pct = parseFloat(resumen.total) > 0
                  ? (parseFloat(c.total) / parseFloat(resumen.total)) * 100
                  : 0
                return (
                  <div key={c.categoriaId} className="flex items-center gap-3">
                    <span className="text-sm text-foreground w-44 md:w-56 shrink-0 truncate">{c.nombre}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', c.tipo === 'costo_directo' ? 'bg-amber-500' : 'bg-primary')}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-foreground w-28 text-right tabular-nums shrink-0">
                      {formatMoney(c.total)}
                    </span>
                    <span className="text-xs text-muted-foreground w-10 text-right shrink-0">{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filtro por categoría */}
        <div className="flex items-center gap-3 mb-4">
          <select
            value={filterCategoria}
            onChange={(e) => setFilterCategoria(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        <DataTable<Gasto>
          endpoint="/api/admin/gastos"
          columns={columns}
          extraParams={extraParams}
          defaultPageSize={50}
          showSearch={false}
          emptyMessage="No hay gastos registrados este mes"
          renderMobileCard={(g) => (
            <div key={g.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{g.categoriaNombre}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatFechaInstanteAR(g.fecha)}{g.proveedorNombre ? ` · ${g.proveedorNombre}` : ''}
                  </p>
                  {g.descripcion && <p className="text-sm text-muted-foreground mt-1 truncate">{g.descripcion}</p>}
                </div>
                <p className="text-lg font-bold text-foreground shrink-0">{formatMoney(g.monto)}</p>
              </div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  onClick={() => openEdit(g)}
                  className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground"
                >
                  Editar
                </button>
                <button
                  onClick={() => { setDeleteError(null); setDeletingGasto(g) }}
                  className="px-3 py-1.5 text-xs border border-destructive/30 text-destructive rounded-md"
                >
                  Eliminar
                </button>
              </div>
            </div>
          )}
        />
      </div>

      {/* Modal alta / edición */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <button className="absolute inset-0" onClick={() => setShowModal(false)} aria-label="Cerrar" />
          <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-foreground mb-4">
              {editingId ? 'Editar gasto' : 'Registrar gasto'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={form.fecha}
                    onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Monto *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    required
                    value={form.monto}
                    onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Categoría *</label>
                <select
                  value={form.categoriaId}
                  onChange={(e) => {
                    if (e.target.value === '__nueva__') {
                      setShowNuevaCategoria(true)
                      return
                    }
                    setForm((f) => ({ ...f, categoriaId: e.target.value }))
                  }}
                  className={inputClass}
                >
                  <option value="">Seleccionar categoría...</option>
                  <optgroup label="Costos directos">
                    {categorias.filter((c) => c.tipo === 'costo_directo').map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Gastos operativos">
                    {categorias.filter((c) => c.tipo === 'gasto_operativo').map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </optgroup>
                  <option value="__nueva__">+ Crear categoría nueva...</option>
                </select>
              </div>

              {showNuevaCategoria && (
                <div className="border border-border rounded-md p-3 space-y-2 bg-muted/40">
                  <p className="text-xs font-medium text-foreground">Nueva categoría</p>
                  <input
                    value={nuevaCategoria.nombre}
                    onChange={(e) => setNuevaCategoria((c) => ({ ...c, nombre: e.target.value }))}
                    placeholder="Nombre (ej: Marketing)"
                    className={inputClass}
                  />
                  <select
                    value={nuevaCategoria.tipo}
                    onChange={(e) => setNuevaCategoria((c) => ({ ...c, tipo: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="gasto_operativo">Gasto operativo (alquiler, sueldos, servicios...)</option>
                    <option value="costo_directo">Costo directo (materia prima, packaging...)</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCrearCategoria()}
                      disabled={isSavingCategoria || !nuevaCategoria.nombre.trim()}
                      className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      {isSavingCategoria ? 'Creando...' : 'Crear'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNuevaCategoria(false)}
                      className="px-3 py-1 text-xs text-muted-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Detalle</label>
                <input
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Ej: 25 kg chocolate semiamargo"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Proveedor</label>
                <select
                  value={form.proveedorId}
                  onChange={(e) => {
                    if (e.target.value === '__nuevo__') {
                      setShowNuevoProveedor(true)
                      return
                    }
                    setForm((f) => ({ ...f, proveedorId: e.target.value }))
                  }}
                  className={inputClass}
                >
                  <option value="">Sin proveedor</option>
                  {proveedoresList.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                  <option value="__nuevo__">+ Crear proveedor nuevo...</option>
                </select>
              </div>

              {showNuevoProveedor && (
                <div className="border border-border rounded-md p-3 space-y-2 bg-muted/40">
                  <p className="text-xs font-medium text-foreground">Nuevo proveedor</p>
                  <input
                    value={nuevoProveedorNombre}
                    onChange={(e) => setNuevoProveedorNombre(e.target.value)}
                    placeholder="Nombre del proveedor"
                    className={inputClass}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Los demás datos (CUIT, teléfono, etc.) se completan después en Control → Proveedores.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCrearProveedor()}
                      disabled={isSavingProveedor || !nuevoProveedorNombre.trim()}
                      className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      {isSavingProveedor ? 'Creando...' : 'Crear'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNuevoProveedor(false)}
                      className="px-3 py-1 text-xs text-muted-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Comprobante</label>
                <input
                  value={form.comprobante}
                  onChange={(e) => setForm((f) => ({ ...f, comprobante: e.target.value }))}
                  placeholder="Nº factura (opcional)"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Método de pago</label>
                <select
                  value={form.metodoPago}
                  onChange={(e) => setForm((f) => ({ ...f, metodoPago: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Sin especificar</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="mercadopago">MercadoPago</option>
                </select>
              </div>

              {formError && <p className="text-xs text-destructive">{formError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Registrar gasto'}
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

      {deletingGasto && (
        <ConfirmDeleteModal
          title="Eliminar gasto"
          description={`¿Eliminar el gasto de ${deletingGasto.categoriaNombre} por ${formatMoney(deletingGasto.monto)} del ${formatFechaInstanteAR(deletingGasto.fecha)}?`}
          warning={deleteError ?? undefined}
          onConfirm={handleDelete}
          onClose={() => setDeletingGasto(null)}
          isPending={isDeleting}
        />
      )}
    </div>
  )
}
