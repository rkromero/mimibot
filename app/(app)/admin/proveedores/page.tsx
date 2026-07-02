'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import DataTable, { type DataTableColumn } from '@/components/data-table/DataTable'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import { useToast } from '@/components/shared/ToastProvider'

type Proveedor = {
  id: string
  nombre: string
  cuit: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  notas: string | null
}

type ProveedorForm = {
  nombre: string
  cuit: string
  telefono: string
  email: string
  direccion: string
  notas: string
}

const inputClass = cn(
  'w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
)

function emptyForm(): ProveedorForm {
  return { nombre: '', cuit: '', telefono: '', email: '', direccion: '', notas: '' }
}

export default function ProveedoresPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProveedorForm>(emptyForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingProveedor, setDeletingProveedor] = useState<Proveedor | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['/api/admin/proveedores'] })
    void queryClient.invalidateQueries({ queryKey: ['proveedores-select'] })
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(p: Proveedor) {
    setEditingId(p.id)
    setForm({
      nombre: p.nombre,
      cuit: p.cuit ?? '',
      telefono: p.telefono ?? '',
      email: p.email ?? '',
      direccion: p.direccion ?? '',
      notas: p.notas ?? '',
    })
    setFormError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.nombre.trim()) { setFormError('El nombre es requerido'); return }

    setIsSaving(true)
    try {
      const payload = {
        nombre: form.nombre.trim(),
        cuit: form.cuit.trim() || null,
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        direccion: form.direccion.trim() || null,
        notas: form.notas.trim() || null,
      }
      const res = await fetch(
        editingId ? `/api/admin/proveedores/${editingId}` : '/api/admin/proveedores',
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
      toast.success(editingId ? 'Proveedor actualizado' : 'Proveedor creado')
    } catch {
      setFormError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingProveedor) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/proveedores/${deletingProveedor.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setDeleteError(data.error ?? 'Error al eliminar')
        return
      }
      invalidate()
      setDeletingProveedor(null)
      toast.success('Proveedor dado de baja')
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setIsDeleting(false)
    }
  }

  const columns: DataTableColumn<Proveedor>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
      sortable: true,
      render: (row) => <span className="font-medium text-foreground">{row.nombre}</span>,
    },
    {
      key: 'cuit',
      label: 'CUIT',
      className: 'text-muted-foreground',
      render: (row) => row.cuit ?? '—',
    },
    {
      key: 'telefono',
      label: 'Teléfono',
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell text-muted-foreground',
      render: (row) => row.telefono ?? '—',
    },
    {
      key: 'email',
      label: 'Email',
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell text-muted-foreground',
      render: (row) => row.email ?? '—',
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
            onClick={(e) => { e.stopPropagation(); setDeleteError(null); setDeletingProveedor(row) }}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Dar de baja"
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
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h1 className="text-xl font-semibold text-foreground">Proveedores</h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            Nuevo proveedor
          </button>
        </div>

        <DataTable<Proveedor>
          endpoint="/api/admin/proveedores"
          columns={columns}
          defaultPageSize={50}
          searchPlaceholder="Buscar por nombre o CUIT..."
          emptyMessage="No hay proveedores cargados"
          renderMobileCard={(p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{p.nombre}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {[p.cuit, p.telefono].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  onClick={() => openEdit(p)}
                  className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground"
                >
                  Editar
                </button>
                <button
                  onClick={() => { setDeleteError(null); setDeletingProveedor(p) }}
                  className="px-3 py-1.5 text-xs border border-destructive/30 text-destructive rounded-md"
                >
                  Dar de baja
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
              {editingId ? 'Editar proveedor' : 'Nuevo proveedor'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
                <input
                  autoFocus
                  required
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Distribuidora Cacao SA"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">CUIT</label>
                  <input
                    inputMode="numeric"
                    value={form.cuit}
                    onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))}
                    placeholder="30-12345678-9"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                    placeholder="+549..."
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="proveedor@ejemplo.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Dirección</label>
                <input
                  value={form.direccion}
                  onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                  placeholder="Calle 123, Localidad"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Notas</label>
                <textarea
                  rows={2}
                  value={form.notas}
                  onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                  placeholder="Condiciones, contacto, etc. (opcional)"
                  className={cn(inputClass, 'resize-none')}
                />
              </div>

              {formError && <p className="text-xs text-destructive">{formError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear proveedor'}
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

      {deletingProveedor && (
        <ConfirmDeleteModal
          title="Dar de baja proveedor"
          description={`¿Dar de baja a "${deletingProveedor.nombre}"? Los gastos ya registrados lo siguen mostrando; no va a aparecer más para gastos nuevos.`}
          warning={deleteError ?? undefined}
          onConfirm={handleDelete}
          onClose={() => setDeletingProveedor(null)}
          isPending={isDeleting}
        />
      )}
    </div>
  )
}
