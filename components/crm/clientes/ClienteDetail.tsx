'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Plus, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import PedidosTab from './tabs/PedidosTab'
import CuentaCorrienteTab from './tabs/CuentaCorrienteTab'

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
}

type AgentOption = { id: string; name: string | null; avatarColor: string }

const inputClass = cn(
  'w-full px-3 py-1.5 text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'transition-colors duration-100',
)

export default function ClienteDetail({ id }: Props) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const queryClient = useQueryClient()

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Cliente>>({})
  const [showCreatePedido, setShowCreatePedido] = useState(false)
  const [showRegistrarPago, setShowRegistrarPago] = useState(false)

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

  function getField<K extends keyof Cliente>(key: K): Cliente[K] | undefined {
    if (key in form) return form[key] as Cliente[K]
    return cliente?.[key]
  }

  function setField<K extends keyof Cliente>(key: K, value: Cliente[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
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
    } catch {
      setSaveError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-sm text-muted-foreground">Cargando cliente...</div>
      </div>
    )
  }

  if (isError || !cliente) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-sm text-destructive">Error al cargar el cliente.</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto h-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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

      {/* Datos del cliente */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Datos del cliente</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
            <input
              value={getField('nombre') ?? ''}
              onChange={(e) => setField('nombre', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Apellido *</label>
            <input
              value={getField('apellido') ?? ''}
              onChange={(e) => setField('apellido', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Email</label>
            <input
              type="email"
              value={getField('email') ?? ''}
              onChange={(e) => setField('email', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
            <input
              type="tel"
              value={getField('telefono') ?? ''}
              onChange={(e) => setField('telefono', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Dirección</label>
            <input
              value={getField('direccion') ?? ''}
              onChange={(e) => setField('direccion', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">CUIT</label>
            <input
              value={getField('cuit') ?? ''}
              onChange={(e) => setField('cuit', e.target.value)}
              placeholder="20-12345678-9"
              className={inputClass}
            />
          </div>
        </div>

        {isAdmin && (
          <div className="max-w-xs">
            <label className="block text-xs text-muted-foreground mb-1">Asignado a</label>
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
          </div>
        )}

        {saveError && <p className="text-xs text-destructive">{saveError}</p>}

        <div className="pt-1">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* Pedidos */}
      <PedidosTab
        clienteId={id}
        showCreate={showCreatePedido}
        onCloseCreate={() => setShowCreatePedido(false)}
      />

      {/* Cuenta Corriente */}
      <CuentaCorrienteTab
        clienteId={id}
        showPago={showRegistrarPago}
        onClosePago={() => setShowRegistrarPago(false)}
      />
    </div>
  )
}
