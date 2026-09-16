/**
 * Envío de un archivo (PDF, foto) por el WhatsApp embebido a la conversación
 * del cliente. Es el paso común de "Enviar proforma" y "Enviar comprobante":
 * fila de mensaje + copia en R2 + upload a Meta + envío. Queda en el chat con
 * sus tildes, igual que los adjuntos del inbox.
 *
 * Las verificaciones (teléfono y ventana de 24 hs) van en `prepararEnvioAlCliente`
 * para que el caller pueda hacerlas ANTES de generar el archivo y no gastar,
 * por ejemplo, un número de proforma en un envío que no va a salir.
 */
import { db } from '@/db'
import { conversations, messages } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { AppError, ValidationError } from '@/lib/errors'
import { ensureConversacionParaCliente } from '@/lib/inbox/ensure-conversacion'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import { sendMediaMessage, uploadMediaToMeta } from '@/lib/whatsapp/client'
import { persistOutboundMedia } from '@/lib/whatsapp/media'
import { waMediaType } from '@/lib/whatsapp/mime'

export const MENSAJE_VENTANA_CERRADA =
  'Pasaron más de 24 hs desde el último mensaje del cliente: WhatsApp no deja mandar documentos. ' +
  'Abrí el chat, mandale una plantilla de apertura y cuando responda enviá la proforma.'

/** La conversación del cliente está fuera de la ventana de 24 hs de WhatsApp. */
export class VentanaCerradaError extends AppError {
  constructor(mensaje: string = MENSAJE_VENTANA_CERRADA) {
    super(mensaje, 422, 'WINDOW_CLOSED')
    this.name = 'VentanaCerradaError'
  }
}

/** WhatsApp (Meta) rechazó el envío; el mensaje queda marcado como fallido en el chat. */
export class EnvioWhatsappError extends AppError {
  constructor(detalle: string) {
    super(`No se pudo enviar por WhatsApp: ${detalle}`, 502, 'WA_SEND_FAILED')
    this.name = 'EnvioWhatsappError'
  }
}

export type DestinoCliente = { conversationId: string; waContactPhone: string }

/**
 * Conversación y teléfono del cliente, verificando la ventana de 24 hs.
 * Tira ValidationError si el cliente no tiene teléfono válido y
 * VentanaCerradaError (con el mensaje dado) si no escribió en las últimas 24 hs.
 */
export async function prepararEnvioAlCliente(
  clienteId: string,
  mensajeVentanaCerrada?: string,
): Promise<DestinoCliente> {
  const { conversationId } = await ensureConversacionParaCliente(clienteId)

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { id: true, waContactPhone: true },
  })
  if (!conv?.waContactPhone) {
    throw new ValidationError('La conversación del cliente no tiene teléfono de WhatsApp')
  }

  if (!(await estaDentroDe24h(conversationId))) {
    throw new VentanaCerradaError(mensajeVentanaCerrada)
  }

  return { conversationId, waContactPhone: conv.waContactPhone }
}

export type ArchivoParaCliente = {
  buffer: Buffer
  mimeType: string
  filename: string
  /** Texto que acompaña al archivo en el chat. */
  caption: string
}

export type EnvioArchivoResult = { conversationId: string; messageId: string; waMessageId: string }

/** Manda el archivo al chat del cliente ya verificado con `prepararEnvioAlCliente`. */
export async function enviarArchivoAlCliente(
  destino: DestinoCliente,
  archivo: ArchivoParaCliente,
  userId: string,
): Promise<EnvioArchivoResult> {
  const { conversationId, waContactPhone } = destino
  const mediaKind = waMediaType(archivo.mimeType)

  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      direction: 'outbound',
      senderType: 'agent',
      senderId: userId,
      contentType: mediaKind,
      body: archivo.caption,
      isRead: true,
      sentAt: new Date(),
    })
    .returning()
  const messageId = msg!.id

  let waMessageId: string
  try {
    const [, metaMediaId] = await Promise.all([
      persistOutboundMedia({
        buffer: archivo.buffer,
        messageId,
        conversationId,
        mimeType: archivo.mimeType,
        filename: archivo.filename,
      }),
      uploadMediaToMeta(archivo.buffer, archivo.mimeType, archivo.filename),
    ])
    waMessageId = await sendMediaMessage(waContactPhone, metaMediaId, mediaKind, archivo.caption)
  } catch (err) {
    // Que el chat muestre el mensaje como fallido en vez de "pendiente" para siempre
    const detalle = (err instanceof Error ? err.message : String(err)).slice(0, 300)
    console.error('[enviarArchivoAlCliente] Error enviando archivo:', err)
    await db
      .update(messages)
      .set({ waStatus: 'failed', waStatusAt: new Date(), waError: detalle })
      .where(eq(messages.id, messageId))
    throw new EnvioWhatsappError(detalle)
  }

  await db.update(messages).set({ waMessageId }).where(eq(messages.id, messageId))
  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversationId}`,
  )

  return { conversationId, messageId, waMessageId }
}
