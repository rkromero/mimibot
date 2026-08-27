'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { reemplazarVariables, type RespuestaRapida, type VariablesRespuesta } from '@/lib/inbox/respuestas-rapidas'

type Props = {
  /** Lo tipeado después de la barra ("" cuando solo escribió "/") */
  consulta: string
  opciones: RespuestaRapida[]
  /** Índice de la opción resaltada (navegación con flechas) */
  activo: number
  variables: VariablesRespuesta
  hayRespuestas: boolean
  onElegir: (r: RespuestaRapida) => void
  onActivo: (i: number) => void
}

/**
 * Sugerencias que aparecen sobre el cuadro de texto cuando se escribe "/".
 * El teclado (flechas, Enter, Esc) lo maneja ChatComposer; acá sólo se pinta
 * la lista y se responde al mouse.
 */
export default function ComandoRespuestas({
  consulta,
  opciones,
  activo,
  variables,
  hayRespuestas,
  onElegir,
  onActivo,
}: Props) {
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>('[data-activo="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  return (
    <div
      role="listbox"
      aria-label="Respuestas rápidas"
      className="absolute bottom-full left-0 right-0 mb-1 z-20 rounded-md border border-border bg-card shadow-lg overflow-hidden"
    >
      {opciones.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          {!hayRespuestas
            ? 'Todavía no hay respuestas rápidas. Cargalas desde el panel "Respuestas rápidas".'
            : `Ninguna respuesta coincide con /${consulta}`}
        </p>
      ) : (
        <div ref={listaRef} className="max-h-64 overflow-y-auto">
          {opciones.map((r, i) => {
            const esActivo = i === activo
            return (
              <div
                key={r.id}
                role="option"
                aria-selected={esActivo}
                data-activo={esActivo ? 'true' : 'false'}
                // onMouseDown para que el textarea no pierda el foco antes del click
                onMouseDown={(e) => {
                  e.preventDefault()
                  onElegir(r)
                }}
                onMouseEnter={() => onActivo(i)}
                className={cn(
                  'flex flex-col gap-0.5 px-3 py-2 cursor-pointer border-b border-border last:border-b-0',
                  esActivo ? 'bg-accent' : 'hover:bg-accent/50',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                    /{r.atajo}
                  </span>
                  <span className="text-sm font-medium text-foreground truncate">{r.titulo}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {reemplazarVariables(r.body, variables)}
                </p>
              </div>
            )
          })}
        </div>
      )}
      <div className="px-3 py-1.5 border-t border-border bg-muted/40 text-[10px] text-muted-foreground">
        ↑↓ elegir · Enter insertar · Esc cerrar
      </div>
    </div>
  )
}
