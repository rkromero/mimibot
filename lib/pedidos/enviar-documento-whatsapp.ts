/**
 * Envío de la proforma (o remito) de un pedido por el WhatsApp embebido: el
 * PDF va como documento a la conversación del cliente, igual que los adjuntos
 * del inbox y la propuesta del cotizador. Queda en el chat con sus tildes.
 *
 * Orden de las verificaciones: primero teléfono y ventana de 24 hs, después
 * se emite el documento. Así una conversación que no se puede usar no gasta
 * un número de proforma.
 */
import { db } from '@/db'
import { conversations, messages } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { AppError, ValidationError } from '@/lib/errors'
import { emitirDocumento } from '@/lib/pdf/pdf.service'
import { etiquetaDocumento, padNumeroDocumento, type TipoDocumentoPedido } from '@/lib/pdf/nombre-archivo'
import { ensureConversacionParaCliente } from '@/lib/inbox/ensure-conversacion'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import { sendMediaMessage, uploadMediaToMeta } from '@/lib/whatsapp/client'
import { persistOutboundMedia } from '@/lib/whatsapp/media'

export const MENSAJE_VENTANA_CERRADA =
  'Pasaron más de 24 hs desde el último mensaje del cliente: WhatsApp no deja mandar documentos. ' +
  'Abrí el chat, mandale una plantilla de apertura y cuando responda enviá la proforma.'

/** La conversación del cliente está fuera de la ventana de 24 hs de WhatsApp. */
export class VentanaCerradaError extends AppError {
  constructor() {
    super(MENSAJE_VENTANA_CERRADA, 422, 'WINDOW_CLOSED')
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

export type EnviarDocumentoWhatsappParams = {
  pedidoId: string
  clienteId: string
  tipo: TipoDocumentoPedido
  userId: string
}

export type EnviarDocumentoWhatsappResult = {
  conversationId: string
  messageId: string
  waMessageId: string
  numero: number
  nombreArchivo: string
}

/** Texto que acompaña al PDF en el chat: "Proforma 000141". */
export function captionDocumento(tipo: TipoDocumentoPedido, numero: number): string {
  return `${etiquetaDocumento(tipo)} ${padNumeroDocumento(numero)}`
}

export async function enviarDocumentoPorWhatsapp(
  params: EnviarDocumentoWhatsappParams,
): Promise<EnviarDocumentoWhatsappResult> {
  const { pedidoId, clienteId, tipo, userId } = params

  // Conversación del cliente (la del lead si vino del chat; se crea si no hay).
  // Tira ValidationError si el cliente no tiene teléfono válido.
  const { conversationId } = await ensureConversacionParaCliente(clienteId)

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { id: true, waContactPhone: true },
  })
  if (!conv?.waContactPhone) {
    throw new ValidationError('La conversación del cliente no tiene teléfono de WhatsApp')
  }

  if (!(await estaDentroDe24h(conversationId))) {
    throw new VentanaCerradaError()
  }

  const { buffer, numero, nombreArchivo } = await emitirDocumento(pedidoId, tipo, userId)
  const caption = captionDocumento(tipo, numero)

  // Mismo flujo que los adjuntos del inbox (app/api/whatsapp/send): fila de
  // mensaje + copia en R2 + upload a Meta + envío como documento.
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      direction: 'outbound',
      senderType: 'agent',
      senderId: userId,
      contentType: 'document',
      body: caption,
      isRead: true,
      sentAt: new Date(),
    })
    .returning()
  const messageId = msg!.id

  let waMessageId: string
  try {
    const [, metaMediaId] = await Promise.all([
      persistOutboundMedia({
        buffer,
        messageId,
        conversationId,
        mimeType: 'application/pdf',
        filename: nombreArchivo,
      }),
      uploadMediaToMeta(buffer, 'application/pdf', nombreArchivo),
    ])
    waMessageId = await sendMediaMessage(conv.waContactPhone, metaMediaId, 'document', caption)
  } catch (err) {
    // Que el chat muestre el mensaje como fallido en vez de "pendiente" para siempre
    const detalle = (err instanceof Error ? err.message : String(err)).slice(0, 300)
    console.error('[enviarDocumentoPorWhatsapp] Error enviando documento:', err)
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

  return { conversationId, messageId, waMessageId, numero, nombreArchivo }
}
