'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { FollowUpConfig } from '@/types/db'

type Props = { initialConfig: FollowUpConfig | null }

export default function FollowUpConfigForm({ initialConfig }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    isEnabled: initialConfig?.isEnabled ?? true,
    noResponseHours: initialConfig?.noResponseHours ?? 24,
    stallingDelayMinutes: initialConfig?.stallingDelayMinutes ?? 60,
    maxFollowUps: initialConfig?.maxFollowUps ?? 3,
    retryHours: ((initialConfig?.retryHours as number[] | null) ?? [1, 22, 72]).join(', '),
    stallingPhrases: (initialConfig?.stallingPhrases ?? []).join('\n'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const retryHours = form.retryHours
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n) && n > 0)

    if (retryHours.length === 0) {
      setError('Ingresá al menos un intervalo de reintento.')
      return
    }

    startTransition(async () => {
      const res = await fetch('/api/settings/followup-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isEnabled: form.isEnabled,
          noResponseHours: form.noResponseHours,
          stallingDelayMinutes: form.stallingDelayMinutes,
          maxFollowUps: form.maxFollowUps,
          retryHours,
          stallingPhrases: form.stallingPhrases
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error: unknown }
        setError(JSON.stringify(data.error))
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Toggle global */}
      <div className="flex items-center justify-between py-3 border-b border-border">
        <div>
          <p className="text-sm font-medium">Activar seguimiento automático</p>
          <p className="text-xs text-muted-foreground">
            Detecta leads que no responden y envía mensajes para recuperar el interés.
          </p>
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

      {/* No response delay */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Seguimiento por falta de respuesta — después de (horas)
        </label>
        <input
          type="number"
          min={1}
          max={720}
          value={form.noResponseHours}
          onChange={(e) => setForm((p) => ({ ...p, noResponseHours: parseInt(e.target.value) || 24 }))}
          className={cn(
            'w-24 px-3 py-2 text-sm rounded-md border',
            'border-border bg-background text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Si el lead no responde en este tiempo, se agenda un seguimiento.
        </p>
      </div>

      {/* Stalling delay */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Seguimiento tras frase de estancamiento — después de (minutos)
        </label>
        <input
          type="number"
          min={1}
          max={1440}
          value={form.stallingDelayMinutes}
          onChange={(e) => setForm((p) => ({ ...p, stallingDelayMinutes: parseInt(e.target.value) || 60 }))}
          className={cn(
            'w-24 px-3 py-2 text-sm rounded-md border',
            'border-border bg-background text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Cuando el lead dice "lo voy a pensar" u otra frase de estancamiento.
        </p>
      </div>

      {/* Max follow-ups */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Máximo de seguimientos por lead
        </label>
        <input
          type="number"
          min={1}
          max={10}
          value={form.maxFollowUps}
          onChange={(e) => setForm((p) => ({ ...p, maxFollowUps: parseInt(e.target.value) || 3 }))}
          className={cn(
            'w-24 px-3 py-2 text-sm rounded-md border',
            'border-border bg-background text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
      </div>

      {/* Retry intervals */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Intervalos entre reintentos (horas, separados por comas)
        </label>
        <input
          type="text"
          value={form.retryHours}
          onChange={(e) => setForm((p) => ({ ...p, retryHours: e.target.value }))}
          placeholder="1, 24, 72"
          className={cn(
            'w-48 px-3 py-2 text-sm rounded-md border',
            'border-border bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Ej: <code>1, 24, 72</code> = 1h después, luego 24h, luego 72h.
        </p>
      </div>

      {/* Stalling phrases */}
      <div>
        <label className="block text-sm font-medium mb-1.5">
          Frases de estancamiento adicionales
        </label>
        <textarea
          value={form.stallingPhrases}
          onChange={(e) => setForm((p) => ({ ...p, stallingPhrases: e.target.value }))}
          rows={4}
          placeholder="Una frase por línea"
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border resize-none',
            'border-border bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Ya se detectan por defecto: "lo voy a pensar", "más adelante", "capaz", y otras.
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
