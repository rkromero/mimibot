'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { FollowUpConfig } from '@/types/db'
import { MENSAJE_SEGUIMIENTO_PROPUESTA_DEFAULT } from '@/lib/followup/propuesta'
import { MENSAJE_FINAL_DEFAULT } from '@/lib/followup/indagacion'
import {
  ULTIMO_SEGUIMIENTO_TEMPLATE_DEFAULT,
  ULTIMO_SEGUIMIENTO_HORAS_DEFAULT,
  RESPUESTAS_AUTOMATICAS_DEFAULT,
} from '@/lib/followup/ultimo-seguimiento'

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
    propuestaEnabled: initialConfig?.propuestaEnabled ?? true,
    propuestaHoras: initialConfig?.propuestaHoras ?? 23,
    propuestaMensaje: initialConfig?.propuestaMensaje ?? MENSAJE_SEGUIMIENTO_PROPUESTA_DEFAULT,
    propuestaTemplateName: initialConfig?.propuestaTemplateName ?? '',
    propuestaTemplateLang: initialConfig?.propuestaTemplateLang ?? 'es',
    indagacionEnabled: initialConfig?.indagacionEnabled ?? true,
    indagacionHoras: initialConfig?.indagacionHoras ?? 2,
    indagacionFinalHoras: initialConfig?.indagacionFinalHoras ?? 23,
    indagacionCierreHoras: initialConfig?.indagacionCierreHoras ?? 24,
    horarioDesde: initialConfig?.horarioDesde ?? 8,
    horarioHasta: initialConfig?.horarioHasta ?? 22,
    indagacionMensajeFinal: initialConfig?.indagacionMensajeFinal ?? MENSAJE_FINAL_DEFAULT,
    ultimoSeguimientoTemplateName: initialConfig?.ultimoSeguimientoTemplateName ?? ULTIMO_SEGUIMIENTO_TEMPLATE_DEFAULT,
    ultimoSeguimientoTemplateLang: initialConfig?.ultimoSeguimientoTemplateLang ?? 'es',
    ultimoSeguimientoHoras: initialConfig?.ultimoSeguimientoHoras ?? ULTIMO_SEGUIMIENTO_HORAS_DEFAULT,
    respuestasAutomaticasFrases: (initialConfig?.respuestasAutomaticasFrases ?? []).join('\n'),
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
          propuestaEnabled: form.propuestaEnabled,
          propuestaHoras: form.propuestaHoras,
          propuestaMensaje: form.propuestaMensaje.trim() || null,
          propuestaTemplateName: form.propuestaTemplateName.trim() || null,
          propuestaTemplateLang: form.propuestaTemplateLang.trim() || 'es',
          indagacionEnabled: form.indagacionEnabled,
          indagacionHoras: form.indagacionHoras,
          indagacionFinalHoras: form.indagacionFinalHoras,
          indagacionCierreHoras: form.indagacionCierreHoras,
          horarioDesde: form.horarioDesde,
          horarioHasta: form.horarioHasta,
          indagacionMensajeFinal: form.indagacionMensajeFinal.trim() || null,
          ultimoSeguimientoTemplateName: form.ultimoSeguimientoTemplateName.trim() || null,
          ultimoSeguimientoTemplateLang: form.ultimoSeguimientoTemplateLang.trim() || 'es',
          ultimoSeguimientoHoras: form.ultimoSeguimientoHoras,
          respuestasAutomaticasFrases: form.respuestasAutomaticasFrases
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

      {/* Seguimiento de propuesta */}
      <div className="pt-4 border-t border-border space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Seguimiento después de enviar una propuesta</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Al marcar una propuesta como enviada se programa un mensaje al día siguiente. Se manda
            dentro de la ventana de 24 hs de WhatsApp (contada desde el último mensaje del cliente), como
            texto libre. Si el cliente responde antes, se cancela.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Activo</span>
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, propuestaEnabled: !p.propuestaEnabled }))}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              form.propuestaEnabled ? 'bg-primary' : 'bg-zinc-200 dark:bg-zinc-700',
            )}
          >
            <span
              className={cn(
                'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                form.propuestaEnabled ? 'translate-x-4' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Horas después del último mensaje del cliente
          </label>
          <input
            type="number"
            min={1}
            max={23}
            value={form.propuestaHoras}
            onChange={(e) => setForm((p) => ({ ...p, propuestaHoras: parseInt(e.target.value) || 23 }))}
            className={cn(
              'w-32 px-3 py-2 text-sm rounded-md border',
              'border-border bg-background text-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Máximo 23: pasadas las 24 hs WhatsApp exige plantilla. Si la propuesta se envió cuando ya no
            quedaba margen, el seguimiento sale 22 hs después de la propuesta con la plantilla de respaldo.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Mensaje</label>
          <textarea
            value={form.propuestaMensaje}
            onChange={(e) => setForm((p) => ({ ...p, propuestaMensaje: e.target.value }))}
            rows={3}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-md border resize-none',
              'border-border bg-background text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
          <p className="text-xs text-muted-foreground mt-1">
            <code>{'{{1}}'}</code> = nombre del cliente (solo el nombre), <code>{'{{2}}'}</code> = nombre del vendedor que envió la propuesta.
          </p>
        </div>

        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Plantilla de respaldo <span className="text-muted-foreground font-normal">(si la ventana está cerrada)</span>
            </label>
            <input
              type="text"
              value={form.propuestaTemplateName}
              onChange={(e) => setForm((p) => ({ ...p, propuestaTemplateName: e.target.value }))}
              placeholder="ej: seguimiento_propuesta"
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md border',
                'border-border bg-background text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Idioma</label>
            <input
              type="text"
              value={form.propuestaTemplateLang}
              onChange={(e) => setForm((p) => ({ ...p, propuestaTemplateLang: e.target.value }))}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md border',
                'border-border bg-background text-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Nombre exacto de una plantilla aprobada en Ajustes → WhatsApp → Plantillas. Sin plantilla, si la ventana
          está cerrada el sistema deja una nota interna en el chat para que lo mandes a mano.
        </p>
      </div>

      {/* Seguimiento de indagación (leads en Nuevo) */}
      <div className="pt-4 border-t border-border space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Leads en Nuevo que dejan de responder al bot</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cada vez que el bot escribe y la persona no contesta: a las N horas el bot retoma la pregunta
            pendiente; si sigue sin responder, un mensaje final dentro de la ventana de 24 hs; si tampoco
            responde (o contesta "más adelante"), el lead pasa a Cerrado Perdido. Si vuelve a escribir,
            se crea un lead nuevo con la misma conversación.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Activo</span>
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, indagacionEnabled: !p.indagacionEnabled }))}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              form.indagacionEnabled ? 'bg-primary' : 'bg-zinc-200 dark:bg-zinc-700',
            )}
          >
            <span
              className={cn(
                'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                form.indagacionEnabled ? 'translate-x-4' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {([
            ['indagacionHoras', 'Retomar a las (hs)', 1, 12],
            ['indagacionFinalHoras', 'Final a las (hs desde su último mensaje)', 6, 23],
            ['indagacionCierreHoras', 'Perdido a las (hs sin responder al final)', 1, 168],
          ] as const).map(([key, label, min, max]) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1.5">{label}</label>
              <input
                type="number"
                min={min}
                max={max}
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: parseInt(e.target.value) || p[key] }))}
                className={cn(
                  'w-full px-3 py-2 text-sm rounded-md border',
                  'border-border bg-background text-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-ring',
                )}
              />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Horario permitido para enviar (hora Argentina)</label>
          <div className="flex items-center gap-2 text-sm">
            <span>de</span>
            <input
              type="number"
              min={0}
              max={23}
              value={form.horarioDesde}
              onChange={(e) => setForm((p) => ({ ...p, horarioDesde: parseInt(e.target.value) || 0 }))}
              className={cn('w-20 px-3 py-2 text-sm rounded-md border', 'border-border bg-background text-foreground', 'focus:outline-none focus:ring-1 focus:ring-ring')}
            />
            <span>a</span>
            <input
              type="number"
              min={1}
              max={24}
              value={form.horarioHasta}
              onChange={(e) => setForm((p) => ({ ...p, horarioHasta: parseInt(e.target.value) || 24 }))}
              className={cn('w-20 px-3 py-2 text-sm rounded-md border', 'border-border bg-background text-foreground', 'focus:outline-none focus:ring-1 focus:ring-ring')}
            />
            <span className="text-xs text-muted-foreground">hs. Fuera de ese rango nada se envía: se posterga a la mañana.</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Mensaje final</label>
          <textarea
            value={form.indagacionMensajeFinal}
            onChange={(e) => setForm((p) => ({ ...p, indagacionMensajeFinal: e.target.value }))}
            rows={3}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-md border resize-none',
              'border-border bg-background text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
          <p className="text-xs text-muted-foreground mt-1">
            <code>{'{{1}}'}</code> = nombre, <code>{'{{2}}'}</code> = producto de interés. El mensaje para retomar lo
            redacta el bot según lo que quedó pendiente en la charla.
          </p>
        </div>
      </div>

      {/* Último seguimiento (botón del panel del lead) */}
      <div className="pt-4 border-t border-border space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Último seguimiento (botón del lead)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manda la plantilla aprobada y, si nadie contesta en las horas indicadas (contadas solo dentro del horario
            permitido de arriba), el lead pasa a Perdido con &quot;Dejó de responder&quot;. Si contesta, en &quot;Nuevo&quot; sigue
            el bot; en otra etapa la respuesta queda para el vendedor.
          </p>
        </div>

        <div className="grid grid-cols-[1fr_6rem_6rem] gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Plantilla</label>
            <input
              type="text"
              value={form.ultimoSeguimientoTemplateName}
              onChange={(e) => setForm((p) => ({ ...p, ultimoSeguimientoTemplateName: e.target.value }))}
              placeholder={ULTIMO_SEGUIMIENTO_TEMPLATE_DEFAULT}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md border',
                'border-border bg-background text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Idioma</label>
            <input
              type="text"
              value={form.ultimoSeguimientoTemplateLang}
              onChange={(e) => setForm((p) => ({ ...p, ultimoSeguimientoTemplateLang: e.target.value }))}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md border',
                'border-border bg-background text-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Cierra a las (hs)</label>
            <input
              type="number"
              min={1}
              max={168}
              value={form.ultimoSeguimientoHoras}
              onChange={(e) => setForm((p) => ({ ...p, ultimoSeguimientoHoras: parseInt(e.target.value) || p.ultimoSeguimientoHoras }))}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md border',
                'border-border bg-background text-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Nombre exacto de una plantilla aprobada en Ajustes → WhatsApp → Plantillas. Hasta que Meta la apruebe, el
          botón avisa y no manda.
        </p>

        <div>
          <label className="block text-sm font-medium mb-1.5">Respuestas automáticas de negocios (no cuentan como respuesta)</label>
          <textarea
            value={form.respuestasAutomaticasFrases}
            onChange={(e) => setForm((p) => ({ ...p, respuestasAutomaticasFrases: e.target.value }))}
            rows={4}
            placeholder="Una frase por línea, p. ej.: en este momento no podemos atenderte"
            className={cn(
              'w-full px-3 py-2 text-sm rounded-md border resize-none',
              'border-border bg-background text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Se comparan sin mayúsculas ni tildes. Ya se detectan por defecto: {RESPUESTAS_AUTOMATICAS_DEFAULT.slice(0, 4).map((f) => `"${f}"`).join(', ')} y
            otras {RESPUESTAS_AUTOMATICAS_DEFAULT.length - 4}. Un audio o una foto siempre cuentan como respuesta.
          </p>
        </div>
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
