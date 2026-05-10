'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus, Search, AlertTriangle, Users, ChevronRight, Map } from 'lucide-react'
import { cn } from '@/lib/utils'
import CreateTerritorioModal from './modals/CreateTerritorioModal'

type Territorio = {
  id: string
  nombre: string
  descripcion: string | null
  activo: boolean
  esLegacy: boolean
  sinAgente: boolean
  agente: { id: string; name: string | null; avatarColor: string } | null
  gerentes: { id: string; name: string | null; avatarColor: string }[]
  cantClientes: number
}

function Avatar({ name, color }: { name: string | null; color: string }) {
  const initials = (name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[10px] font-semibold shrink-0"
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  )
}

export default function TerritoriosListView({ role }: { role: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const isAdmin = role === 'admin'
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data: territorios = [], isLoading } = useQuery<Territorio[]>({
    queryKey: ['territorios'],
    queryFn: async () => {
      const res = await fetch('/api/territorios')
      if (!res.ok) throw new Error('Error al cargar territorios')
      return (await res.json() as { data: Territorio[] }).data
    },
    staleTime: 30_000,
  })

  const filtered = territorios.filter((t) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      t.nombre.toLowerCase().includes(q) ||
      (t.descripcion ?? '').toLowerCase().includes(q) ||
      (t.agente?.name ?? '').toLowerCase().includes(q)
    )
  })

  const sinAgente = territorios.filter((t) => t.sinAgente && !t.esLegacy)

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground">Territorios</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isAdmin ? 'Todos los territorios del sistema' : 'Territorios bajo tu gestión'}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/admin/territorios/reasignacion')}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Users size={14} />
                Reasignar clientes
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                <span className="hidden md:inline">Nuevo territorio</span>
                <span className="md:hidden">Nuevo</span>
              </button>
            </div>
          )}
        </div>

        {/* Alertas sin agente */}
        {sinAgente.length > 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              {sinAgente.length === 1
                ? `El territorio "${sinAgente[0]!.nombre}" no tiene agente asignado.`
                : `${sinAgente.length} territorios no tienen agente asignado: ${sinAgente.map((t) => t.nombre).join(', ')}.`}
            </span>
          </div>
        )}

        {/* Búsqueda */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, agente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Listado */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Map size={32} strokeWidth={1.5} />
            <p className="text-sm">
              {search ? 'Sin resultados para tu búsqueda' : 'No hay territorios aún'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(`/territorios/${t.id}`)}
                className="w-full text-left bg-card border border-border rounded-lg p-3 md:p-4 hover:bg-accent/50 transition-colors flex items-center gap-3"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{t.nombre}</span>
                    {t.esLegacy && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-medium shrink-0">
                        Legacy
                      </span>
                    )}
                    {t.sinAgente && !t.esLegacy && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded font-medium shrink-0 flex items-center gap-1">
                        <AlertTriangle size={9} />
                        Sin agente
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {t.agente ? (
                      <span className="flex items-center gap-1">
                        <Avatar name={t.agente.name} color={t.agente.avatarColor} />
                        {t.agente.name ?? 'Agente'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60 italic">Sin agente</span>
                    )}
                    <span className="text-muted-foreground/40">·</span>
                    <span>{t.cantClientes} cliente{t.cantClientes !== 1 ? 's' : ''}</span>
                    {t.gerentes.length > 0 && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span>{t.gerentes.length} gerente{t.gerentes.length !== 1 ? 's' : ''}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight size={15} className="text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTerritorioModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            void qc.invalidateQueries({ queryKey: ['territorios'] })
          }}
        />
      )}
    </div>
  )
}
