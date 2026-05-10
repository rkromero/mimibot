'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, CreditCard, Phone, Edit, Trash2, MapPin, Check, X } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import PedidosTab from './tabs/PedidosTab'
import CuentaCorrienteTab from './tabs/CuentaCorrienteTab'
import ActividadesSection from '@/components/crm/actividades/ActividadesSection'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'

type Props = { id: string }

type Cliente = {
  id: string
  nombre: string
  apellido: string
  email: string | null
  telefono: string | null
  direccion: string | null
  cuit: string | null
  origen: 'manual' | 'convertido_de_lead'
  asignadoA: string | null
  asignadoNombre: string | null
  asignadoColor: string | null
  territorioId: string | null
  territorioNombre: string | null
}

type AgentOption = { id: string; name: string | null; avatarColor: string }
type TerritorioOption = { id: string; nombre: string }

const inputClass = cn(
  'w-full px-3 py-3 md:py-1.5 text-[16px] md:text-sm rounded-lg md:rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

const readValueClass = 'text-sm text-foreground'

export default function ClienteDetail({ id }: Props) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const queryClient = useQueryClient()
  const router = useRouter()

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Cliente>>({})
  const [showCreatePedido, setShowCreatePedido] = useState(false)
  const [showRegistrarPago, setShowRegistrarPago] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: cliente, isLoading, isError } = useQuery<Cliente>({
    queryKey: ['cliente', id],
    queryFn: async () => {
      const res = await fetch(`/api/clientes/${id}`)
      if (!res.ok) throw new Error('Error al cargar cliente')
      const json = await res.json() as { data: Cliente }
      return json.data
    },
    staleTime: 30_000,
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
    enabled: isAdmin,
  })

  const { data: territorios = [] } = useQuery<TerritorioOption[]>({
    queryKey: ['territorios-list'],
    queryFn: async () => {
      const res = await fetch('/api/territorios')
      if (!res.ok) return []
      const json = await res.json() as { data: TerritorioOption[] }
      return json.data
    },
    staleTime: 60_000,
    enabled: isAdmin,
  })

  const [isChangingTerritorio, setIsChangingTerritorio] = useState(false)
  const [territorioSeleccionado, setTerritorioSeleccionado] = useState<string>('')
  const [isSavingTerritorio, setIsSavingTerritorio] = useState(false)
  const [territorioError, setTerritorioError] = useState<string | null>(null)

  async function handleSaveTerritorio() {
    if (!territorioSeleccionado) return
    setTerritorioError(null)
    setIsSavingTerritorio(true)
    try {
      const res = await fetch(`/api/clientes/${id}/territorio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ territorioId: territorioSeleccionado }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setTerritorioError(data.error ?? 'Error al cambiar territorio')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['cliente', id] })
      setIsChangingTerritorio(false)
      setTerritorioSeleccionado('')
    } catch {
      setTerritorioError('Error de conexión')
    } finally {
      setIsSavingTerritorio(false)
    }
  }

  function getField<K extends keyof Cliente>(key: K): Cliente[K] | undefined {
    if (key in form) return form[key] as Cliente[K]
    return cliente?.[key]
  }

  function setField<K extends keyof Cliente>(key: K, value: Cliente[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleCancelEdit() {
    setForm({})
    setSaveError(null)
    setIsEditing(false)
  }

  async function handleSave() {
    setSaveError(null)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: getField('nombre'),
          apellido: getField('apellido'),
          email: getField('email') || null,
          telefono: getField('telefono') || null,
          direccion: getField('direccion') || null,
          cuit: getField('cuit') || null,
          ...(isAdmin && 'asignadoA' in form ? { asignadoA: form.asignadoA ?? null } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setSaveError(data.error ?? 'Error al guardar')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['cliente', id] })
      void queryClient.invalidateQueries({ queryKey: ['clientes'] })
      setForm({})
      setIsEditing(false)
    } catch {
      setSaveError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setDeleteError(data.error ?? 'Error al eliminar')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['clientes'] })
      router.push('/crm/clientes')
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-sm text-muted-foreground">Cargando cliente...</div>
      </div>
    )
  }

  if (isError || !cliente) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-sm text-destructive">Error al cargar el cliente.</div>
      </div>
    )
  }

  const datosCliente = (
    <div className="bg-card border border-border rounded-lg p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Datos del cliente</h2>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors text-sm"
            title="Editar"
          >
            <Edit size={14} />
            <span className="hidden md:inline">Editar</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm md:text-xs text-muted-foreground mb-1.5 md:mb-1">Nombre</label>
          {isEditing ? (
            <input
              value={getField('nombre') ?? ''}
              onChange={(e) => setField('nombre', e.target.value)}
              className={inputClass}
            />
          ) : (
            <p className={readValueClass}>{getField('nombre') || '—'}</p>
          )}
        </div>
        <div>
          <label className="block text-sm md:text-xs text-muted-foreground mb-1.5 md:mb-1">Apellido</label>
          {isEditing ? (
            <input
              value={getField('apellido') ?? ''}
              onChange={(e) => setField('apellido', e.target.value)}
              className={inputClass}
            />
          ) : (
            <p className={readValueClass}>{getField('apellido') || '—'}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm md:text-xs text-muted-foreground mb-1.5 md:mb-1">Email</label>
          {isEditing ? (
            <input
              type="email"
              value={getField('email') ?? ''}
              onChange={(e) => setField('email', e.target.value)}
              className={inputClass}
            />
          ) : (
            <p className={readValueClass}>{getField('email') || '—'}</p>
          )}
        </div>
        <div>
          <label className="block text-sm md:text-xs text-muted-foreground mb-1.5 md:mb-1">Teléfono</label>
          {isEditing ? (
            <input
              type="tel"
              value={getField('telefono') ?? ''}
              onChange={(e) => setField('telefono', e.target.value)}
              className={inputClass}
            />
          ) : (
            <p className={readValueClass}>{getField('telefono') || '—'}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm md:text-xs text-muted-foreground mb-1.5 md:mb-1">Dirección</label>
          {isEditing ? (
            <input
              value={getField('direccion') ?? ''}
              onChange={(e) => setField('direccion', e.target.value)}
              className={inputClass}
            />
          ) : (
            <p className={readValueClass}>{getField('direccion') || '—'}</p>
          )}
        </div>
        <div>
          <label className="block text-sm md:text-xs text-muted-foreground mb-1.5 md:mb-1">CUIT</label>
          {isEditing ? (
            <input
              value={getField('cuit') ?? ''}
              onChange={(e) => setField('cuit', e.target.value)}
              placeholder="20-12345678-9"
              className={inputClass}
            />
          ) : (
            <p className={readValueClass}>{getField('cuit') || '—'}</p>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="md:max-w-xs">
          <label className="block text-sm md:text-xs text-muted-foreground mb-1.5 md:mb-1">Asignado a</label>
          {isEditing ? (
            <select
              value={getField('asignadoA') ?? ''}
              onChange={(e) => setField('asignadoA', e.target.value || null)}
              className={inputClass}
            >
              <option value="">Sin asignar</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name ?? a.id}</option>
              ))}
            </select>
          ) : (
            <p className={readValueClass}>
              {agents.find((a) => a.id === getField('asignadoA'))?.name ?? getField('asignadoNombre') ?? '—'}
            </p>
          )}
        </div>
      )}

      {saveError && <p className="text-xs text-destructive">{saveError}</p>}

      {/* Desktop inline save/cancel buttons */}
      {isEditing && (
        <div className="hidden md:flex items-center gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            onClick={handleCancelEdit}
            disabled={isSaving}
            className="px-4 py-1.5 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )

  const territorioSection = (
    <div className="bg-card border border-border rounded-lg p-4 md:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold text-foreground">Territorio</span>
        </div>
        {isAdmin && !isChangingTerritorio && (
          <button
            onClick={() => {
              setTerritorioSeleccionado(cliente.territorioId ?? '')
              setTerritorioError(null)
              setIsChangingTerritorio(true)
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit size={12} />
            Cambiar
          </button>
        )}
      </div>

      {isChangingTerritorio ? (
        <div className="mt-3 space-y-2">
          <select
            value={territorioSeleccionado}
            onChange={(e) => setTerritorioSeleccionado(e.target.value)}
            className={inputClass}
            autoFocus
          >
            <option value="">Sin asignar</option>
            {territorios.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          {territorioError && <p className="text-xs text-destructive">{territorioError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveTerritorio}
              disabled={isSavingTerritorio || !territorioSeleccionado}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Check size={12} />
              {isSavingTerritorio ? 'Guardando...' : 'Confirmar'}
            </button>
            <button
              onClick={() => { setIsChangingTerritorio(false); setTerritorioError(null) }}
              disabled={isSavingTerritorio}
              className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-md text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <X size={12} />
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-foreground">
          {cliente.territorioNombre
            ? cliente.territorioNombre
            : <span className="text-muted-foreground">Sin asignar</span>}
        </p>
      )}
    </div>
  )

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className={cn(
        'p-4 md:p-6 pb-24 md:pb-6 space-y-4 md:space-y-6',
        isEditing && 'pb-36 md:pb-6',
      )}>
        {/* Mobile header */}
        <div className="md:hidden space-y-4">
          <div className="flex items-center gap-3">
            <Link href="/crm/clientes" className="p-2 -ml-2 text-muted-foreground">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-foreground">
                {cliente.nombre} {cliente.apellido}
              </h1>
              <p className="text-xs text-muted-foreground capitalize">{cliente.origen.replace(/_/g, ' ')}</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => { setDeleteError(null); setShowDeleteModal(true) }}
                className="p-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                title="Eliminar cliente"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowRegistrarPago(true)}
              className="flex items-center justify-center gap-2 py-3.5 border border-border rounded-xl text-base font-medium text-foreground bg-card active:bg-accent/70 transition-colors"
            >
              <CreditCard size={18} />
              Registrar Pago
            </button>
            <button
              onClick={() => setShowCreatePedido(true)}
              className="flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl text-base font-medium active:bg-primary/80 transition-colors"
            >
              <Plus size={18} />
              Crear Pedido
            </button>
          </div>

          {cliente.telefono && (
            <a
              href={`tel:${cliente.telefono}`}
              className="flex items-center gap-2 text-primary text-base font-medium py-1"
            >
              <Phone size={16} />
              {cliente.telefono}
            </a>
          )}
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/crm/clientes"
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                {cliente.nombre} {cliente.apellido}
              </h1>
              <p className="text-xs text-muted-foreground capitalize">{cliente.origen.replace('_', ' ')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => { setDeleteError(null); setShowDeleteModal(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-destructive/50 text-destructive rounded-md text-sm font-medium hover:bg-destructive/10 transition-colors"
                title="Eliminar cliente"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            )}
            <button
              onClick={() => setShowRegistrarPago(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <CreditCard size={14} />
              Registrar Pago
            </button>
            <button
              onClick={() => setShowCreatePedido(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={14} />
              Crear Pedido
            </button>
          </div>
        </div>

        {/* Desktop: 2-column layout */}
        <div className="hidden lg:grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {datosCliente}
            {territorioSection}
            <ActividadesSection
              clienteId={id}
              asignadoA={cliente.asignadoA}
              agents={agents}
            />
          </div>
          <div className="lg:col-span-3 space-y-6">
            <PedidosTab
              clienteId={id}
              showCreate={showCreatePedido}
              onCloseCreate={() => setShowCreatePedido(false)}
            />
            <CuentaCorrienteTab
              clienteId={id}
              clienteNombre={`${cliente.nombre} ${cliente.apellido}`}
              showPago={showRegistrarPago}
              onClosePago={() => setShowRegistrarPago(false)}
            />
          </div>
        </div>

        {/* Mobile/tablet: single column */}
        <div className="lg:hidden space-y-4">
          {datosCliente}
          {territorioSection}
          <ActividadesSection
            clienteId={id}
            asignadoA={cliente.asignadoA}
            agents={agents}
          />
          <PedidosTab
            clienteId={id}
            showCreate={showCreatePedido}
            onCloseCreate={() => setShowCreatePedido(false)}
          />
          <CuentaCorrienteTab
            clienteId={id}
            clienteNombre={`${cliente.nombre} ${cliente.apellido}`}
            showPago={showRegistrarPago}
            onClosePago={() => setShowRegistrarPago(false)}
          />
        </div>
      </div>

      {/* Mobile sticky bottom bar when editing */}
      {isEditing && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 flex gap-3 md:hidden z-20">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-base font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            onClick={handleCancelEdit}
            disabled={isSaving}
            className="flex-1 py-3 border border-border rounded-xl text-base font-medium text-foreground bg-card hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      )}

      {showDeleteModal && (
        <ConfirmDeleteModal
          title="Eliminar cliente"
          description={`¿Eliminar a ${cliente.nombre} ${cliente.apellido}? Esta acción no se puede deshacer.`}
          warning={deleteError ?? undefined}
          onConfirm={handleDelete}
          onClose={() => setShowDeleteModal(false)}
          isPending={isDeleting}
        />
      )}
    </div>
  )
}
