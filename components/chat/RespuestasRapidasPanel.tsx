'use client'

import { useState } from 'react'
import { Zap, Plus, Search, Send, Pencil, Trash2, PanelRightClose } from 'lucide-react'
import { cn } from '@/lib/utils'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import { useToast } from '@/components/shared/ToastProvider'
import RespuestaRapidaForm from './RespuestaRapidaForm'
import { useRespuestasRapidas, useEliminarRespuestaRapida } from '@/lib/inbox/use-respuestas-rapidas'
import { buscarRespuestas, reemplazarVariables, type RespuestaRapida, type VariablesRespuesta } from '@/lib/inbox/respuestas-rapidas'
import { emitirInsertarTexto, emitirEnviarTexto } from '@/lib/inbox/composer-events'

type Props = {
  conversationId: string
  variables: VariablesRespuesta
  abierto: boolean
  onToggle: () => void
  className?: string
}

/**
 * Columna al lado de la conversación con las respuestas rápidas del equipo:
 * buscar, insertar en el cuadro (click), enviar directo (ícono), y el ABM
 * (nueva / editar / borrar). Se puede plegar a una tira angosta.
 */
export default function RespuestasRapidasPanel({ conversationId, variables, abierto, onToggle, className }: Props) {
  const toast = useToast()
  const { data: respuestas = [], isLoading, isError } = useRespuestasRapidas()
  const eliminar = useEliminarRespuestaRapida()

  const [busqueda, setBusqueda] = useState('')
  const [formulario, setFormulario] = useState<{ abierto: boolean; inicial: RespuestaRapida | null }>({ abierto: false, inicial: null })
  const [aBorrar, setABorrar] = useState<RespuestaRapida | null>(null)

  const lista = buscarRespuestas(respuestas, busqueda)

  function insertar(r: RespuestaRapida) {
    emitirInsertarTexto({ conversationId, text: reemplazarVariables(r.body, variables) })
  }

  function enviar(r: RespuestaRapida) {
    emitirEnviarTexto({ conversationId, text: reemplazarVariables(r.body, variables) })
  }

  async function confirmarBorrado() {
    if (!aBorrar) return
    try {
      await eliminar.mutateAsync(aBorrar.id)
      toast.success(`Respuesta /${aBorrar.atajo} eliminada`)
      setABorrar(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la respuesta rápida')
    }
  }

  // Cerrado: no ocupa lugar; se vuelve a abrir con el botón ⚡ de la
  // cabecera "Conversación" del chat.
  if (!abierto) return null

  return (
    <div className={cn('flex-col w-64 shrink-0 border-l border-border bg-background min-h-0', className)}>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 h-12 border-b border-border shrink-0">
        <Zap size={14} className="text-primary shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1 truncate">Respuestas rápidas</span>
        <button
          onClick={() => setFormulario({ abierto: true, inicial: null })}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Nueva respuesta rápida"
          aria-label="Nueva respuesta rápida"
        >
          <Plus size={16} />
        </button>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Ocultar panel"
          aria-label="Ocultar panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Búsqueda */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por comando o texto"
            className={cn(
              'w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-border bg-background text-foreground',
              'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <p className="px-3 py-6 text-xs text-muted-foreground text-center">Cargando…</p>
        ) : isError ? (
          <p className="px-3 py-6 text-xs text-destructive text-center">No se pudieron cargar las respuestas.</p>
        ) : respuestas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <p className="text-xs text-muted-foreground">
              Todavía no hay respuestas rápidas. Cargá las que más usás y mandalas en un click o con su comando.
            </p>
            <button
              onClick={() => setFormulario({ abierto: true, inicial: null })}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus size={13} />
              Crear la primera
            </button>
          </div>
        ) : lista.length === 0 ? (
          <p className="px-3 py-6 text-xs text-muted-foreground text-center">Nada coincide con “{busqueda}”.</p>
        ) : (
          lista.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => insertar(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  insertar(r)
                }
              }}
              title="Insertar en el cuadro de texto"
              className="group flex flex-col gap-1 px-3 py-2.5 border-b border-border cursor-pointer hover:bg-accent/50 focus:outline-none focus:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                  /{r.atajo}
                </span>
                <span className="text-xs font-medium text-foreground truncate flex-1">{r.titulo}</span>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); enviar(r) }}
                    className="p-1 rounded text-primary hover:bg-primary/10"
                    title="Enviar ahora por WhatsApp"
                    aria-label={`Enviar /${r.atajo}`}
                  >
                    <Send size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFormulario({ abierto: true, inicial: r }) }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                    title="Editar"
                    aria-label={`Editar /${r.atajo}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setABorrar(r) }}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Eliminar"
                    aria-label={`Eliminar /${r.atajo}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">
                {reemplazarVariables(r.body, variables)}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground leading-snug">
          Click para insertar en el cuadro · <Send size={9} className="inline" /> para enviar directo · escribí{' '}
          <span className="font-mono">/</span> en el chat para buscar por comando.
        </p>
      </div>

      {formulario.abierto && (
        <RespuestaRapidaForm
          inicial={formulario.inicial}
          onClose={() => setFormulario({ abierto: false, inicial: null })}
          onSaved={(r) => toast.success(formulario.inicial ? `Respuesta /${r.atajo} actualizada` : `Respuesta /${r.atajo} creada`)}
        />
      )}

      {aBorrar && (
        <ConfirmDeleteModal
          title="Eliminar respuesta rápida"
          description={`Se va a eliminar “${aBorrar.titulo}” (/${aBorrar.atajo}). Esta acción no se puede deshacer.`}
          onConfirm={() => void confirmarBorrado()}
          onClose={() => setABorrar(null)}
          isPending={eliminar.isPending}
        />
      )}
    </div>
  )
}
