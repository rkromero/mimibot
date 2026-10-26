'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { BotConfig } from '@/types/db'
import BotPreview from './BotPreview'
import BotMediaGallery from './BotMediaGallery'

type Props = { initialConfig: BotConfig | null }
type Tab = 'config' | 'galeria' | 'preview'

const PLAZO_DEFAULT = 'hoy mismo en horario hábil'
const GRAMAJE_DEFAULT = 60
const TAB_LABEL: Record<Tab, string> = { config: 'Configuración', galeria: 'Galería', preview: 'Probar bot' }

const DEFAULT_PROMPT = `Sos un asistente de ventas. Tu objetivo es calificar al lead de manera conversacional y amable.

Hacé estas preguntas de a una, en orden natural:
1. ¿Cuál es tu nombre?
2. ¿Qué estás buscando o en qué te podemos ayudar?
3. ¿Cuál es tu presupuesto aproximado?
4. ¿Para cuándo lo necesitás?

Cuando hayas obtenido toda la información, incluí [HANDOFF] al final de tu mensaje de cierre.

Respondé siempre en el mismo idioma que el usuario. Sé breve y conversacional. Máximo 2-3 oraciones por respuesta.`

export default function BotConfigForm({ initialConfig }: Props) {
  const [tab, setTab] = useState<Tab>('config')
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    isEnabled: initialConfig?.isEnabled ?? true,
    systemPrompt: initialConfig?.systemPrompt ?? DEFAULT_PROMPT,
    maxTurns: initialConfig?.maxTurns ?? 6,
    esperaRespuestaSegundos: initialConfig?.esperaRespuestaSegundos ?? 15,
    handoffPhrases: (initialConfig?.handoffPhrases ?? []).join('\n'),
    precioReferencia: initialConfig?.precioReferencia ?? '',
    productosExcluidos: (initialConfig?.productosExcluidos ?? []).join('\n'),
    plazoPropuesta: initialConfig?.plazoPropuesta ?? PLAZO_DEFAULT,
    propuestaAutomatica: initialConfig?.propuestaAutomatica ?? true,
    gramajeDefault: initialConfig?.gramajeDefault ?? GRAMAJE_DEFAULT,
  })

  const productosExcluidosLista = form.productosExcluidos
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    startTransition(async () => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isEnabled: form.isEnabled,
          systemPrompt: form.systemPrompt,
          maxTurns: form.maxTurns,
          esperaRespuestaSegundos: form.esperaRespuestaSegundos,
          handoffPhrases: form.handoffPhrases
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          precioReferencia: form.precioReferencia.trim() || null,
          productosExcluidos: productosExcluidosLista,
          plazoPropuesta: form.plazoPropuesta.trim() || PLAZO_DEFAULT,
          propuestaAutomatica: form.propuestaAutomatica,
          gramajeDefault: form.gramajeDefault,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error)
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['config', 'galeria', 'preview'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'preview' && (
        <BotPreview
          systemPrompt={form.systemPrompt}
          precioReferencia={form.precioReferencia.trim() || null}
          productosExcluidos={productosExcluidosLista}
          plazoPropuesta={form.plazoPropuesta.trim() || PLAZO_DEFAULT}
          gramajeDefault={form.gramajeDefault}
        />
      )}

      {tab === 'galeria' && <BotMediaGallery />}

      {tab === 'config' && (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-md font-semibold mb-1">Bot de calificación</h2>
        <p className="text-sm text-muted-foreground">
          El bot responde automáticamente los primeros mensajes de cada lead nuevo.
        </p>
      </div>

      {/* Toggle global */}
      <div className="flex items-center justify-between py-3 border-b border-border">
        <div>
          <p className="text-sm font-medium">Activar bot globalmente</p>
          <p className="text-xs text-muted-foreground">Se puede desactivar por lead individual desde la ficha.</p>
        </div>
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, isEnabled: !p.isEnabled }))}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150',
            form.isEnabled ? 'bg-primary' : 'bg-zinc-200 dark:bg-zinc-700',
          )}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-150',
              form.isEnabled ? 'translate-x-4' : 'translate-x-1',
            )}
          />
        </button>
      </div>

      {/* System prompt */}
      <div>
        <label className="block text-sm font-medium mb-1.5">System prompt</label>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => setForm((p) => ({ ...p, systemPrompt: e.target.value }))}
          rows={12}
          className={cn(
            'w-full px-3 py-2 text-sm font-mono rounded-md border resize-y',
            'border-border bg-background text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Incluí la instrucción de poner [HANDOFF] cuando el bot deba pasarle el lead a un agente.
        </p>
      </div>

      {/* Precio de referencia */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Precio de referencia</label>
        <input
          type="text"
          value={form.precioReferencia}
          onChange={(e) => setForm((p) => ({ ...p, precioReferencia: e.target.value }))}
          maxLength={500}
          placeholder="desde $X por alfajor en 300 u film cristal, + IVA"
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border',
            'border-border bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Cuando preguntan precio, el bot da este rango tal cual y aclara que la propuesta exacta llega por escrito.
          Vacío: no da números, pero tampoco dice que no da precios.
        </p>
      </div>

      {/* Productos que NO hacemos */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Productos que NO hacemos</label>
        <textarea
          value={form.productosExcluidos}
          onChange={(e) => setForm((p) => ({ ...p, productosExcluidos: e.target.value }))}
          rows={4}
          placeholder={'Uno por línea. Ej:\ntriple\nsin TACC'}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border resize-none',
            'border-border bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Si piden alguno, el bot lo dice con amabilidad, ofrece una alternativa, etiqueta el lead
          &quot;lista-espera-&lt;producto&gt;&quot; y no lo pasa a Calificado.
        </p>
      </div>

      {/* Plazo de la propuesta */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Cuándo sale la propuesta por escrito</label>
        <input
          type="text"
          value={form.plazoPropuesta}
          onChange={(e) => setForm((p) => ({ ...p, plazoPropuesta: e.target.value }))}
          maxLength={160}
          placeholder={PLAZO_DEFAULT}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border',
            'border-border bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Es lo único que el bot promete sobre tiempos. Cualquier &quot;72 hs hábiles&quot; que quede en el prompt se reemplaza por esto.
        </p>
      </div>

      {/* Propuesta automática al calificar */}
      <div className="flex items-center justify-between py-3 border-b border-border">
        <div>
          <p className="text-sm font-medium">Crear y enviar la propuesta sola al calificar</p>
          <p className="text-xs text-muted-foreground">
            Con la cantidad, el gramaje y el packaging que el bot relevó, la propuesta se crea a nombre del vendedor
            asignado, sale por WhatsApp al instante y el lead pasa a Propuesta enviada. Si falta la cantidad, no se
            crea y deja una nota.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, propuestaAutomatica: !p.propuestaAutomatica }))}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150',
            form.propuestaAutomatica ? 'bg-primary' : 'bg-zinc-200 dark:bg-zinc-700',
          )}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-150',
              form.propuestaAutomatica ? 'translate-x-4' : 'translate-x-1',
            )}
          />
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Gramaje por defecto (g)</label>
        <input
          type="number"
          min={1}
          max={1000}
          value={form.gramajeDefault}
          onChange={(e) => setForm((p) => ({ ...p, gramajeDefault: parseInt(e.target.value) || GRAMAJE_DEFAULT }))}
          className={cn(
            'w-24 px-3 py-2 text-sm rounded-md border',
            'border-border bg-background text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Se cotiza con este gramaje cuando la persona no lo especificó. Tiene que tener receta activa en el cotizador.
        </p>
      </div>

      {/* Max turns */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Máximo de turnos antes de handoff automático
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={form.maxTurns}
          onChange={(e) => setForm((p) => ({ ...p, maxTurns: parseInt(e.target.value) || 6 }))}
          className={cn(
            'w-24 px-3 py-2 text-sm rounded-md border',
            'border-border bg-background text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
      </div>

      {/* Espera antes de responder */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Segundos de espera antes de responder
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={120}
            value={form.esperaRespuestaSegundos}
            onChange={(e) => {
              const n = parseInt(e.target.value)
              setForm((p) => ({ ...p, esperaRespuestaSegundos: Number.isNaN(n) ? 0 : Math.min(120, Math.max(0, n)) }))
            }}
            className={cn(
              'w-24 px-3 py-2 text-sm rounded-md border',
              'border-border bg-background text-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
          <span className="text-sm text-muted-foreground">segundos</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          El bot espera este tiempo después del último mensaje de la persona. Si manda varios mensajes seguidos,
          los junta y responde una sola vez al conjunto. Con 0 responde de inmediato a cada mensaje.
        </p>
      </div>

      {/* Handoff phrases */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Frases de handoff adicionales
        </label>
        <textarea
          value={form.handoffPhrases}
          onChange={(e) => setForm((p) => ({ ...p, handoffPhrases: e.target.value }))}
          rows={4}
          placeholder="Una frase por línea. Cuando el usuario incluya estas frases, el bot hará handoff automáticamente."
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border resize-none',
            'border-border bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Por defecto ya se detectan: "hablar con alguien", "quiero un humano", etc.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors duration-100',
            'disabled:opacity-50',
          )}
        >
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {saved && <span className="text-sm text-muted-foreground">Guardado.</span>}
      </div>
    </form>
      )}
    </div>
  )
}
