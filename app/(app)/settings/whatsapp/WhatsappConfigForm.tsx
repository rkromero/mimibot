'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { WhatsappConfig } from '@/types/db'

type Props = { initialConfig: WhatsappConfig | null }

type FormState = {
  phoneNumberId: string
  accessToken: string
  appSecret: string
  verifyToken: string
}

export default function WhatsappConfigForm({ initialConfig }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTokens, setShowTokens] = useState(false)

  const [form, setForm] = useState<FormState>({
    phoneNumberId: initialConfig?.phoneNumberId ?? '',
    accessToken: initialConfig?.accessToken ?? '',
    appSecret: initialConfig?.appSecret ?? '',
    verifyToken: initialConfig?.verifyToken ?? '',
  })

  function handleChange(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    startTransition(async () => {
      const res = await fetch('/api/settings/whatsapp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  const isConfigured = initialConfig?.isConfigured ?? false
  const inputClass = cn(
    'w-full px-3 py-2 text-sm rounded-md border',
    'border-border bg-background text-foreground',
    'focus:outline-none focus:ring-1 focus:ring-ring',
  )

  return (
    <div className="max-w-2xl space-y-6">

      {/* Estado de conexión */}
      <div className="flex items-center gap-2">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
          isConfigured
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
        )}>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full',
            isConfigured ? 'bg-green-500' : 'bg-yellow-500',
          )} />
          {isConfigured ? 'Configurado' : 'Sin configurar'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        <div>
          <h2 className="text-md font-semibold mb-1">Conexión con WhatsApp Business</h2>
          <p className="text-sm text-muted-foreground">
            Ingresá los datos de tu app de Meta para conectar el número de WhatsApp.
            Encontrás estos valores en{' '}
            <span className="font-medium text-foreground">Meta for Developers → Tu App → WhatsApp → Configuración de la API</span>.
          </p>
        </div>

        {/* Phone Number ID */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">
            Phone Number ID
          </label>
          <input
            type="text"
            required
            placeholder="Ej: 123456789012345"
            value={form.phoneNumberId}
            onChange={handleChange('phoneNumberId')}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            Número de ID del teléfono de WhatsApp Business. Lo encontrás en <span className="font-medium">WhatsApp → Configuración de la API → ID del número de teléfono</span>.
          </p>
        </div>

        {/* Access Token */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Access Token</label>
            <button
              type="button"
              onClick={() => setShowTokens((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showTokens ? 'Ocultar tokens' : 'Mostrar tokens'}
            </button>
          </div>
          <input
            type={showTokens ? 'text' : 'password'}
            required
            placeholder="EAAx... (token permanente del usuario del sistema)"
            value={form.accessToken}
            onChange={handleChange('accessToken')}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            Token de acceso permanente. Creá un <span className="font-medium">Usuario del sistema</span> en Configuración del negocio y generá un token con permiso <span className="font-mono">whatsapp_business_messaging</span>.
          </p>
        </div>

        {/* App Secret */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">App Secret</label>
          <input
            type={showTokens ? 'text' : 'password'}
            required
            placeholder="Secreto de la app de Meta"
            value={form.appSecret}
            onChange={handleChange('appSecret')}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            Secreto de la aplicación. Lo encontrás en <span className="font-medium">Configuración de la app → Básica → Secreto de la aplicación</span>.
          </p>
        </div>

        {/* Verify Token */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Verify Token</label>
          <input
            type="text"
            required
            placeholder="Ej: mi_token_secreto_webhook"
            value={form.verifyToken}
            onChange={handleChange('verifyToken')}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            Cadena personalizada que vos elegís. Ingresá el mismo valor en <span className="font-medium">WhatsApp → Configuración → Webhook → Token de verificación</span>.
          </p>
        </div>

        {/* Webhook URL info */}
        <div className="rounded-md border border-border bg-accent/30 px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-foreground">URL del Webhook</p>
          <p className="text-xs text-muted-foreground">
            Configurá esta URL en Meta como Callback URL del webhook:
          </p>
          <p className="text-xs font-mono bg-background border border-border rounded px-2 py-1 mt-1 break-all">
            {'https://<tu-dominio>/api/whatsapp/webhook'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Suscribite al campo <span className="font-mono">messages</span> en la configuración del webhook.
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
            {isPending ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {saved && <span className="text-sm text-muted-foreground">Guardado correctamente.</span>}
        </div>
      </form>
    </div>
  )
}
