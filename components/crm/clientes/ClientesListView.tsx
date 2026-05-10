'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search, Plus, Phone, ChevronRight } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import CreateClienteModal from './CreateClienteModal'

type Cliente = {
  id: string
  nombre: string
  apellido: string
  email: string | null
  telefono: string | null
  cuit: string | null
  origen: 'manual' | 'convertido_de_lead'
  asignadoA: string | null
  asignadoNombre: string | null
  asignadoColor: string | null
  saldoPendiente?: string | null
  createdAt: string
}

const origenLabels: Record<string, string> = {
  manual: 'Manual',
  convertido_de_lead: 'Lead',
}
const origenColors: Record<string, string> = {
  manual: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  convertido_de_lead: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
}

export default function ClientesListView() {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ['clientes'],
    queryFn: async () => {
      const res = await fetch('/api/clientes')
      if (!res.ok) throw new Error('Error al cargar clientes')
      const json = await res.json() as { data: Cliente[] }
      return json.data
    },
    staleTime: 30_000,
  })

  const filtered = clientes.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.nombre.toLowerCase().includes(q) ||
      c.apellido.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.cuit ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl font-semibold text-foreground">Clientes</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            Agregar Cliente
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email, CUIT..."
            className="w-full md:max-w-sm pl-10 pr-3 py-2.5 md:py-1.5 border border-border rounded-lg text-[16px] md:text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Mobile: cards */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Cargando clientes...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {search ? 'Sin resultados' : 'No hay clientes registrados'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((c) => {
                const saldo = c.saldoPendiente ? parseFloat(c.saldoPendiente) : 0
                return (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/crm/clientes/${c.id}`)}
                    className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 active:bg-accent/60 cursor-pointer transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-base truncate">
                        {c.nombre} {c.apellido}
                      </p>
                      {c.telefono && (
                        <a
                          href={`tel:${c.telefono}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-sm text-primary mt-0.5 w-fit"
                        >
                          <Phone size={13} />
                          {c.telefono}
                        </a>
                      )}
                      {saldo > 0 && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                          Debe: ${saldo.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground shrink-0" />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Cargando clientes...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {search ? 'Sin resultados para la búsqueda' : 'No hay clientes registrados'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Nombre</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Email</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Teléfono</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Origen</th>
                  {isAdmin && (
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Asignado a</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/crm/clientes/${c.id}`)}
                    className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-medium text-foreground">
                      {c.nombre} {c.apellido}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.email ?? '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.telefono ?? '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', origenColors[c.origen])}>
                        {origenLabels[c.origen]}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {c.asignadoNombre ? (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-5 h-5 rounded-full inline-flex items-center justify-center text-white text-xs shrink-0"
                              style={{ backgroundColor: c.asignadoColor ?? '#6b7280' }}
                            >
                              {(c.asignadoNombre ?? '?')[0]?.toUpperCase()}
                            </span>
                            {c.asignadoNombre}
                          </span>
                        ) : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-[76px] right-4 z-30 flex items-center gap-2 h-14 rounded-full bg-primary text-primary-foreground shadow-lg px-5 md:hidden active:scale-95 transition-transform"
        aria-label="Agregar cliente"
      >
        <Plus size={20} strokeWidth={2} />
        <span className="text-sm font-semibold pr-1">Cliente</span>
      </button>

      {showCreate && <CreateClienteModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
