'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { BotConfig } from '@/types/db'

type Props = { initialConfig: BotConfig | null }

const DEFAULT_PROMPT = `Sos un asistente de ventas. Tu objetivo es calificar al lead de manera conversacional y amable.

Hacé estas preguntas de a una, en orden natural:
1. ¿Cuál es tu nombre?
2. ¿Qué estás buscando o en qué te podemos ayudar?
3. ¿Cuál es tu presupuesto aproximado?
4. ¿Para cuándo lo necesitás?

Cuando hayas obtenido toda la información, incluí [HANDOFF] al final de tu mensaje de cierre.

Respondé siempre en el mismo idioma que el usuario. Sé breve y conversacional. Máximo 2-3 oraciones por respuesta.`

export default function BotConfigForm({ initialConfig }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    isEnabled: initialConfig?.isEnabled ?? true,
    systemPrompt: initialConfig?.systemPrompt ?? DEFAULT_PROMPT,
    maxTurns: initialConfig?.maxTurns ?? 6,
    handoffPhrases: (initialConfig?.handoffPhrases ?? []).join('\n'),
  })

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
          handoffPhrases: form.handoffPhrases
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
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
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
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
  )
}
