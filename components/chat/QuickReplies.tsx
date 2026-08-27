'use client'

import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import BottomSheet from '@/components/shared/BottomSheet'
import RespuestaRapidaForm from './RespuestaRapidaForm'
import { useRespuestasRapidas } from '@/lib/inbox/use-respuestas-rapidas'
import { buscarRespuestas, reemplazarVariables, type RespuestaRapida, type VariablesRespuesta } from '@/lib/inbox/respuestas-rapidas'

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (text: string) => void
  variables?: VariablesRespuesta
}

/**
 * Respuestas rápidas en mobile: bottom sheet con la lista compartida, búsqueda
 * y alta. Al elegir una se inserta en el cuadro del chat (InboxView emite el
 * evento al composer). En desktop el equivalente es RespuestasRapidasPanel.
 */
export default function QuickReplies({ open, onClose, onSelect, variables = {} }: Props) {
  const { data: respuestas = [], isLoading } = useRespuestasRapidas()
  const [busqueda, setBusqueda] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const lista = buscarRespuestas(respuestas, busqueda)

  function handleSelect(r: RespuestaRapida) {
    onSelect(reemplazarVariables(r.body, variables))
    onClose()
  }

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Respuestas rápidas">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por comando o texto"
              className={cn(
                'w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground',
                'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>
          <button
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground min-h-[40px]"
          >
            <Plus size={14} />
            Nueva
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>
        ) : respuestas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Todavía no hay respuestas rápidas. Tocá “Nueva” para cargar la primera.
          </p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nada coincide con “{busqueda}”.</p>
        ) : (
          <div className="flex flex-col">
            {lista.map((r) => (
              <button
                key={r.id}
                onClick={() => handleSelect(r)}
                className="w-full text-left p-4 border-b border-border active:bg-accent transition-colors min-h-[56px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                    /{r.atajo}
                  </span>
                  <p className="text-sm font-medium text-foreground truncate">{r.titulo}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {reemplazarVariables(r.body, variables)}
                </p>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>

      {formOpen && <RespuestaRapidaForm onClose={() => setFormOpen(false)} />}
    </>
  )
}
