/**
 * Envío de una propuesta: por WhatsApp (documento en la conversación del
 * lead) y el cierre común a cualquier vía (estado enviada, actividad, etapa
 * "Propuesta enviada", seguimiento). Lo usan la ruta de la ficha
 * (app/api/propuestas/[id]/enviar) y el bot al calificar (bot-propuesta.ts).
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { propuestas, conversations, messages, activityLog } from '@/db/schema'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { generarPropuestaPdf } from '@/lib/pdf/propuesta.service'
import { formatNumeroPropuesta } from '@/lib/pdf/propuesta.template'
import { uploadMediaToMeta, sendMediaMessage } from '@/lib/whatsapp/client'
import { persistOutboundMedia } from '@/lib/whatsapp/media'
import { programarSeguimientoPropuesta } from '@/lib/followup/engine'
import { envioDisparaSeguimiento } from '@/lib/followup/propuesta'
import { onPropuestaEnviada } from '@/lib/leads/propuesta-enviada'
import { activarModoPostPropuesta } from '@/lib/claude/bot-post-propuesta'

export type ViaEnvioPropuesta = 'descarga' | 'whatsapp' | 'email'

/** Quién figura como emisor del mensaje con el PDF en el chat. */
export type RemitentePropuesta = { senderType: 'agent' | 'bot'; senderId: string | null }

/**
 * Manda el PDF como documento por WhatsApp. Mismo flujo que los adjuntos del
 * inbox: fila de mensaje + copia en R2 + upload a Meta + envío.
 */
export async function enviarPropuestaPorWhatsapp(
  leadId: string,
  buffer: Buffer,
  filename: string,
  numeroFmt: string,
  remitente: RemitentePropuesta,
): Promise<void> {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.leadId, leadId),
    columns: { id: true, waContactPhone: true },
  })
  if (!conv?.waContactPhone) {
    throw new ValidationError('El lead no tiene conversación de WhatsApp para enviar la propuesta')
  }

  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      direction: 'outbound',
      senderType: remitente.senderType,
      senderId: remitente.senderId,
      contentType: 'document',
      body: `Propuesta ${numeroFmt}`,
      isRead: true,
      sentAt: new Date(),
    })
    .returning()

  const [, metaMediaId] = await Promise.all([
    persistOutboundMedia({
      buffer,
      messageId: msg!.id,
      conversationId: conv.id,
      mimeType: 'application/pdf',
      filename,
    }),
    uploadMediaToMeta(buffer, 'application/pdf', filename),
  ])

  const waMessageId = await sendMediaMessage(
    conv.waContactPhone,
    metaMediaId,
    'document',
    `Propuesta ${numeroFmt}`,
  )
  await db.update(messages).set({ waMessageId }).where(eq(messages.id, msg!.id))

  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conv.id}`,
  )
}

/**
 * Cierre común después de que la propuesta salió por cualquier vía: pasa a
 * 'enviada', deja actividad y, si es un envío real (no una re-descarga),
 * mueve el lead a "Propuesta enviada" y programa el seguimiento (best-effort).
 */
export async function registrarEnvioPropuesta(params: {
  propuestaId: string
  leadId: string
  numero: number
  via: ViaEnvioPropuesta
  userId: string
  yaEstabaEnviada: boolean
}): Promise<{ etapaMovida: boolean }> {
  const { propuestaId, leadId, numero, via, userId, yaEstabaEnviada } = params

  await db
    .update(propuestas)
    .set({ estado: 'enviada', updatedAt: new Date() })
    .where(eq(propuestas.id, propuestaId))

  await db.insert(activityLog).values({
    leadId,
    userId,
    action: 'propuesta_enviada',
    metadata: { propuestaId, numero, via },
  })

  if (!envioDisparaSeguimiento({ via, yaEstabaEnviada })) return { etapaMovida: false }

  const etapa = await onPropuestaEnviada(leadId, userId, propuestaId)
  void programarSeguimientoPropuesta(leadId).catch((err) => {
    console.error('[propuesta] no se pudo programar el seguimiento:', err)
  })
  // El bot sigue la charla después de la propuesta (dudas, muestra, primer pedido)
  try {
    await activarModoPostPropuesta(leadId)
  } catch (err) {
    console.error('[propuesta] no se pudo activar el modo post-propuesta del bot:', err)
  }
  return { etapaMovida: etapa.etapaMovida }
}

/**
 * El bot manda la propuesta recién creada por WhatsApp a nombre del vendedor
 * asignado (el mensaje figura como del bot). Lanza si falla el PDF o el envío:
 * en ese caso la propuesta queda en borrador para mandarla desde la ficha.
 */
export async function enviarPropuestaDesdeBot(propuestaId: string, userId: string): Promise<{ etapaMovida: boolean }> {
  const propuesta = await db.query.propuestas.findFirst({
    where: and(eq(propuestas.id, propuestaId), isNull(propuestas.deletedAt)),
    columns: { id: true, leadId: true, numero: true, estado: true },
  })
  if (!propuesta) throw new NotFoundError('Propuesta')

  const pdf = await generarPropuestaPdf(propuestaId)
  await enviarPropuestaPorWhatsapp(propuesta.leadId, pdf.buffer, pdf.filename, formatNumeroPropuesta(pdf.numero), {
    senderType: 'bot',
    senderId: null,
  })
  return registrarEnvioPropuesta({
    propuestaId,
    leadId: propuesta.leadId,
    numero: pdf.numero,
    via: 'whatsapp',
    userId,
    yaEstabaEnviada: propuesta.estado === 'enviada',
  })
}
