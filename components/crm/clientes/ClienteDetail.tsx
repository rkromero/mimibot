'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, CreditCard, Phone, Edit, Trash2, MapPin, Check, X, MessageCircle, MoreVertical, AlertTriangle, LocateFixed } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import PedidosTab from './tabs/PedidosTab'
import CuentaCorrienteTab from './tabs/CuentaCorrienteTab'
import CreatePedidoModal from '@/components/crm/pedidos/CreatePedidoModal'
import ActividadesSection from '@/components/crm/actividades/ActividadesSection'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import { useToast } from '@/components/shared/ToastProvider'

type Props = { id: string }

type Cliente = {
  id: string
  nombre: string
  apellido: string
  email: string | null
  telefono: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  cuit: string | null
  geocodeStatus: string | null
  origen: 'manual' | 'convertido_de_lead'
  estadoActividad: 'activo' | 'inactivo' | 'perdido' | null
  asignadoA: string | null
  asignadoNombre: string | null
  asignadoColor: string | null
  territorioId: string | null
  territorioNombre: string | null
  pedidosSummary?: {
    count: number
    total: string
    saldoPendiente: string
    ultimoPedidoFecha: string | null
  }
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'hoy'
  if (diffDays === 1) return 'ayer'
  if (diffDays < 7) return `hace ${diffDays} días`
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} sem`
  if (diffDays < 365) return `hace ${Math.floor(diffDays / 30)} m`
  return `hace ${Math.floor(diffDays / 365)} a`
}

const estadoActividadColors: Record<string, string> = {
  activo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  inactivo: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  perdido: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const estadoActividadLabels: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  perdido: 'Perdido',
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
  const canRegisterPago = session?.user?.role === 'admin' || session?.user?.role === 'gerente'
  const queryClient = useQueryClient()
  const router = useRouter()
  const toast = useToast()

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Cliente>>({})
  const [showCreatePedido, setShowCreatePedido] = useState(false)
  const [showRegistrarPago, setShowRegistrarPago] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showPurgeModal, setShowPurgeModal] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const [purgeError, setPurgeError] = useState<string | null>(null)
  const [isOpeningInbox, setIsOpeningInbox] = useState(false)
  const [showGeoMenu, setShowGeoMenu] = useState(false)
  const [isGeoLoading, setIsGeoLoading] = useState(false)

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
      const res = await fetch('/api/users?role=agent,vendedor,rtv&active=true')
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
          localidad: getField('localidad') || null,
          provincia: getField('provincia') || null,
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

  async function handleOpenInbox() {
    setIsOpeningInbox(true)
    try {
      const res = await fetch(`/api/clientes/${id}/conversacion`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        toast.error(data.error ?? 'Error al abrir conversación')
        return
      }
      const { data } = await res.json() as { data: { conversationId: string } }
      router.push(`/inbox?conversation=${data.conversationId}`)
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsOpeningInbox(false)
    }
  }

  async function handlePurge() {
    setPurgeError(null)
    setIsPurging(true)
    try {
      const res = await fetch(`/api/clientes/${id}/purge`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setPurgeError(data.error ?? 'Error al eliminar definitivamente')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['clientes'] })
      toast.success('Cliente eliminado definitivamente')
      router.push('/crm/clientes')
    } catch {
      setPurgeError('Error de conexión')
    } finally {
      setIsPurging(false)
    }
  }

  async function handleCorregirUbicacion(modo: 'geocode' | 'limpiar') {
    setIsGeoLoading(true)
    try {
      const res = await fetch(`/api/clientes/${id}/regeocodificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        toast.error(data.error ?? 'No se pudo actualizar la ubicación')
        return
      }
      const { data } = await res.json() as { data: { lat: number | null; lng: number | null; geocodeStatus: string | null } }
      if (modo === 'limpiar') {
        toast.success('Ubicación borrada: el repartidor navegará por la dirección')
      } else if (data.lat != null && data.lng != null) {
        toast.success('Ubicación actualizada')
      } else {
        toast.error('No se pudo geocodificar, quedó por dirección')
      }
      void queryClient.invalidateQueries({ queryKey: ['cliente', id] })
      void queryClient.invalidateQueries({ queryKey: ['clientes'] })
      setShowGeoMenu(false)
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsGeoLoading(false)
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
            <div className="flex items-center gap-2">
              <p className={cn(readValueClass, 'flex-1')}>{getField('direccion') || '—'}</p>
              {getField('direccion') && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(getField('direccion') ?? '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                  title="Cómo llegar"
                >
                  <MapPin size={12} />
                  <span className="hidden sm:inline">Llegar</span>
                </a>
              )}
              {isAdmin && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowGeoMenu((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="Corregir ubicación del cliente"
                  >
                    <LocateFixed size={12} />
                    <span className="hidden sm:inline">Corregir ubicación</span>
                  </button>
                  {showGeoMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => !isGeoLoading && setShowGeoMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-20 w-60 bg-card border border-border rounded-md shadow-lg p-1">
                        <button
                          type="button"
                          onClick={() => void handleCorregirUbicacion('geocode')}
                          disabled={isGeoLoading}
                          className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent rounded-sm transition-colors disabled:opacity-50"
                        >
                          Re-geocodificar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCorregirUbicacion('limpiar')}
                          disabled={isGeoLoading}
                          className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent rounded-sm transition-colors disabled:opacity-50"
                        >
                          Usar la dirección (quitar GPS)
                        </button>
                        {isGeoLoading && (
                          <p className="px-3 py-1.5 text-xs text-muted-foreground">Procesando…</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm md:text-xs text-muted-foreground mb-1.5 md:mb-1">Localidad</label>
          {isEditing ? (
            <input
              value={getField('localidad') ?? ''}
              onChange={(e) => setField('localidad', e.target.value)}
              placeholder="Ciudad / Localidad"
              className={inputClass}
            />
          ) : (
            <p className={readValueClass}>{getField('localidad') || '—'}</p>
          )}
        </div>
        <div>
          <label className="block text-sm md:text-xs text-muted-foreground mb-1.5 md:mb-1">Provincia</label>
          {isEditing ? (
            <select
              value={getField('provincia') ?? ''}
              onChange={(e) => setField('provincia', e.target.value || null)}
              className={inputClass}
            >
              <option value="">Seleccionar provincia</option>
              <option>Buenos Aires</option>
              <option>CABA</option>
              <option>Catamarca</option>
              <option>Chaco</option>
              <option>Chubut</option>
              <option>Córdoba</option>
              <option>Corrientes</option>
              <option>Entre Ríos</option>
              <option>Formosa</option>
              <option>Jujuy</option>
              <option>La Pampa</option>
              <option>La Rioja</option>
              <option>Mendoza</option>
              <option>Misiones</option>
              <option>Neuquén</option>
              <option>Río Negro</option>
              <option>Salta</option>
              <option>San Juan</option>
              <option>San Luis</option>
              <option>Santa Cruz</option>
              <option>Santa Fe</option>
              <option>Santiago del Estero</option>
              <option>Tierra del Fuego</option>
              <option>Tucumán</option>
            </select>
          ) : (
            <p className={readValueClass}>{getField('provincia') || '—'}</p>
          )}
        </div>
      </div>

      {!isEditing && getField('geocodeStatus') === 'failed' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Sin ubicación — corregí la dirección, localidad y provincia para geocodificar.
          </p>
        </div>
      )}

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
            {territorios
              // Hide any territory whose name duplicates the blank "Sin asignar" option.
              // The legacy territory "Sin asignar" (id ed801f0e-…) is kept in the DB for
              // historical reasons but should not appear as a selectable option here.
              .filter((t) => t.nombre !== 'Sin asignar')
              .map((t) => (
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
          {/* Title row */}
          <div className="flex items-center gap-2">
            <Link href="/crm/clientes" className="p-2 -ml-2 text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">
                {cliente.nombre} {cliente.apellido}
              </h1>
              {cliente.estadoActividad && (
                <span className={cn('inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium', estadoActividadColors[cliente.estadoActividad])}>
                  {estadoActividadLabels[cliente.estadoActividad]}
                </span>
              )}
            </div>
            <button
              onClick={() => { setDeleteError(null); setShowDeleteModal(true) }}
              className="p-2 text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Más opciones"
            >
              <MoreVertical size={20} />
            </button>
          </div>

          {/* 3 primary action buttons */}
          <div className="grid grid-cols-3 gap-2">
            {cliente.telefono ? (
              <button
                onClick={() => void handleOpenInbox()}
                disabled={isOpeningInbox}
                className="flex flex-col items-center justify-center gap-1.5 py-3.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl active:bg-green-100 transition-colors disabled:opacity-60"
              >
                <MessageCircle size={22} className="text-green-600" />
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  {isOpeningInbox ? '...' : 'WhatsApp'}
                </span>
              </button>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 py-3.5 bg-muted rounded-xl opacity-40">
                <MessageCircle size={22} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">WhatsApp</span>
              </div>
            )}

            {cliente.telefono ? (
              <a
                href={`tel:${cliente.telefono}`}
                className="flex flex-col items-center justify-center gap-1.5 py-3.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl active:bg-blue-100 transition-colors"
              >
                <Phone size={22} className="text-blue-600" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Llamar</span>
              </a>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 py-3.5 bg-muted rounded-xl opacity-40">
                <Phone size={22} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Llamar</span>
              </div>
            )}

            <button
              onClick={() => setShowCreatePedido(true)}
              className="flex flex-col items-center justify-center gap-1.5 py-3.5 bg-primary text-primary-foreground rounded-xl active:bg-primary/80 transition-colors"
            >
              <Plus size={22} />
              <span className="text-xs font-medium">Pedido</span>
            </button>
          </div>

          {/* Secondary: Registrar pago — solo admin/gerente */}
          {canRegisterPago && (
            <button
              onClick={() => setShowRegistrarPago(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border border-border rounded-xl text-sm font-medium text-foreground bg-card active:bg-accent/70 transition-colors"
            >
              <CreditCard size={16} />
              Registrar pago
            </button>
          )}

          {/* Eliminar definitivamente — solo admin */}
          {isAdmin && (
            <button
              onClick={() => { setPurgeError(null); setShowPurgeModal(true) }}
              className="w-full flex items-center justify-center gap-2 py-3 border border-destructive/40 text-destructive rounded-xl text-sm font-medium bg-card active:bg-destructive/10 transition-colors"
            >
              <Trash2 size={16} />
              Eliminar definitivamente
            </button>
          )}

          {/* Saldo + ultimo pedido — info "de campo" para el vendedor */}
          {(() => {
            const saldo = parseFloat(cliente.pedidosSummary?.saldoPendiente ?? '0')
            const count = cliente.pedidosSummary?.count ?? 0
            const ultima = cliente.pedidosSummary?.ultimoPedidoFecha ?? null
            const hasSaldo = saldo > 0
            return (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => hasSaldo && canRegisterPago && setShowRegistrarPago(true)}
                  disabled={!hasSaldo || !canRegisterPago}
                  className={cn(
                    'flex flex-col items-start justify-center gap-0.5 rounded-xl p-3 text-left transition-colors',
                    hasSaldo
                      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 active:bg-red-100'
                      : 'bg-card border border-border',
                  )}
                >
                  <span className={cn(
                    'text-[11px] uppercase tracking-wide font-medium',
                    hasSaldo ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground',
                  )}>
                    {hasSaldo ? (
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle size={11} />
                        Saldo pendiente
                      </span>
                    ) : 'Saldo'}
                  </span>
                  <span className={cn(
                    'text-xl font-bold leading-none mt-0.5',
                    hasSaldo ? 'text-red-700 dark:text-red-300' : 'text-foreground',
                  )}>
                    {hasSaldo ? formatMoney(saldo) : 'Al día'}
                  </span>
                </button>
                <div className="flex flex-col items-start justify-center gap-0.5 rounded-xl p-3 bg-card border border-border">
                  <span className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
                    Último pedido
                  </span>
                  <span className="text-xl font-bold leading-none mt-0.5 text-foreground">
                    {ultima ? formatRelativeDate(ultima) : '—'}
                  </span>
                  {count > 0 && (
                    <span className="text-[11px] text-muted-foreground mt-0.5">{count} pedido{count === 1 ? '' : 's'}</span>
                  )}
                </div>
              </div>
            )
          })()}
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
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-foreground">
                  {cliente.nombre} {cliente.apellido}
                </h1>
                {cliente.estadoActividad && (
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoActividadColors[cliente.estadoActividad])}>
                    {estadoActividadLabels[cliente.estadoActividad]}
                  </span>
                )}
                {cliente.geocodeStatus === 'failed' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    <AlertTriangle size={11} />
                    Sin ubicación
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground capitalize">{cliente.origen.replace('_', ' ')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => { setDeleteError(null); setShowDeleteModal(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-destructive/50 text-destructive rounded-md text-sm font-medium hover:bg-destructive/10 transition-colors"
                title="Eliminar cliente (soft)"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => { setPurgeError(null); setShowPurgeModal(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors"
                title="Eliminar definitivamente (purge total)"
              >
                <Trash2 size={14} />
                Eliminar definitivamente
              </button>
            )}
            {canRegisterPago && (
              <button
                onClick={() => setShowRegistrarPago(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <CreditCard size={14} />
                Registrar Pago
              </button>
            )}
            {cliente.telefono ? (
              <button
                onClick={() => void handleOpenInbox()}
                disabled={isOpeningInbox}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                <MessageCircle size={14} />
                {isOpeningInbox ? 'Abriendo...' : 'WhatsApp'}
              </button>
            ) : null}
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
            <PedidosTab clienteId={id} />
            <CuentaCorrienteTab
              clienteId={id}
              clienteNombre={`${cliente.nombre} ${cliente.apellido}`}
              clienteTelefono={cliente.telefono ?? null}
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
          <PedidosTab clienteId={id} />
          <CuentaCorrienteTab
            clienteId={id}
            clienteNombre={`${cliente.nombre} ${cliente.apellido}`}
            clienteTelefono={cliente.telefono ?? null}
            showPago={showRegistrarPago}
            onClosePago={() => setShowRegistrarPago(false)}
          />
        </div>
      </div>

      {/* Mobile sticky bottom bar when editing */}
      {isEditing && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 pt-4 pb-safe flex flex-col gap-2 md:hidden z-50">
          {saveError && <p className="text-xs text-destructive text-center">{saveError}</p>}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 min-h-[44px] py-3 bg-primary text-primary-foreground rounded-xl text-base font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="flex-1 min-h-[44px] py-3 border border-border rounded-xl text-base font-medium text-foreground bg-card hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showCreatePedido && (
        <CreatePedidoModal
          clienteId={id}
          onClose={() => setShowCreatePedido(false)}
        />
      )}

      {showPurgeModal && cliente && (
        <div className="fixed inset-0 z-50 flex flex-col md:bg-black/50 md:items-center md:justify-center">
          <div className="absolute inset-0 hidden md:block" onClick={() => !isPurging && setShowPurgeModal(false)} />
          <div className="relative flex flex-col h-full w-full bg-card md:h-auto md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-sm overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
              <button onClick={() => !isPurging && setShowPurgeModal(false)} className="md:hidden p-2 -ml-2 text-muted-foreground">
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-2 flex-1">
                <Trash2 size={16} className="text-destructive shrink-0" />
                <h2 className="text-base md:text-sm font-semibold text-foreground">Eliminar definitivamente</h2>
              </div>
              <button
                onClick={() => !isPurging && setShowPurgeModal(false)}
                className="hidden md:block p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 md:flex-none overflow-y-auto p-4 space-y-3">
              <p className="text-sm text-foreground">
                ¿Eliminar permanentemente a <strong>{cliente.nombre} {cliente.apellido}</strong>?
              </p>
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive space-y-1">
                <p className="font-semibold">Se borrarán de forma permanente e irreversible:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs mt-1">
                  <li>El cliente y todos sus datos</li>
                  <li>Sus pedidos, ítems y documentos emitidos</li>
                  <li>Pagos, cuenta corriente y aplicaciones</li>
                  <li>Actividades e historial de territorio</li>
                  <li>El lead de origen (conversación, mensajes y actividad)</li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground font-medium">Esta acción NO se puede deshacer.</p>
              {purgeError && <p className="text-xs text-destructive">{purgeError}</p>}
            </div>
            <div className="p-4 border-t border-border bg-card shrink-0 flex flex-col gap-3 md:flex-row-reverse md:gap-2">
              <button
                onClick={() => void handlePurge()}
                disabled={isPurging}
                className="flex items-center justify-center gap-2 w-full md:w-auto px-4 py-3 md:py-1.5 bg-destructive text-destructive-foreground rounded-xl md:rounded-md text-base md:text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
                {isPurging ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
              <button
                onClick={() => setShowPurgeModal(false)}
                disabled={isPurging}
                className="w-full md:w-auto px-4 py-3 md:py-1.5 border border-border rounded-xl md:rounded-md text-base md:text-sm font-medium text-foreground bg-card hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (() => {
        const pedidosCount = cliente.pedidosSummary?.count ?? 0
        const saldoPendiente = parseFloat(cliente.pedidosSummary?.saldoPendiente ?? '0')
        const hasPedidos = pedidosCount > 0

        return (
          <ConfirmDeleteModal
            title="Eliminar cliente"
            description={`¿Eliminar a ${cliente.nombre} ${cliente.apellido}? Esta acción no se puede deshacer.`}
            details={
              pedidosCount > 0 || saldoPendiente > 0 ? (
                <div className="space-y-1">
                  {pedidosCount > 0 && (
                    <p className="text-sm">
                      <span className="font-medium">{pedidosCount}</span>{' '}
                      {pedidosCount === 1 ? 'pedido registrado' : 'pedidos registrados'}
                    </p>
                  )}
                  {saldoPendiente > 0 && (
                    <p className="text-sm">
                      Saldo pendiente:{' '}
                      <span className="font-medium text-destructive">{formatMoney(saldoPendiente)}</span>
                    </p>
                  )}
                </div>
              ) : undefined
            }
            confirmDisabled={hasPedidos}
            confirmDisabledReason={hasPedidos ? 'Eliminá o anulá sus pedidos primero' : undefined}
            warning={deleteError ?? undefined}
            onConfirm={handleDelete}
            onClose={() => setShowDeleteModal(false)}
            isPending={isDeleting}
          />
        )
      })()}
    </div>
  )
}
