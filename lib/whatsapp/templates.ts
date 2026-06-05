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
  text?: string
  buttons?: MetaTemplateButton[]
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

  if (params.headerText) {
    components.unshift({ type: 'HEADER', text: params.headerText })
  }
  if (params.footerText) {
    components.push({ type: 'FOOTER', text: params.footerText })
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
    const body = await res.json() as { error?: { message?: string } }
    const msg = body?.error?.message ?? `Error ${res.status}`
    throw new Error(`Meta API error: ${msg}`)
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
    const body = await res.json() as { error?: { message?: string } }
    const msg = body?.error?.message ?? `Error ${res.status}`
    throw new Error(`Meta API error: ${msg}`)
  }

  const data = await res.json() as {
    data: Array<{ id: string; name: string; language: string; status: string; rejected_reason?: string }>
  }
  return data.data
}
