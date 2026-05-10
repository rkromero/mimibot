'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Plus, Phone, Mail, MapPin, FileText, CheckSquare, CheckCircle2, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import ActividadModal from './ActividadModal'

type Actividad = {
  id: string
  tipo: 'visita' | 'llamada' | 'email' | 'nota' | 'tarea'
  titulo: string
  notas: string | null
  estado: 'pendiente' | 'completada' | 'cancelada'
  fechaProgramada: string | null
  fechaCompletada: string | null
  asignadoA: string | null
  asignadoNombre: string | null
  asignadoColor: string | null
  creadoPor: string
  createdAt: string
}

type AgentOption = { id: string; name: string | null; avatarColor: string }

type Props = {
  clienteId: string
  asignadoA: string | null
  agents: AgentOption[]
}

const TIPO_CONFIG = {
  visita: { label: 'Visita', icon: MapPin, color: 'text-purple-600' },
  llamada: { label: 'Llamada', icon: Phone, color: 'text-blue-600' },
  email: { label: 'Email', icon: Mail, color: 'text-cyan-600' },
  nota: { label: 'Nota', icon: FileText, color: 'text-gray-500' },
  tarea: { label: 'Tarea', icon: CheckSquare, color: 'text-orange-600' },
}

function ActividadRow({
  actividad,
  onComplete,
  completing,
}: {
  actividad: Actividad
  onComplete: (id: string) => void
  completing: string | null
}) {
  const config = TIPO_CONFIG[actividad.tipo]
  const Icon = config.icon

  const fecha = actividad.fechaProgramada ? new Date(actividad.fechaProgramada) : null
  const vencida = fecha && isPast(fecha) && !isToday(fecha) && actividad.estado === 'pendiente'

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className={cn('mt-0.5 shrink-0', config.color)}>
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium text-foreground', actividad.estado === 'completada' && 'line-through text-muted-foreground')}>
          {actividad.titulo}
        </p>
        {actividad.notas && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{actividad.notas}</p>
        )}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {fecha && (
            <span className={cn('text-xs flex items-center gap-1', vencida ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
              <Clock size={11} />
              {format(fecha, "d MMM yyyy 'a las' HH:mm", { locale: es })}
              {vencida && ' · vencida'}
            </span>
          )}
          {actividad.asignadoNombre && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span
                className="w-4 h-4 rounded-full inline-flex items-center justify-center text-white text-[10px] shrink-0"
                style={{ backgroundColor: actividad.asignadoColor ?? '#6b7280' }}
              >
                {actividad.asignadoNombre[0]?.toUpperCase()}
              </span>
              {actividad.asignadoNombre}
            </span>
          )}
          {actividad.estado === 'completada' && actividad.fechaCompletada && (
            <span className="text-xs text-green-600">
              Completada {format(new Date(actividad.fechaCompletada), "d MMM", { locale: es })}
            </span>
          )}
        </div>
      </div>
      {actividad.estado === 'pendiente' && (
        <button
          onClick={() => onComplete(actividad.id)}
          disabled={completing === actividad.id}
          title="Marcar como completada"
          className="shrink-0 p-1 text-muted-foreground hover:text-green-600 transition-colors disabled:opacity-50"
        >
          <CheckCircle2 size={16} />
        </button>
      )}
    </div>
  )
}

export default function ActividadesSection({ clienteId, asignadoA, agents }: Props) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)
  const [showHistorial, setShowHistorial] = useState(false)

  const { data: actividades = [], isLoading } = useQuery<Actividad[]>({
    queryKey: ['clientes', clienteId, 'actividades'],
    queryFn: async () => {
      const res = await fetch(`/api/clientes/${clienteId}/actividades`)
      if (!res.ok) throw new Error('Error al cargar actividades')
      const json = await res.json() as { data: Actividad[] }
      return json.data
    },
    staleTime: 30_000,
  })

  async function handleComplete(id: string) {
    setCompleting(id)
    try {
      const res = await fetch(`/api/actividades/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'completada' }),
      })
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['clientes', clienteId, 'actividades'] })
      }
    } finally {
      setCompleting(null)
    }
  }

  const proximas = actividades.filter((a) => a.estado === 'pendiente')
  const historial = actividades.filter((a) => a.estado !== 'pendiente')

  // Sort próximas: con fecha primero (ASC), luego sin fecha
  proximas.sort((a, b) => {
    if (!a.fechaProgramada && !b.fechaProgramada) return 0
    if (!a.fechaProgramada) return 1
    if (!b.fechaProgramada) return -1
    return new Date(a.fechaProgramada).getTime() - new Date(b.fechaProgramada).getTime()
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          Actividades
          {proximas.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {proximas.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Plus size={13} />
          Nueva
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Cargando actividades...</div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Próximas */}
          {proximas.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Sin actividades pendientes
            </div>
          ) : (
            <div className="px-4">
              {proximas.map((a) => (
                <ActividadRow key={a.id} actividad={a} onComplete={handleComplete} completing={completing} />
              ))}
            </div>
          )}

          {/* Historial colapsable */}
          {historial.length > 0 && (
            <>
              <button
                onClick={() => setShowHistorial((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors border-t border-border"
              >
                <span>Historial ({historial.length})</span>
                {showHistorial ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {showHistorial && (
                <div className="px-4 border-t border-border">
                  {historial.map((a) => (
                    <ActividadRow key={a.id} actividad={a} onComplete={handleComplete} completing={completing} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showCreate && (
        <ActividadModal
          clienteId={clienteId}
          agents={agents}
          defaultAsignadoA={isAdmin ? asignadoA : (session?.user?.id ?? null)}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['clientes', clienteId, 'actividades'] })
          }}
        />
      )}
    </div>
  )
}
