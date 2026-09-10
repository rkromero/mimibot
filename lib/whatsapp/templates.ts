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

export type MetaTemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string }

export type MetaComponent = {
  type: string
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  text?: string
  example?: { body_text?: string[][]; header_text?: string[] }
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
  variables?: Array<{ index: number; source: string; sample: string }>
}): Promise<{ id: string; status: string; category: string }> {
  const { wabaId, accessToken } = await getWabaConfig()

  const sortedVars = (params.variables ?? []).sort((a, b) => a.index - b.index)
  const bodySamples = sortedVars.map((v) => v.sample || `valor_${v.index}`)

  const bodyComp: MetaComponent = {
    type: 'BODY',
    text: params.bodyText,
    ...(bodySamples.length > 0 ? { example: { body_text: [bodySamples] } } : {}),
  }

  const components: MetaComponent[] = [bodyComp]

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

export type MetaTemplateSummary = {
  id: string
  name: string
  language: string
  status: string
  rejected_reason?: string
  category?: string
  /** Componentes tal como los devuelve Meta (cuerpo, encabezado, pie, botones) */
  components?: MetaComponent[]
}

/**
 * Lista TODAS las plantillas de la WABA configurada (sigue la paginación de Meta).
 */
export async function listMetaTemplates(): Promise<MetaTemplateSummary[]> {
  const { wabaId, accessToken } = await getWabaConfig()

  const all: MetaTemplateSummary[] = []
  let url: string | null =
    `${WA_API_BASE}/${wabaId}/message_templates?fields=id,name,language,status,category,rejected_reason,components&limit=100`

  while (url) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      const body = await res.json() as MetaErrorBody
      throw new Error(metaErrorMessage(body, res.status))
    }

    const data = await res.json() as {
      data?: MetaTemplateSummary[]
      paging?: { next?: string }
    }
    all.push(...(data.data ?? []))
    url = data.paging?.next ?? null
  }

  return all
}

export function templateKey(t: { name: string; language: string }): string {
  return `${t.name}|${t.language}`
}

export type LocalTemplateRef = { id: string; name: string; language: string }

export type TemplateSyncPlan = {
  /** Plantillas locales que existen en la WABA actual, con el dato fresco de Meta. */
  updates: Array<{ localId: string; meta: MetaTemplateSummary }>
  /** Plantillas locales que NO existen en la WABA actual (quedaron de otra cuenta o se borraron en Meta). */
  deleteIds: string[]
  /**
   * Plantillas que están en la WABA pero no localmente (creadas desde el
   * Administrador de WhatsApp de Meta, p. ej. las que llevan imagen en el
   * encabezado, que hoy no se pueden crear desde acá). Se importan.
   */
  inserts: MetaTemplateSummary[]
}

/**
 * Compara las plantillas guardadas localmente contra las que devuelve Meta para la WABA configurada.
 * La WABA es la fuente de verdad: lo que no está en Meta no se puede usar para enviar, así que se marca
 * para borrar; lo que está en Meta y acá no, se importa.
 */
export function planTemplateSync(local: LocalTemplateRef[], meta: MetaTemplateSummary[]): TemplateSyncPlan {
  const byKey = new Map<string, MetaTemplateSummary>()
  for (const m of meta) byKey.set(templateKey(m), m)

  const plan: TemplateSyncPlan = { updates: [], deleteIds: [], inserts: [] }
  const vistas = new Set<string>()
  for (const l of local) {
    const key = templateKey(l)
    const m = byKey.get(key)
    if (m) {
      plan.updates.push({ localId: l.id, meta: m })
      vistas.add(key)
    } else {
      plan.deleteIds.push(l.id)
    }
  }
  for (const m of meta) {
    if (!vistas.has(templateKey(m))) plan.inserts.push(m)
  }
  return plan
}

export type MetaTemplateHeaderFormat = 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO'

export type ContenidoPlantillaMeta = {
  bodyText: string
  headerText: string | null
  /** null = la plantilla no tiene encabezado */
  headerFormat: MetaTemplateHeaderFormat | null
  footerText: string | null
  buttons: MetaTemplateButton[]
}

const HEADER_FORMATS: ReadonlySet<string> = new Set(['TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO'])

/**
 * Traduce los `components` que devuelve Meta al shape que guardamos en
 * `whatsapp_templates`. Tolerante a lo que falte: una plantilla sin BODY queda
 * con cuerpo vacío en vez de romper la sincronización.
 */
export function parseMetaComponents(components: MetaComponent[] | undefined): ContenidoPlantillaMeta {
  const out: ContenidoPlantillaMeta = { bodyText: '', headerText: null, headerFormat: null, footerText: null, buttons: [] }
  for (const c of components ?? []) {
    const tipo = (c.type ?? '').toUpperCase()
    if (tipo === 'BODY') {
      out.bodyText = c.text ?? ''
    } else if (tipo === 'HEADER') {
      const fmt = (c.format ?? 'TEXT').toUpperCase()
      out.headerFormat = HEADER_FORMATS.has(fmt) ? (fmt as MetaTemplateHeaderFormat) : null
      out.headerText = fmt === 'TEXT' ? (c.text ?? null) : null
    } else if (tipo === 'FOOTER') {
      out.footerText = c.text ?? null
    } else if (tipo === 'BUTTONS') {
      out.buttons = c.buttons ?? []
    }
  }
  return out
}
