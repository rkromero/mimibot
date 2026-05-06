'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { FollowUpTemplate, TemplateParameter } from '@/types/db'

type Props = {
  template: FollowUpTemplate | null
  onSaved: (template: FollowUpTemplate) => void
  onCancel: () => void
}

const PARAM_SOURCES = [
  { value: 'contact.name', label: 'Nombre del contacto' },
  { value: 'lead.productInterest', label: 'Producto de interés' },
  { value: 'lead.notes', label: 'Notas del lead' },
  { value: 'custom', label: 'Texto fijo' },
] as const

export default function TemplateForm({ template, onSaved, onCancel }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: template?.name ?? '',
    templateName: template?.templateName ?? '',
    language: template?.language ?? 'es',
    scenario: template?.scenario ?? 'no_response' as 'no_response' | 'stalling' | 'manual',
    bodyPreview: template?.bodyPreview ?? '',
    isActive: template?.isActive ?? true,
    isDefault: template?.isDefault ?? false,
    parameters: (template?.parameters as TemplateParameter[] | null) ?? [] as TemplateParameter[],
  })

  function addParameter() {
    const nextPos = form.parameters.length + 1
    setForm((p) => ({
      ...p,
      parameters: [...p.parameters, { position: nextPos, source: 'contact.name' as const }],
    }))
  }

  function removeParameter(idx: number) {
    setForm((p) => ({
      ...p,
      parameters: p.parameters
        .filter((_, i) => i !== idx)
        .map((param, i) => ({ ...param, position: i + 1 })),
    }))
  }

  function updateParameter(idx: number, updates: Partial<TemplateParameter>) {
    setForm((p) => ({
      ...p,
      parameters: p.parameters.map((param, i) => i === idx ? { ...param, ...updates } : param),
    }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim() || !form.templateName.trim()) {
      setError('El nombre y el nombre del template son obligatorios.')
      return
    }

    startTransition(async () => {
      const url = template
        ? `/api/settings/followup-templates/${template.id}`
        : '/api/settings/followup-templates'

      const res = await fetch(url, {
        method: template ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json() as { error: unknown }
        setError(JSON.stringify(data.error))
        return
      }

      const saved = await res.json() as FollowUpTemplate
      onSaved(saved)
    })
  }

  const inputClass = cn(
    'w-full px-3 py-2 text-sm rounded-md border',
    'border-border bg-background text-foreground placeholder:text-muted-foreground',
    'focus:outline-none focus:ring-1 focus:ring-ring',
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {template ? 'Editar template' : 'Nuevo template'}
        </h3>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Nombre visible</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Ej: Seguimiento sin respuesta"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Nombre en Meta</label>
          <input
            type="text"
            value={form.templateName}
            onChange={(e) => setForm((p) => ({ ...p, templateName: e.target.value }))}
            placeholder="Ej: seguimiento_lead"
            className={cn(inputClass, 'font-mono')}
          />
          <p className="text-xs text-muted-foreground mt-1">Exacto, como aparece en Meta Business Manager.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Idioma</label>
          <input
            type="text"
            value={form.language}
            onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}
            placeholder="es"
            className={cn(inputClass, 'font-mono')}
          />
          <p className="text-xs text-muted-foreground mt-1">Código de idioma: es, es_AR, en_US, etc.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Escenario</label>
          <select
            value={form.scenario}
            onChange={(e) => setForm((p) => ({ ...p, scenario: e.target.value as typeof form.scenario }))}
            className={inputClass}
          >
            <option value="no_response">Sin respuesta</option>
            <option value="stalling">Estancamiento</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Vista previa del cuerpo</label>
        <textarea
          value={form.bodyPreview}
          onChange={(e) => setForm((p) => ({ ...p, bodyPreview: e.target.value }))}
          rows={3}
          placeholder="Hola {{1}}, te escribimos para retomar la consulta sobre {{2}}..."
          className={cn(inputClass, 'resize-none')}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Texto del template con placeholders. Solo para referencia visual — el texto real viene de Meta.
        </p>
      </div>

      {/* Parameters */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Parámetros ({`{{1}}`}, {`{{2}}`}, ...)</label>
          <button
            type="button"
            onClick={addParameter}
            className="text-xs text-primary hover:underline"
          >
            + Agregar
          </button>
        </div>
        {form.parameters.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin parámetros. El template no tiene variables.</p>
        )}
        <div className="space-y-2">
          {form.parameters.map((param, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-6 shrink-0">{`{{${param.position}}}`}</span>
              <select
                value={param.source}
                onChange={(e) => updateParameter(idx, { source: e.target.value as TemplateParameter['source'] })}
                className={cn(inputClass, 'flex-1')}
              >
                {PARAM_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {param.source === 'custom' && (
                <input
                  type="text"
                  value={param.value ?? ''}
                  onChange={(e) => updateParameter(idx, { value: e.target.value })}
                  placeholder="Texto fijo"
                  className={cn(inputClass, 'flex-1')}
                />
              )}
              <button
                type="button"
                onClick={() => removeParameter(idx)}
                className="text-xs text-muted-foreground hover:text-destructive px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex gap-6">
        {[
          { key: 'isActive' as const, label: 'Activo' },
          { key: 'isDefault' as const, label: 'Predeterminado para este escenario' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, [key]: !p[key] }))}
              className={cn(
                'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                form[key] ? 'bg-primary' : 'bg-zinc-200 dark:bg-zinc-700',
              )}
            >
              <span
                className={cn(
                  'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                  form[key] ? 'translate-x-3.5' : 'translate-x-0.5',
                )}
              />
            </button>
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md',
            'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
            'disabled:opacity-50',
          )}
        >
          {isPending ? 'Guardando...' : template ? 'Actualizar' : 'Crear template'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
    </form>
  )
}
