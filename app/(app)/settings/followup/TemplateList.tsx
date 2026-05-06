'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { FollowUpTemplate } from '@/types/db'
import TemplateForm from './TemplateForm'

type Props = {
  templates: FollowUpTemplate[]
  onTemplatesChange: (templates: FollowUpTemplate[]) => void
}

const SCENARIO_LABELS: Record<string, string> = {
  no_response: 'Sin respuesta',
  stalling: 'Estancamiento',
  manual: 'Manual',
}

export default function TemplateList({ templates, onTemplatesChange }: Props) {
  const [editing, setEditing] = useState<FollowUpTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await fetch(`/api/settings/followup-templates/${id}`, { method: 'DELETE' })
      onTemplatesChange(templates.filter((t) => t.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  function handleSaved(template: FollowUpTemplate, isNew: boolean) {
    if (isNew) {
      onTemplatesChange([...templates, template])
    } else {
      onTemplatesChange(templates.map((t) => (t.id === template.id ? template : t)))
    }
    setEditing(null)
    setCreating(false)
  }

  if (creating) {
    return (
      <TemplateForm
        template={null}
        onSaved={(t) => handleSaved(t, true)}
        onCancel={() => setCreating(false)}
      />
    )
  }

  if (editing) {
    return (
      <TemplateForm
        template={editing}
        onSaved={(t) => handleSaved(t, false)}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Los templates se usan cuando la ventana de 24hs de WhatsApp está cerrada. Deben estar aprobados en Meta Business Manager.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md',
            'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
          )}
        >
          + Nuevo template
        </button>
      </div>

      {templates.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
          No hay templates configurados. Creá uno para habilitar el seguimiento cuando la ventana de WhatsApp esté cerrada.
        </div>
      )}

      <div className="space-y-2">
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex items-start justify-between p-3 rounded-md border border-border bg-background"
          >
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{t.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                  {SCENARIO_LABELS[t.scenario] ?? t.scenario}
                </span>
                {t.isDefault && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    predeterminado
                  </span>
                )}
                {!t.isActive && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                    inactivo
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">{t.templateName} · {t.language}</p>
              {t.bodyPreview && (
                <p className="text-xs text-muted-foreground truncate max-w-sm">{t.bodyPreview}</p>
              )}
            </div>
            <div className="flex items-center gap-1 ml-3 shrink-0">
              <button
                type="button"
                onClick={() => setEditing(t)}
                className="text-xs px-2 py-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => handleDelete(t.id)}
                disabled={deleting === t.id}
                className="text-xs px-2 py-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                {deleting === t.id ? '...' : 'Eliminar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
