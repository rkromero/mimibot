'use client'

import { useState, useTransition, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WhatsappConfig } from '@/types/db'

type TemplateRecord = { id: string; name: string; language: string; bodyText: string; status: string }

function WebhookUrlBlock() {
  const [copied, setCopied] = useState(false)
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const url = `${base}/api/whatsapp/webhook`

  function handleCopy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="rounded-md border border-border bg-accent/30 px-4 py-3 space-y-1">
      <p className="text-xs font-medium text-foreground">URL del Webhook</p>
      <p className="text-xs text-muted-foreground">
        Configurá esta URL en Meta como Callback URL del webhook:
      </p>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-xs font-mono bg-background border border-border rounded px-2 py-1 break-all flex-1">
          {url}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 p-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          title="Copiar URL"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Suscribite al campo <span className="font-mono">messages</span> en la configuración del webhook.
      </p>
    </div>
  )
}

type Props = { initialConfig: WhatsappConfig | null }

type FormState = {
  phoneNumberId: string
  accessToken: string
  appSecret: string
  verifyToken: string
  wabaId: string
  aperturaTemplateName: string
  aperturaTemplateLang: string
  pedidoCreadoEnabled: boolean
  pedidoCreadoTemplateName: string
  pedidoCreadoTemplateLang: string
}

export default function WhatsappConfigForm({ initialConfig }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTokens, setShowTokens] = useState(false)
  const [approvedTemplates, setApprovedTemplates] = useState<TemplateRecord[]>([])

  const [form, setForm] = useState<FormState>({
    phoneNumberId: initialConfig?.phoneNumberId ?? '',
    accessToken: initialConfig?.accessToken ?? '',
    appSecret: initialConfig?.appSecret ?? '',
    verifyToken: initialConfig?.verifyToken ?? '',
    wabaId: initialConfig?.wabaId ?? '',
    aperturaTemplateName: initialConfig?.aperturaTemplateName ?? '',
    aperturaTemplateLang: initialConfig?.aperturaTemplateLang ?? '',
    pedidoCreadoEnabled: initialConfig?.pedidoCreadoEnabled ?? false,
    pedidoCreadoTemplateName: initialConfig?.pedidoCreadoTemplateName ?? '',
    pedidoCreadoTemplateLang: initialConfig?.pedidoCreadoTemplateLang ?? '',
  })

  useEffect(() => {
    void fetch('/api/settings/whatsapp/templates')
      .then(r => r.ok ? r.json() as Promise<{ data?: TemplateRecord[] }> : null)
      .then(data => {
        if (!data?.data) return
        setApprovedTemplates(data.data.filter(t => t.status === 'APPROVED'))
      })
      .catch(() => null)
  }, [])

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

        {/* WABA ID */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">WhatsApp Business Account ID (WABA ID)</label>
          <input
            type="text"
            placeholder="Ej: 123456789012345"
            value={form.wabaId}
            onChange={handleChange('wabaId')}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            ID de tu cuenta de WhatsApp Business (WABA). Es <span className="font-medium">distinto</span> del Phone Number ID de arriba.
            Lo encontrás en <span className="font-medium">Meta Business Suite → Configuración → Cuentas de WhatsApp Business</span>.
            Es necesario para registrar y enviar plantillas a revisión.
          </p>
        </div>

        {/* Webhook URL info */}
        <WebhookUrlBlock />

        {/* Plantilla de apertura */}
        <div className="pt-4 border-t border-border space-y-3">
          <div>
            <h2 className="text-md font-semibold mb-1">Plantilla de apertura de conversación</h2>
            <p className="text-sm text-muted-foreground">
              Cuando han pasado más de 24h desde el último mensaje del cliente, WhatsApp requiere iniciar con una plantilla aprobada.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Plantilla de apertura</label>
            <select
              value={form.aperturaTemplateName && form.aperturaTemplateLang
                ? `${form.aperturaTemplateName}::${form.aperturaTemplateLang}`
                : ''}
              onChange={(e) => {
                if (!e.target.value) {
                  setForm(p => ({ ...p, aperturaTemplateName: '', aperturaTemplateLang: '' }))
                  return
                }
                const parts = e.target.value.split('::')
                setForm(p => ({ ...p, aperturaTemplateName: parts[0] ?? '', aperturaTemplateLang: parts[1] ?? '' }))
              }}
              className={inputClass}
            >
              <option value="">— Sin plantilla —</option>
              {approvedTemplates.map(t => (
                <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                  {t.name} ({t.language})
                </option>
              ))}
            </select>
            {approvedTemplates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No hay plantillas aprobadas. Aprobá una en la sección Plantillas de WhatsApp.
              </p>
            )}
            {form.aperturaTemplateName && (
              <p className="text-xs text-muted-foreground">
                Si el cuerpo de la plantilla usa <span className="font-mono">{'{{1}}'}</span>, se reemplazará automáticamente con el nombre del cliente.
              </p>
            )}
          </div>
        </div>

        {/* Notificación de pedido creado */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-md font-semibold mb-0.5">Confirmación de pedido por WhatsApp</h2>
              <p className="text-sm text-muted-foreground">
                Envía automáticamente una notificación al cliente cuando se crea un pedido.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.pedidoCreadoEnabled}
              onClick={() => setForm(p => ({ ...p, pedidoCreadoEnabled: !p.pedidoCreadoEnabled }))}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                form.pedidoCreadoEnabled ? 'bg-primary' : 'bg-input',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg',
                  'transform transition duration-200',
                  form.pedidoCreadoEnabled ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>
          {form.pedidoCreadoEnabled && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">Plantilla de confirmación de pedido</label>
              <select
                value={form.pedidoCreadoTemplateName && form.pedidoCreadoTemplateLang
                  ? `${form.pedidoCreadoTemplateName}::${form.pedidoCreadoTemplateLang}`
                  : ''}
                onChange={(e) => {
                  if (!e.target.value) {
                    setForm(p => ({ ...p, pedidoCreadoTemplateName: '', pedidoCreadoTemplateLang: '' }))
                    return
                  }
                  const parts = e.target.value.split('::')
                  setForm(p => ({ ...p, pedidoCreadoTemplateName: parts[0] ?? '', pedidoCreadoTemplateLang: parts[1] ?? '' }))
                }}
                className={inputClass}
              >
                <option value="">— Seleccionar plantilla —</option>
                {approvedTemplates.map(t => (
                  <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
              {approvedTemplates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay plantillas aprobadas. Aprobá una en la sección Plantillas de WhatsApp.
                </p>
              )}
              {form.pedidoCreadoTemplateName && (
                <p className="text-xs text-muted-foreground">
                  Variables disponibles: <span className="font-mono">{'{{1}}'}</span> nombre del cliente, <span className="font-mono">{'{{2}}'}</span> nº de pedido, <span className="font-mono">{'{{3}}'}</span> total.
                </p>
              )}
            </div>
          )}
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
