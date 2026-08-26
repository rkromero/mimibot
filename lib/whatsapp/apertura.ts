/**
 * Apertura de conversación fuera de la ventana de 24 hs.
 *
 * WhatsApp solo deja iniciar (o retomar) una conversación con una plantilla
 * aprobada cuando la persona no escribió en las últimas 24 hs. Acá vive lo
 * que comparten el chat (vista previa + elección de plantilla) y el endpoint
 * de envío (resolución de la conversación y de las variables).
 */
import { db } from '@/db'
import { conversations, whatsappConfig, whatsappTemplates } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { Session } from 'next-auth'
import { AuthzError, NotFoundError, ValidationError } from '@/lib/errors'
import {
  applyTemplateValues,
  resolveTemplateVariables,
  toTemplateVariables,
  type TemplateVarCtx,
  type TemplateVariable,
} from '@/lib/whatsapp/variables'

type SessionUser = Session['user']

export type ConversacionParaEnvio = {
  waContactPhone: string
  /** Nombre completo del contacto (cliente: nombre + apellido; lead: nombre del contacto) */
  contactName: string
  /** Producto que el lead marcó en el landing; null para clientes */
  productoInteres: string | null
}

/** Carga la conversación con lo justo para enviar, verificando que el usuario tenga acceso. */
export async function resolverConversacionParaEnvio(
  user: SessionUser,
  conversationId: string,
): Promise<ConversacionParaEnvio> {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { id: true, waContactPhone: true, clienteId: true, leadId: true },
    with: {
      cliente: { columns: { asignadoA: true, nombre: true, apellido: true } },
      lead: {
        columns: { id: true, assignedTo: true, productInterest: true },
        with: { contact: { columns: { name: true } } },
      },
    },
  })

  if (!conv) throw new NotFoundError('Conversación')
  if (!conv.waContactPhone) throw new ValidationError('La conversación no tiene teléfono de contacto')

  if (user.role !== 'admin' && user.role !== 'gerente') {
    const effectiveAssignment = conv.clienteId
      ? conv.cliente?.asignadoA ?? null
      : conv.lead?.assignedTo ?? null
    if (effectiveAssignment !== user.id) {
      throw new AuthzError('No tenés acceso a esta conversación')
    }
  }

  const contactName = conv.clienteId
    ? `${conv.cliente?.nombre ?? ''} ${conv.cliente?.apellido ?? ''}`.trim()
    : (conv.lead?.contact?.name ?? '')
  const productoInteres = conv.clienteId ? null : (conv.lead?.productInterest ?? null)

  return { waContactPhone: conv.waContactPhone, contactName, productoInteres }
}

/** Orígenes que solo tienen sentido en la notificación de pedido: no se pueden resolver desde el chat. */
const SOURCES_SOLO_PEDIDO = new Set(['pedido_numero', 'pedido_total'])

/**
 * Variables con las que se manda una plantilla desde el chat: las configuradas
 * al registrarla o, para plantillas viejas sin configuración, {{1}} = nombre.
 */
export function variablesParaChat(bodyText: string, rawVariables: unknown): TemplateVariable[] {
  const configuradas = toTemplateVariables(rawVariables)
  if (configuradas.length > 0) return configuradas
  return bodyText.includes('{{1}}') ? [{ index: 1, source: 'cliente_nombre', sample: 'Cliente' }] : []
}

/** ¿La plantilla se puede enviar desde el chat (ninguna variable depende de un pedido)? */
export function plantillaUsableEnChat(variables: TemplateVariable[]): boolean {
  return variables.every((v) => !SOURCES_SOLO_PEDIDO.has(v.source))
}

export type PlantillaApertura = {
  name: string
  language: string
  /** Cuerpo con las variables ya resueltas para esta conversación */
  preview: string
  /** Es la plantilla de apertura configurada en Ajustes → WhatsApp */
  esPredeterminada: boolean
}

/**
 * Plantillas aprobadas que se pueden mandar desde el chat, con el texto ya
 * resuelto para la conversación. La predeterminada (Ajustes → WhatsApp) va primero.
 */
export async function listarPlantillasApertura(ctx: TemplateVarCtx): Promise<PlantillaApertura[]> {
  const [config, aprobadas] = await Promise.all([
    db.query.whatsappConfig.findFirst({ columns: { aperturaTemplateName: true, aperturaTemplateLang: true } }),
    db.query.whatsappTemplates.findMany({
      where: eq(whatsappTemplates.status, 'APPROVED'),
      columns: { name: true, language: true, bodyText: true, variables: true },
    }),
  ])

  const lista: PlantillaApertura[] = []
  for (const t of aprobadas) {
    const vars = variablesParaChat(t.bodyText, t.variables)
    if (!plantillaUsableEnChat(vars)) continue
    const valores = resolveTemplateVariables(vars, ctx)
    lista.push({
      name: t.name,
      language: t.language,
      preview: applyTemplateValues(t.bodyText, valores).trim(),
      esPredeterminada:
        t.name === config?.aperturaTemplateName &&
        t.language === (config?.aperturaTemplateLang ?? 'es'),
    })
  }

  return lista.sort((a, b) => Number(b.esPredeterminada) - Number(a.esPredeterminada) || a.name.localeCompare(b.name))
}
