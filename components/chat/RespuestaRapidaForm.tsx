'use client'

import { useRef, useState } from 'react'
import { ArrowLeft, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGuardarRespuestaRapida } from '@/lib/inbox/use-respuestas-rapidas'
import { VARIABLES_RESPUESTA, type RespuestaRapida } from '@/lib/inbox/respuestas-rapidas'
import { normalizarAtajo, ATAJO_MAX, TITULO_MAX, BODY_MAX } from '@/lib/validations/respuesta-rapida'

type Props = {
  /** Si viene, el formulario edita esa respuesta; si no, crea una nueva. */
  inicial?: RespuestaRapida | null
  onClose: () => void
  onSaved?: (respuesta: RespuestaRapida) => void
}

const inputCls = cn(
  'w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground',
  'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
)

/**
 * Alta / edición de una respuesta rápida: comando, título y texto. Pantalla
 * completa en mobile, tarjeta centrada en desktop (mismo patrón que
 * ConfirmDeleteModal). Va por encima del BottomSheet (z-50) para poder
 * abrirse desde ahí.
 */
export default function RespuestaRapidaForm({ inicial, onClose, onSaved }: Props) {
  const [atajo, setAtajo] = useState(inicial?.atajo ?? '')
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [body, setBody] = useState(inicial?.body ?? '')
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const guardar = useGuardarRespuestaRapida()

  const esEdicion = !!inicial
  const atajoNormalizado = normalizarAtajo(atajo)

  function insertarVariable(token: string) {
    const el = bodyRef.current
    if (!el) {
      setBody((prev) => prev + token)
      return
    }
    const inicio = el.selectionStart ?? body.length
    const fin = el.selectionEnd ?? body.length
    const nuevo = body.slice(0, inicio) + token + body.slice(fin)
    setBody(nuevo)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(inicio + token.length, inicio + token.length)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (guardar.isPending) return
    setError(null)
    try {
      const guardada = await guardar.mutateAsync({ id: inicial?.id, atajo, titulo, body })
      onSaved?.(guardada)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la respuesta rápida')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col md:bg-black/50 md:items-center md:justify-center">
      <div className="absolute inset-0 hidden md:block" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="relative flex flex-col h-full w-full bg-card md:h-auto md:max-h-[90vh] md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
          <button type="button" onClick={onClose} className="md:hidden p-2 -ml-2 text-muted-foreground" aria-label="Volver">
            <ArrowLeft size={20} />
          </button>
          <h2 className="flex-1 text-base font-semibold text-foreground">
            {esEdicion ? 'Editar respuesta rápida' : 'Nueva respuesta rápida'}
          </h2>
          <button type="button" onClick={onClose} className="hidden md:block p-1 text-muted-foreground hover:text-foreground" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Campos */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label htmlFor="rr-atajo" className="block text-xs font-medium text-muted-foreground mb-1">
              Comando
            </label>
            <div className="flex items-center gap-1">
              <span className="text-sm font-mono text-muted-foreground">/</span>
              <input
                id="rr-atajo"
                value={atajo}
                onChange={(e) => setAtajo(e.target.value)}
                placeholder="hola"
                maxLength={ATAJO_MAX + 1}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                className={cn(inputCls, 'font-mono')}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              En el chat escribís <span className="font-mono">/{atajoNormalizado || 'hola'}</span> para usarla.
              Solo letras, números y guiones.
            </p>
          </div>

          <div>
            <label htmlFor="rr-titulo" className="block text-xs font-medium text-muted-foreground mb-1">
              Título
            </label>
            <input
              id="rr-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Saludo inicial"
              maxLength={TITULO_MAX}
              required
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="rr-body" className="block text-xs font-medium text-muted-foreground mb-1">
              Mensaje
            </label>
            <textarea
              id="rr-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hola {nombre}! Gracias por escribirnos…"
              rows={5}
              maxLength={BODY_MAX}
              required
              className={cn(inputCls, 'resize-y min-h-[110px]')}
            />
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-[11px] text-muted-foreground">Variables:</span>
              {VARIABLES_RESPUESTA.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertarVariable(v.token)}
                  title={v.descripcion}
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-border bg-accent/40 hover:bg-accent text-foreground transition-colors"
                >
                  {v.token}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive leading-snug">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardar.isPending}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md min-h-[40px]',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50',
            )}
          >
            {guardar.isPending ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear respuesta'}
          </button>
        </div>
      </form>
    </div>
  )
}
