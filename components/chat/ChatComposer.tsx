'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Send, Paperclip, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { suscribirInsertarTexto, suscribirEnviarTexto, combinarTexto } from '@/lib/inbox/composer-events'
import { useRespuestasRapidas } from '@/lib/inbox/use-respuestas-rapidas'
import {
  detectarComando,
  filtrarPorComando,
  reemplazarVariables,
  type RespuestaRapida,
  type VariablesRespuesta,
} from '@/lib/inbox/respuestas-rapidas'
import ComandoRespuestas from './ComandoRespuestas'

type Props = {
  conversationId: string
  leadId?: string
  /** Datos para completar {nombre} y {producto} en las respuestas rápidas */
  variables?: VariablesRespuesta
}

const MAX_SUGERENCIAS = 8

type PlantillaApertura = {
  name: string
  language: string
  preview: string
  esPredeterminada: boolean
}

type AperturaInfo = {
  ventanaAbierta: boolean
  plantillas: PlantillaApertura[]
}

const keyDe = (p: { name: string; language: string }) => `${p.name}::${p.language}`

export default function ChatComposer({ conversationId, leadId, variables = {} }: Props) {
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isNote, setIsNote] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [templateNotice, setTemplateNotice] = useState(false)
  const [plantillaKey, setPlantillaKey] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  // ── Respuestas rápidas por comando ("/" + atajo) ──────────────────────────
  const { data: respuestas = [] } = useRespuestasRapidas()
  const [comandoActivo, setComandoActivo] = useState(0)
  // Esc cierra las sugerencias hasta que se vuelva a tipear
  const [comandoOculto, setComandoOculto] = useState(false)

  const consultaComando = !isNote && !comandoOculto ? detectarComando(text) : null
  const opcionesComando =
    consultaComando !== null ? filtrarPorComando(respuestas, consultaComando).slice(0, MAX_SUGERENCIAS) : []

  useEffect(() => {
    setComandoActivo(0)
  }, [consultaComando])

  function elegirRespuesta(r: RespuestaRapida) {
    setText(reemplazarVariables(r.body, variables))
    setComandoOculto(true)
    textareaRef.current?.focus()
  }

  // Respuestas rápidas (panel / bottom sheet): el texto elegido se inserta en
  // el composer de esta conversación, en la pestaña WhatsApp, y queda el foco
  // en el cuadro para retocarlo o mandarlo.
  useEffect(() => {
    return suscribirInsertarTexto(conversationId, (nuevo) => {
      setText((prev) => combinarTexto(prev, nuevo))
      setIsNote(false)
      textareaRef.current?.focus()
    })
  }, [conversationId])

  // Envío directo desde el panel: manda por WhatsApp sin tocar lo que la
  // persona tenía escrito en el cuadro. Ref para no re-suscribir en cada render.
  const enviarDirectoRef = useRef<(texto: string) => void>(() => {})
  useEffect(() => {
    return suscribirEnviarTexto(conversationId, (texto) => enviarDirectoRef.current(texto))
  }, [conversationId])

  // Estado de la ventana de 24 hs + plantillas con las que se puede abrir.
  // Se refresca cuando llegan mensajes (ChatFeed invalida 'apertura') y cada 30 s.
  const { data: apertura } = useQuery<AperturaInfo>({
    queryKey: ['apertura', conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversationId}/apertura`)
      if (!res.ok) throw new Error('No se pudo consultar la ventana de 24 hs')
      const json = await res.json() as { data: AperturaInfo }
      return json.data
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const ventanaCerrada = apertura?.ventanaAbierta === false
  const plantillas = apertura?.plantillas ?? []

  // Preseleccionar la predeterminada (o la primera) cuando llega la lista
  useEffect(() => {
    if (plantillas.length === 0) return
    if (plantillas.some((p) => keyDe(p) === plantillaKey)) return
    const def = plantillas.find((p) => p.esPredeterminada) ?? plantillas[0]!
    setPlantillaKey(keyDe(def))
  }, [plantillas, plantillaKey])

  const plantillaElegida = plantillas.find((p) => keyDe(p) === plantillaKey) ?? null

  function refrescar() {
    void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
    void queryClient.invalidateQueries({ queryKey: ['apertura', conversationId] })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Modo comando: las flechas recorren las sugerencias, Enter/Tab insertan
    // la resaltada y Esc las cierra. Si no hay sugerencias, Enter manda el
    // texto tal cual (por si quieren escribir "/algo" literal).
    if (consultaComando !== null && !e.nativeEvent.isComposing) {
      const total = opcionesComando.length
      if (e.key === 'Escape') {
        e.preventDefault()
        setComandoOculto(true)
        return
      }
      if (total > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setComandoActivo((i) => (i + 1) % total)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setComandoActivo((i) => (i - 1 + total) % total)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          elegirRespuesta(opcionesComando[comandoActivo] ?? opcionesComando[0]!)
          return
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || isPending) return

    if (isNote) {
      startTransition(async () => {
        setSendError(null)
        setTemplateNotice(false)
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: trimmed, contentType: 'internal_note', conversationId }),
        })
        setText('')
        void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      })
      return
    }

    enviarWhatsapp(trimmed, { limpiarCuadro: true })
  }

  /**
   * Manda un mensaje de WhatsApp. `limpiarCuadro` vacía el cuadro al enviar
   * (lo que se escribió ahí); el envío directo de una respuesta rápida no lo
   * toca, por si había un borrador a medio escribir.
   */
  function enviarWhatsapp(body: string, { limpiarCuadro }: { limpiarCuadro: boolean }) {
    if (isPending) return

    startTransition(async () => {
      setSendError(null)
      setTemplateNotice(false)

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, leadId, body }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string; code?: string }
        if (data.code === 'WINDOW_CLOSED_NO_TEMPLATE') {
          // La ventana se cerró mientras escribía: mostrar el panel de plantillas
          refrescar()
        }
        setSendError(data.error ?? 'No se pudo enviar el mensaje.')
        return
      }

      const data = await res.json() as { sentAsTemplate?: boolean }
      if (limpiarCuadro) setText('')
      refrescar()
      if (data.sentAsTemplate) {
        setTemplateNotice(true)
        setTimeout(() => setTemplateNotice(false), 6000)
      }
    })
  }

  enviarDirectoRef.current = (texto) => {
    const trimmed = texto.trim()
    if (trimmed) enviarWhatsapp(trimmed, { limpiarCuadro: false })
  }

  function handleSendPlantilla() {
    if (!plantillaElegida || isPending) return
    const elegida = plantillaElegida

    startTransition(async () => {
      setSendError(null)
      setTemplateNotice(false)

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          leadId,
          templateName: elegida.name,
          templateLang: elegida.language,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setSendError(data.error ?? 'No se pudo enviar la plantilla.')
        return
      }

      refrescar()
      setTemplateNotice(true)
      setTimeout(() => setTemplateNotice(false), 6000)
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conversationId)
    if (leadId) fd.append('leadId', leadId)

    await fetch('/api/whatsapp/send', { method: 'POST', body: fd })
    refrescar()
    e.target.value = ''
  }

  const mostrarPanelPlantilla = !isNote && ventanaCerrada

  return (
    <div className="border-t border-border bg-background shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {sendError && (
        <div className="flex items-start gap-2 px-3 pt-2 pb-1">
          <AlertCircle size={14} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive leading-snug">{sendError}</p>
        </div>
      )}
      {templateNotice && (
        <div className="px-3 pt-2 pb-1">
          <p className="text-xs text-blue-600 dark:text-blue-400">
            Plantilla enviada. Cuando la persona responda vas a poder escribir libremente.
          </p>
        </div>
      )}
      {/* Tabs: WhatsApp / Nota interna */}
      <div className="flex gap-1 px-3 pt-2">
        <button
          onClick={() => setIsNote(false)}
          className={cn(
            'px-3 py-1 text-xs rounded-t-md transition-colors duration-100',
            !isNote
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          WhatsApp
        </button>
        <button
          onClick={() => setIsNote(true)}
          className={cn(
            'px-3 py-1 text-xs rounded-t-md transition-colors duration-100',
            isNote
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Nota interna
        </button>
      </div>

      {mostrarPanelPlantilla ? (
        <div className="px-3 py-2 space-y-2">
          <div className="flex items-start gap-2">
            <Clock size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-snug">
              <span className="font-medium text-foreground">Ventana de 24 hs cerrada.</span>{' '}
              La persona no escribió en las últimas 24 hs: WhatsApp solo permite iniciar con una plantilla aprobada.
            </p>
          </div>

          {plantillas.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No hay plantillas aprobadas para usar desde el chat.{' '}
              <Link href="/settings/whatsapp/templates" className="text-primary underline">
                Registrá una en Ajustes → WhatsApp → Plantillas
              </Link>
              .
            </p>
          ) : (
            <>
              {plantillas.length > 1 && (
                <select
                  value={plantillaKey}
                  onChange={(e) => setPlantillaKey(e.target.value)}
                  className={cn(
                    'w-full px-2 py-1.5 text-sm rounded-md border',
                    'border-border bg-background text-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-ring',
                  )}
                >
                  {plantillas.map((p) => (
                    <option key={keyDe(p)} value={keyDe(p)}>
                      {p.name} ({p.language}){p.esPredeterminada ? ' · predeterminada' : ''}
                    </option>
                  ))}
                </select>
              )}

              {plantillaElegida && (
                <div className="rounded-md border border-border bg-accent/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Vista previa · {plantillaElegida.name}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{plantillaElegida.preview}</p>
                </div>
              )}

              <button
                onClick={handleSendPlantilla}
                disabled={!plantillaElegida || isPending}
                className={cn(
                  'w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md',
                  'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                  'disabled:opacity-50',
                )}
              >
                <Send size={14} />
                {isPending ? 'Enviando...' : 'Enviar plantilla'}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-end gap-2 px-3 py-2">
          <div className="relative flex-1 min-w-0">
            {consultaComando !== null && (
              <ComandoRespuestas
                consulta={consultaComando}
                opciones={opcionesComando}
                activo={comandoActivo}
                variables={variables}
                hayRespuestas={respuestas.length > 0}
                onElegir={elegirRespuesta}
                onActivo={setComandoActivo}
              />
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setComandoOculto(false)
              }}
              onKeyDown={handleKeyDown}
              placeholder={isNote ? 'Escribir nota interna...' : 'Escribir mensaje de WhatsApp... ( / para respuestas rápidas)'}
              rows={2}
              className={cn(
                'w-full resize-none px-3 py-2 text-base rounded-md border',
                'border-border bg-background text-foreground',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
                isNote && 'bg-amber-50/50 dark:bg-amber-950/20',
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            {!isNote && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,audio/*"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors duration-100"
                  title="Adjuntar archivo"
                >
                  <Paperclip size={15} />
                </button>
              </>
            )}
            <button
              onClick={handleSend}
              disabled={!text.trim() || isPending}
              className={cn(
                'p-1.5 rounded-md transition-colors duration-100',
                text.trim() && !isPending
                  ? 'text-primary hover:bg-accent'
                  : 'text-muted-foreground cursor-not-allowed',
              )}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
