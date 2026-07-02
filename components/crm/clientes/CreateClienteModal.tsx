'use client'

import { useState } from 'react'
import { X, ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { esRolTipoAgent } from '@/lib/authz/roles'
import { esProvinciaCABA, LOCALIDAD_CABA } from '@/lib/validations/clientes'

type Props = {
  onClose: () => void
}

type AgentOption = {
  id: string
  name: string | null
  avatarColor: string
}

const inputClass = cn(
  'w-full px-3 py-3 md:py-1.5 text-[16px] md:text-sm rounded-lg md:rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

export default function CreateClienteModal({ onClose }: Props) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const isAgent = esRolTipoAgent(session?.user?.role)

  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cliente existente devuelto por el 409 de CUIT duplicado — permite abrirlo
  const [conflicto, setConflicto] = useState<{ id: string; nombre: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ telefono?: string; barrio?: string }>({})
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    direccion: '',
    localidad: '',
    barrio: '',
    provincia: '',
    codigoPostal: '',
    cuit: '',
    asignadoA: '',
  })

  const esCABA = esProvinciaCABA(form.provincia)
  const [isSugiriendo, setIsSugiriendo] = useState(false)

  // Best-effort: sugiere barrio y CP vía geocoder. Se dispara al salir del campo
  // Dirección con CABA elegida, Y al elegir CABA con la dirección ya cargada
  // (overrides trae la provincia recién seleccionada, que aún no está en form).
  // Solo completa campos vacíos (nunca pisa lo que tipeó el usuario).
  async function sugerirDesdeDireccion(overrides?: { provincia?: string; localidad?: string }) {
    const provincia = overrides?.provincia ?? form.provincia
    const localidad = overrides?.localidad ?? form.localidad
    const direccion = form.direccion.trim()
    if (!direccion || !esProvinciaCABA(provincia)) return
    if (form.barrio.trim() && form.codigoPostal.trim()) return
    setIsSugiriendo(true)
    try {
      const params = new URLSearchParams({ direccion })
      if (provincia) params.set('provincia', provincia)
      if (localidad.trim()) params.set('localidad', localidad.trim())
      const res = await fetch(`/api/geo/sugerir-direccion?${params.toString()}`)
      if (!res.ok) return
      const sug = await res.json() as { barrio: string | null; codigoPostal: string | null }
      // La condición "campo vacío" se evalúa al llegar la respuesta, así una
      // respuesta lenta no pisa algo tipeado mientras tanto.
      setForm((prev) => ({
        ...prev,
        barrio: prev.barrio.trim() ? prev.barrio : (sug.barrio ?? prev.barrio),
        codigoPostal: prev.codigoPostal.trim() ? prev.codigoPostal : (sug.codigoPostal ?? prev.codigoPostal),
      }))
      if (sug.barrio) setFieldErrors((p) => ({ ...p, barrio: undefined }))
    } catch {
      // best-effort: el usuario completa a mano
    } finally {
      setIsSugiriendo(false)
    }
  }

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

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setConflicto(null)
    setFieldErrors({})

    if (!form.nombre.trim()) {
      setError('El nombre es requerido')
      return
    }
    if (!form.apellido.trim()) {
      setError('El apellido es requerido')
      return
    }

    const fe: { telefono?: string; barrio?: string } = {}
    if (isAgent && !form.telefono.trim()) {
      fe.telefono = 'El teléfono es requerido'
    }
    if (esCABA && !form.barrio.trim()) {
      fe.barrio = 'El barrio es obligatorio para clientes de CABA'
    }
    if (fe.telefono ?? fe.barrio) {
      setFieldErrors(fe)
      return
    }

    setIsPending(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          email: form.email.trim() || undefined,
          telefono: form.telefono.trim() || undefined,
          direccion: form.direccion.trim() || undefined,
          localidad: form.localidad.trim() || undefined,
          barrio: form.barrio.trim() || undefined,
          provincia: form.provincia || undefined,
          codigoPostal: form.codigoPostal.trim() || undefined,
          cuit: form.cuit.trim() || undefined,
          asignadoA: form.asignadoA || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string; clienteExistente?: { id: string; nombre: string } }
        setError(typeof data.error === 'string' ? data.error : 'Error al crear cliente')
        setConflicto(data.clienteExistente ?? null)
        return
      }

      const data = await res.json() as { data: { id: string } }
      void queryClient.invalidateQueries({ queryKey: ['clientes'] })
      router.push(`/crm/clientes/${data.data.id}`)
    } catch {
      setError('Error de conexión')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:bg-black/50 md:items-center md:justify-center">
      {/* Backdrop desktop */}
      <div className="absolute inset-0 hidden md:block" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex flex-col h-full w-full bg-card md:h-auto md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-lg md:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
          <button onClick={onClose} className="md:hidden p-2 -ml-2 text-muted-foreground">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base md:text-sm font-semibold text-foreground flex-1">Nuevo Cliente</h2>
          <button onClick={onClose} className="hidden md:block p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Form scrollable */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 md:flex-none overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Nombre *</label>
                <input
                  autoFocus
                  required
                  value={form.nombre}
                  onChange={(e) => set('nombre', e.target.value)}
                  placeholder="Nombre"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Apellido *</label>
                <input
                  required
                  value={form.apellido}
                  onChange={(e) => set('apellido', e.target.value)}
                  placeholder="Apellido"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="email@ejemplo.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">
                  Teléfono {isAgent && <span className="text-destructive">*</span>}
                </label>
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={(e) => { set('telefono', e.target.value); setFieldErrors((p) => ({ ...p, telefono: undefined })) }}
                  placeholder="+549..."
                  className={cn(inputClass, fieldErrors.telefono && 'border-destructive focus:ring-destructive/50')}
                />
                {fieldErrors.telefono && <p className="text-xs text-destructive mt-1">{fieldErrors.telefono}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Dirección</label>
              <input
                value={form.direccion}
                onChange={(e) => set('direccion', e.target.value)}
                onBlur={() => void sugerirDesdeDireccion()}
                placeholder="Calle 123"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Localidad</label>
                <input
                  value={form.localidad}
                  onChange={(e) => set('localidad', e.target.value)}
                  placeholder="Ciudad / Localidad"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm md:text-xs text-muted-foreground mb-1.5">
                  Barrio {esCABA && <span className="text-destructive">*</span>}
                  {isSugiriendo && <Loader2 size={11} className="animate-spin" />}
                </label>
                <input
                  value={form.barrio}
                  onChange={(e) => { set('barrio', e.target.value); setFieldErrors((p) => ({ ...p, barrio: undefined })) }}
                  placeholder={esCABA ? 'Ej: Palermo, Caballito...' : 'Barrio (opcional)'}
                  className={cn(inputClass, fieldErrors.barrio && 'border-destructive focus:ring-destructive/50')}
                />
                {fieldErrors.barrio && <p className="text-xs text-destructive mt-1">{fieldErrors.barrio}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Provincia</label>
                <select
                  value={form.provincia}
                  onChange={(e) => {
                    const provincia = e.target.value
                    setForm((prev) => ({
                      ...prev,
                      provincia,
                      // CABA: la localidad se autocompleta con la ciudad (editable)
                      localidad: esProvinciaCABA(provincia) ? LOCALIDAD_CABA : prev.localidad,
                    }))
                    // Si la dirección ya está cargada, sugerir barrio/CP ahora
                    if (esProvinciaCABA(provincia)) {
                      void sugerirDesdeDireccion({ provincia, localidad: LOCALIDAD_CABA })
                    }
                  }}
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
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm md:text-xs text-muted-foreground mb-1.5">
                  Código Postal
                  {isSugiriendo && <Loader2 size={11} className="animate-spin" />}
                </label>
                <input
                  inputMode="numeric"
                  value={form.codigoPostal}
                  onChange={(e) => set('codigoPostal', e.target.value)}
                  placeholder="1234 (opcional)"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">CUIT</label>
                <input
                  inputMode="numeric"
                  value={form.cuit}
                  onChange={(e) => set('cuit', e.target.value)}
                  placeholder="20-12345678-9"
                  className={inputClass}
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Asignar a</label>
                  <select
                    value={form.asignadoA}
                    onChange={(e) => set('asignadoA', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Sin asignar</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name ?? a.id}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive">
                {error}
                {conflicto && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => router.push(`/crm/clientes/${conflicto.id}`)}
                      className="underline font-medium hover:text-destructive/80 transition-colors"
                    >
                      Ver {conflicto.nombre}
                    </button>
                  </>
                )}
              </p>
            )}
          </div>

          {/* Footer sticky */}
          <div className="p-4 border-t border-border bg-card shrink-0">
            <button
              type="submit"
              disabled={isPending || (isAgent && !form.telefono.trim())}
              className="w-full py-3 md:py-2 bg-primary text-primary-foreground rounded-lg md:rounded-md text-base md:text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Guardando...' : 'Crear Cliente'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="hidden md:block w-full mt-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
