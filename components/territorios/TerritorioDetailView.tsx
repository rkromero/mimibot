'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, AlertTriangle, Users, UserCheck, UserX,
  Pencil, Trash2, UserPlus, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import AsignarAgenteModal from './modals/AsignarAgenteModal'
import AsignarGerenteModal from './modals/AsignarGerenteModal'
import EditTerritorioModal from './modals/EditTerritorioModal'
import ConfirmBajaModal from './modals/ConfirmBajaModal'

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

type HistorialRow = {
  id: string
  clienteId: string
  territorioAnteriorId: string | null
  fecha: string
  clienteNombre: string | null
  territorioAnteriorNombre: string | null
  cambiadoPorNombre: string | null
}

function Avatar({ name, color }: { name: string | null; color: string }) {
  const initials = (name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-semibold shrink-0"
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  )
}

export default function TerritorioDetailView({ id, role }: { id: string; role: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const isAdmin = role === 'admin'
  const [showAsignarAgente, setShowAsignarAgente] = useState(false)
  const [showAsignarGerente, setShowAsignarGerente] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showBaja, setShowBaja] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'historial'>('info')

  const { data: territorio, isLoading } = useQuery<Territorio>({
    queryKey: ['territorio', id],
    queryFn: async () => {
      const res = await fetch(`/api/territorios/${id}`)
      if (!res.ok) throw new Error('Error al cargar territorio')
      return (await res.json() as { data: Territorio }).data
    },
  })

  const { data: historial = [] } = useQuery<HistorialRow[]>({
    queryKey: ['territorio-historial', id],
    queryFn: async () => {
      const res = await fetch(`/api/territorios/${id}/historial`)
      if (!res.ok) return []
      return (await res.json() as { data: HistorialRow[] }).data
    },
    enabled: activeTab === 'historial',
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['territorio', id] })
    void qc.invalidateQueries({ queryKey: ['territorios'] })
  }

  const handleQuitarGerente = async (gerenteId: string) => {
    await fetch(`/api/territorios/${id}/gerentes/${gerenteId}`, { method: 'DELETE' })
    invalidate()
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-32 bg-muted rounded" />
      </div>
    )
  }

  if (!territorio) {
    return (
      <div className="p-6 text-muted-foreground text-sm">Territorio no encontrado.</div>
    )
  }

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-5 max-w-3xl">
        {/* Back + header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
                {territorio.nombre}
                {territorio.esLegacy && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-medium">
                    Legacy
                  </span>
                )}
              </h1>
              {territorio.descripcion && (
                <p className="text-sm text-muted-foreground mt-0.5">{territorio.descripcion}</p>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Pencil size={13} />
                <span className="hidden md:inline">Editar</span>
              </button>
              {!territorio.esLegacy && (
                <button
                  onClick={() => setShowBaja(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 border border-destructive/30 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={13} />
                  <span className="hidden md:inline">Dar de baja</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sin agente alert */}
        {territorio.sinAgente && !territorio.esLegacy && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>Este territorio no tiene agente asignado. Los clientes no tienen vendedor activo.</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border gap-0">
          {(['info', 'historial'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px capitalize',
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'info' ? 'Información' : 'Historial de cambios'}
            </button>
          ))}
        </div>

        {activeTab === 'info' && (
          <div className="space-y-5">
            {/* Métricas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{territorio.cantClientes}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Clientes</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {territorio.agente ? '1' : '0'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Agente activo</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{territorio.gerentes.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Gerentes</p>
              </div>
            </div>

            {/* Agente */}
            <Section title="Agente asignado">
              <div className="bg-card border border-border rounded-lg p-3">
                {territorio.agente ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={territorio.agente.name} color={territorio.agente.avatarColor} />
                      <span className="text-sm font-medium text-foreground">
                        {territorio.agente.name ?? 'Sin nombre'}
                      </span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowAsignarAgente(true)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        >
                          <UserCheck size={13} />
                          Cambiar
                        </button>
                        <button
                          onClick={async () => {
                            await fetch(`/api/territorios/${id}/agente`, { method: 'DELETE' })
                            invalidate()
                          }}
                          className="text-xs text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1"
                        >
                          <UserX size={13} />
                          Quitar
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground italic">Sin agente asignado</span>
                    {isAdmin && (
                      <button
                        onClick={() => setShowAsignarAgente(true)}
                        className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                      >
                        <UserPlus size={13} />
                        Asignar agente
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Section>

            {/* Gerentes */}
            <Section title="Gerentes">
              <div className="bg-card border border-border rounded-lg divide-y divide-border">
                {territorio.gerentes.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground italic">Sin gerentes asignados</div>
                ) : (
                  territorio.gerentes.map((g) => (
                    <div key={g.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={g.name} color={g.avatarColor} />
                        <span className="text-sm font-medium text-foreground">{g.name ?? 'Sin nombre'}</span>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleQuitarGerente(g.id)}
                          className="text-xs text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1"
                        >
                          <UserX size={13} />
                          Quitar
                        </button>
                      )}
                    </div>
                  ))
                )}
                {isAdmin && (
                  <div className="p-2">
                    <button
                      onClick={() => setShowAsignarGerente(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
                    >
                      <UserPlus size={13} />
                      Agregar gerente
                    </button>
                  </div>
                )}
              </div>
            </Section>
          </div>
        )}

        {activeTab === 'historial' && (
          <div className="space-y-2">
            {historial.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                <Clock size={28} strokeWidth={1.5} />
                <p className="text-sm">Sin movimientos registrados</p>
              </div>
            ) : (
              historial.map((h) => (
                <div key={h.id} className="bg-card border border-border rounded-lg p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-foreground font-medium">
                      {h.clienteNombre ?? 'Cliente'}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(h.fecha).toLocaleDateString('es-AR', {
                        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Desde: {h.territorioAnteriorNombre ?? 'Sin territorio'} · Por: {h.cambiadoPorNombre ?? 'Sistema'}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showAsignarAgente && (
        <AsignarAgenteModal
          territorioId={id}
          onClose={() => setShowAsignarAgente(false)}
          onDone={() => { setShowAsignarAgente(false); invalidate() }}
        />
      )}
      {showAsignarGerente && (
        <AsignarGerenteModal
          territorioId={id}
          onClose={() => setShowAsignarGerente(false)}
          onDone={() => { setShowAsignarGerente(false); invalidate() }}
        />
      )}
      {showEdit && territorio && (
        <EditTerritorioModal
          territorio={territorio}
          onClose={() => setShowEdit(false)}
          onDone={() => { setShowEdit(false); invalidate() }}
        />
      )}
      {showBaja && (
        <ConfirmBajaModal
          territorioId={id}
          nombre={territorio.nombre}
          onClose={() => setShowBaja(false)}
          onDone={() => router.replace('/territorios')}
        />
      )}
    </div>
  )
}
