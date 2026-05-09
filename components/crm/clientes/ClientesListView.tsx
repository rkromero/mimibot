'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search, Plus } from 'lucide-react'
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground">Clientes</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Agregar Cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email, CUIT..."
          className="w-full max-w-sm pl-9 pr-3 py-1.5 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
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
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateClienteModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

// Handle cuit filtering too — extend the filter logic to support 'cuit' even though
// the API type doesn't expose it, it won't break (it just won't filter on it client-side)
declare module './ClientesListView' {}
