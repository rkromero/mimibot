'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'

type Props = {
  onClose: () => void
}

type AgentOption = {
  id: string
  name: string | null
  avatarColor: string
}

const inputClass = cn(
  'w-full px-3 py-1.5 text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

export default function CreateClienteModal({ onClose }: Props) {
  const queryClient = useQueryClient()
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

      void queryClient.invalidateQueries({ queryKey: ['clientes'] })
      onClose()
    } catch {
      setError('Error de conexión')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="relative bg-card border border-border rounded-lg p-6 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Nuevo Cliente</h2>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
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
              <label className="block text-xs text-muted-foreground mb-1">Apellido *</label>
              <input
                required
                value={form.apellido}
                onChange={(e) => set('apellido', e.target.value)}
                placeholder="Apellido"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="email@ejemplo.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
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
            <label className="block text-xs text-muted-foreground mb-1">Dirección</label>
            <input
              value={form.direccion}
              onChange={(e) => set('direccion', e.target.value)}
              placeholder="Calle 123, Ciudad"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">CUIT</label>
              <input
                value={form.cuit}
                onChange={(e) => set('cuit', e.target.value)}
                placeholder="20-12345678-9"
                className={inputClass}
              />
            </div>
            {isAdmin && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Asignar a</label>
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

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Guardando...' : 'Crear Cliente'}
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
