import { db } from '@/db'

const WA_API_VERSION = 'v21.0'
const WA_API_BASE = `https://graph.facebook.com/${WA_API_VERSION}`

export async function getWabaConfig(): Promise<{ wabaId: string; accessToken: string }> {
  const cfg = await db.query.whatsappConfig.findFirst()

  const wabaId = (cfg?.isConfigured && cfg.wabaId) || process.env['WA_WABA_ID'] || ''
  const accessToken = (cfg?.isConfigured && cfg.accessToken) || process.env['WA_ACCESS_TOKEN'] || ''

  if (!wabaId) {
    throw new Error('WhatsApp Business Account ID (WABA ID) no está configurado. Completalo en Ajustes → WhatsApp.')
  }
  if (!accessToken) {
    throw new Error('WhatsApp Access Token no está configurado.')
  }
  return { wabaId, accessToken }
}

type MetaTemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string }

type MetaComponent = {
  type: string
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  text?: string
  buttons?: MetaTemplateButton[]
}

type MetaErrorBody = {
  error?: {
    message?: string
    code?: number
    error_subcode?: number
    error_user_title?: string
    error_user_msg?: string
    error_data?: { details?: string }
  }
}

function metaErrorMessage(body: MetaErrorBody, statusCode: number): string {
  const e = body?.error
  if (!e) return `Error ${statusCode}`
  const detail = e.error_user_msg ?? e.error_user_title ?? e.message ?? `Error ${statusCode}`
  const code = e.code != null ? `code ${e.code}${e.error_subcode != null ? `/${e.error_subcode}` : ''}` : null
  const extra = e.error_data?.details ? ` — ${e.error_data.details}` : ''
  return `Meta API error: ${detail}${code ? ` (${code})` : ''}${extra}`
}

export async function createMetaTemplate(params: {
  name: string
  language: string
  category: string
  bodyText: string
  headerText?: string
  footerText?: string
  buttons?: MetaTemplateButton[]
}): Promise<{ id: string; status: string; category: string }> {
  const { wabaId, accessToken } = await getWabaConfig()

  const components: MetaComponent[] = [{ type: 'BODY', text: params.bodyText }]

  if (params.headerText?.trim()) {
    components.unshift({ type: 'HEADER', format: 'TEXT', text: params.headerText.trim() })
  }
  if (params.footerText?.trim()) {
    components.push({ type: 'FOOTER', text: params.footerText.trim() })
  }
  if (params.buttons && params.buttons.length > 0) {
    components.push({ type: 'BUTTONS', buttons: params.buttons })
  }

  const res = await fetch(`${WA_API_BASE}/${wabaId}/message_templates`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: params.name,
      language: params.language,
      category: params.category,
      components,
    }),
  })

  if (!res.ok) {
    const body = await res.json() as MetaErrorBody
    throw new Error(metaErrorMessage(body, res.status))
  }

  return res.json() as Promise<{ id: string; status: string; category: string }>
}

export async function listMetaTemplates(): Promise<Array<{
  id: string
  name: string
  language: string
  status: string
  rejected_reason?: string
}>> {
  const { wabaId, accessToken } = await getWabaConfig()

  const res = await fetch(`${WA_API_BASE}/${wabaId}/message_templates?limit=100`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const body = await res.json() as MetaErrorBody
    throw new Error(metaErrorMessage(body, res.status))
  }

  const data = await res.json() as {
    data: Array<{ id: string; name: string; language: string; status: string; rejected_reason?: string }>
  }
  return data.data
}
