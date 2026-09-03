import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leads, conversations, messages, activityLog, whatsappConfig, whatsappTemplates, users } from '@/db/schema'
import { sendTemplateMessage, buildBodyComponents } from '@/lib/whatsapp/client'
import { resolveTemplateVariables, applyTemplateValues } from '@/lib/whatsapp/variables'
import { variablesParaChat } from '@/lib/whatsapp/apertura'
import { publishCrmEvent } from '@/lib/realtime/broker'

/**
 * Plantilla de apertura automática a leads nuevos.
 *
 * Al entrar un lead desde una landing (o al crearlo a mano con el tilde
 * marcado) se le manda la plantilla de apertura configurada en Ajustes →
 * WhatsApp, con el nombre del vendedor que le asignó la regla. Es un mensaje
 * iniciado por el negocio, así que siempre va como plantilla aprobada (no hay
 * ventana de 24 hs todavía). Cuando la persona responde, sigue el bot.
 *
 * Se manda una sola vez por lead (`aperturaEnviadaAt`). Si no se puede mandar
 * (sin plantilla, no aprobada, número sin WhatsApp), queda nota en la
 * actividad y en el chat y el lead sigue "sin contactar" para que alguien lo
 * llame: no se marca `lastContactedAt`.
 */

/** Comodines para que Meta nunca reciba una variable vacía (rechaza el envío). */
export const PRODUCTO_FALLBACK = 'tu producto'
export const REMITENTE_FALLBACK = 'el equipo'
const NOMBRE_FALLBACK = 'buenas'

export type ResultadoApertura = { enviada: true; body: string } | { enviada: false; motivo: string }

/**
 * Contexto de variables de la plantilla: nombre del lead, vendedor (el
 * asignado, si no el nombre por defecto de Ajustes, si no "el equipo") y
 * producto de interés (o "tu producto").
 */
export function contextoApertura(p: {
  contactName: string | null | undefined
  vendedorNombre: string | null | undefined
  nombreDefault: string | null | undefined
  productInterest: string | null | undefined
}): { clienteNombre: string; vendedorNombre: string; productoInteres: string } {
  return {
    clienteNombre: p.contactName?.trim() || NOMBRE_FALLBACK,
    vendedorNombre: p.vendedorNombre?.trim() || p.nombreDefault?.trim() || REMITENTE_FALLBACK,
    productoInteres: p.productInterest?.trim() || PRODUCTO_FALLBACK,
  }
}

async function noEnviada(leadId: string, motivo: string, conversationId?: string): Promise<ResultadoApertura> {
  const texto = `No se pudo mandar la plantilla de apertura: ${motivo}. Contactalo a mano.`
  await db.insert(activityLog).values({
    leadId,
    action: 'note_added',
    metadata: { sistema: true, motivo: 'apertura_no_enviada', detalle: motivo, texto },
  })
  if (conversationId) {
    await db.insert(messages).values({
      conversationId,
      direction: 'outbound',
      senderType: 'system',
      contentType: 'internal_note',
      body: texto,
      isRead: true,
      sentAt: new Date(),
    })
  }
  return { enviada: false, motivo }
}

/**
 * Manda la plantilla de apertura al lead. `remitenteNombre` es el nombre a
 * usar si el lead no tiene vendedor asignado (p. ej. quien lo creó a mano).
 */
export async function enviarAperturaLead(
  leadId: string,
  opts: { origen: 'landing' | 'manual'; remitenteNombre?: string | null },
): Promise<ResultadoApertura> {
  const config = await db.query.whatsappConfig.findFirst()
  const templateName = config?.aperturaTemplateName?.trim() || null
  const templateLang = config?.aperturaTemplateLang?.trim() || 'es'
  if (!templateName) return noEnviada(leadId, 'no hay plantilla de apertura configurada en Ajustes → WhatsApp')

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId), with: { contact: true } })
  if (!lead) return { enviada: false, motivo: 'Lead inexistente' }
  if (lead.aperturaEnviadaAt) return { enviada: false, motivo: 'La apertura ya se mandó' }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.leadId, leadId),
    columns: { id: true, waContactPhone: true },
  })
  if (!conversation?.waContactPhone) return noEnviada(leadId, 'el lead no tiene teléfono de WhatsApp')

  const tmpl = await db.query.whatsappTemplates.findFirst({
    where: and(
      eq(whatsappTemplates.name, templateName),
      eq(whatsappTemplates.language, templateLang),
      eq(whatsappTemplates.status, 'APPROVED'),
    ),
    columns: { bodyText: true, variables: true },
  })
  if (!tmpl) {
    return noEnviada(leadId, `la plantilla "${templateName}" (${templateLang}) no está aprobada en WhatsApp`, conversation.id)
  }

  let vendedorNombre = opts.remitenteNombre ?? null
  if (lead.assignedTo) {
    const vendedor = await db.query.users.findFirst({ where: eq(users.id, lead.assignedTo), columns: { name: true } })
    vendedorNombre = vendedor?.name ?? vendedorNombre
  }
  const ctx = contextoApertura({
    contactName: lead.contact?.name,
    vendedorNombre,
    nombreDefault: config?.aperturaNombreDefault,
    productInterest: lead.productInterest,
  })
  const valores = resolveTemplateVariables(variablesParaChat(tmpl.bodyText, tmpl.variables), ctx)
  const body = applyTemplateValues(tmpl.bodyText, valores).trim()

  let waMessageId: string
  try {
    waMessageId = await sendTemplateMessage(conversation.waContactPhone, templateName, templateLang, buildBodyComponents(valores))
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err)
    return noEnviada(leadId, `WhatsApp rechazó el envío (${detalle})`, conversation.id)
  }

  const ahora = new Date()
  await db.insert(messages).values({
    conversationId: conversation.id,
    waMessageId,
    direction: 'outbound',
    senderType: 'agent',
    senderId: lead.assignedTo ?? null,
    contentType: 'template',
    body,
    isRead: true,
    sentAt: ahora,
  })
  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversation.id}`,
  )
  await db.update(leads)
    .set({ aperturaEnviadaAt: ahora, lastContactedAt: ahora, updatedAt: ahora })
    .where(eq(leads.id, leadId))
  await db.insert(activityLog).values({
    leadId,
    action: 'note_added',
    metadata: {
      sistema: true,
      motivo: 'apertura_automatica',
      origen: opts.origen,
      templateName,
      texto: `Plantilla de apertura "${templateName}" enviada automáticamente por WhatsApp.`,
    },
  })
  await publishCrmEvent({
    type: 'new_message',
    conversationId: conversation.id,
    leadId,
    assignedTo: lead.assignedTo ?? null,
    direction: 'outbound',
  })

  return { enviada: true, body }
}
