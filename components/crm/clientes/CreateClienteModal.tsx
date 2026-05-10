'use client'

import { useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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

  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    direccion: '',
    cuit: '',
    asignadoA: '',
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
    if (!form.apellido.trim()) {
      setError('El apellido es requerido')
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
          cuit: form.cuit.trim() || undefined,
          asignadoA: form.asignadoA || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(typeof data.error === 'string' ? data.error : 'Error al crear cliente')
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
                <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Teléfono</label>
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={(e) => set('telefono', e.target.value)}
                  placeholder="+549..."
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm md:text-xs text-muted-foreground mb-1.5">Dirección</label>
              <input
                value={form.direccion}
                onChange={(e) => set('direccion', e.target.value)}
                placeholder="Calle 123, Ciudad"
                className={inputClass}
              />
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

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Footer sticky */}
          <div className="p-4 border-t border-border bg-card shrink-0">
            <button
              type="submit"
              disabled={isPending}
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
