'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhatsappTemplate } from '@/types/db'

type FormData = {
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  bodyText: string
  headerText: string
  footerText: string
}

const INITIAL_FORM: FormData = {
  name: '',
  language: 'es',
  category: 'UTILITY',
  bodyText: '',
  headerText: '',
  footerText: '',
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'Pendiente',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  APPROVED: {
    label: 'Aprobada',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  REJECTED: {
    label: 'Rechazada',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  DISABLED: {
    label: 'Desactivada',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400',
  },
}

async function fetchTemplates(): Promise<WhatsappTemplate[]> {
  const res = await fetch('/api/settings/whatsapp/templates')
  if (!res.ok) throw new Error('Error al cargar plantillas')
  const data = await res.json() as { data: WhatsappTemplate[] }
  return data.data
}

export default function WhatsappTemplatesPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['wa-templates'],
    queryFn: fetchTemplates,
  })

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch('/api/settings/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          headerText: data.headerText || undefined,
          footerText: data.footerText || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        throw new Error(err.error)
      }
      return res.json()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wa-templates'] })
      setForm(INITIAL_FORM)
      setSubmitError(null)
      setSubmitSuccess(true)
      setTimeout(() => setSubmitSuccess(false), 3000)
    },
    onError: (err: Error) => {
      setSubmitError(err.message)
    },
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings/whatsapp/templates/sync', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json() as { error: string }
        throw new Error(err.error)
      }
      return res.json() as Promise<{ data: { synced: number } }>
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['wa-templates'] })
      setSyncMessage(`Sincronizadas ${data.data.synced} plantilla(s) desde Meta.`)
      setTimeout(() => setSyncMessage(null), 4000)
    },
    onError: (err: Error) => {
      setSyncMessage(`Error al sincronizar: ${err.message}`)
    },
  })

  function handleChange(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setSubmitSuccess(false)
    createMutation.mutate(form)
  }

  const inputClass = cn(
    'w-full px-3 py-2 text-sm rounded-md border',
    'border-border bg-background text-foreground',
    'focus:outline-none focus:ring-1 focus:ring-ring',
  )

  return (
    <div className="max-w-2xl space-y-8">

      {/* Aviso plantillas aprobadas */}
      <div className="rounded-md border border-border bg-accent/30 px-4 py-3 text-sm text-muted-foreground">
        Solo las plantillas con estado{' '}
        <span className="font-medium text-foreground">Aprobada</span> pueden usarse para iniciar
        conversaciones fuera de la ventana de 24 horas de WhatsApp (mensajes proactivos y seguimientos).
      </div>

      {/* Formulario de alta */}
      <section className="space-y-4">
        <div>
          <h2 className="text-md font-semibold">Registrar nueva plantilla</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            La plantilla se enviará a revisión en Meta Business. El proceso puede tardar minutos u horas.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Nombre</label>
            <input
              type="text"
              required
              placeholder="ej: bienvenida_nuevo_cliente"
              value={form.name}
              onChange={handleChange('name')}
              pattern="^[a-z0-9_]+$"
              title="Solo letras minúsculas, números y guión bajo"
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">
              Solo letras minúsculas, números y guión bajo (_). Sin espacios ni mayúsculas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Idioma</label>
              <input
                type="text"
                required
                placeholder="ej: es, es_AR, en_US"
                value={form.language}
                onChange={handleChange('language')}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Categoría</label>
              <select value={form.category} onChange={handleChange('category')} className={inputClass}>
                <option value="UTILITY">UTILITY</option>
                <option value="MARKETING">MARKETING</option>
                <option value="AUTHENTICATION">AUTHENTICATION</option>
              </select>
              <p className="text-xs text-muted-foreground">
                UTILITY: transaccional · MARKETING: promocional
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              Encabezado <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Texto del encabezado"
              value={form.headerText}
              onChange={handleChange('headerText')}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              Cuerpo del mensaje <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={4}
              placeholder={'Hola {{1}}, tu pedido #{{2}} está confirmado.'}
              value={form.bodyText}
              onChange={handleChange('bodyText')}
              className={cn(inputClass, 'resize-none')}
            />
            <p className="text-xs text-muted-foreground">
              Las variables van como{' '}
              <span className="font-mono bg-accent px-1 rounded">{'{{1}}'}</span>,{' '}
              <span className="font-mono bg-accent px-1 rounded">{'{{2}}'}</span>, etc.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              Pie de mensaje <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Pie del mensaje"
              value={form.footerText}
              onChange={handleChange('footerText')}
              className={inputClass}
            />
          </div>

          {submitError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{submitError}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md',
                'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                'disabled:opacity-50',
              )}
            >
              {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {createMutation.isPending ? 'Enviando...' : 'Enviar a aprobar'}
            </button>
            {submitSuccess && (
              <span className="text-sm text-muted-foreground">
                Plantilla enviada a revisión correctamente.
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Lista de plantillas */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-md font-semibold">Plantillas registradas</h2>
          <button
            type="button"
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'border border-border text-muted-foreground',
              'hover:text-foreground hover:bg-accent/50 transition-colors',
              'disabled:opacity-50',
            )}
          >
            <RefreshCw size={14} className={cn(syncMutation.isPending && 'animate-spin')} />
            {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar estados'}
          </button>
        </div>

        {syncMessage && (
          <p className="text-xs text-muted-foreground">{syncMessage}</p>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 size={16} className="animate-spin" /> Cargando plantillas...
          </div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
            No hay plantillas registradas todavía.
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => {
              const statusCfg = STATUS_CONFIG[t.status] ?? {
                label: t.status,
                className: 'bg-gray-100 text-gray-600',
              }
              return (
                <div
                  key={t.id}
                  className="p-3 rounded-md border border-border bg-background space-y-1.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium font-mono">{t.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                      {t.language}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                      {t.category}
                    </span>
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        statusCfg.className,
                      )}
                    >
                      {statusCfg.label}
                    </span>
                  </div>
                  {t.status === 'REJECTED' && t.rejectedReason && (
                    <p className="text-xs text-destructive">
                      Motivo de rechazo: {t.rejectedReason}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.bodyText}</p>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
