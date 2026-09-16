/**
 * Envío de un archivo (PDF, foto) por el WhatsApp embebido a la conversación
 * del cliente. Es el paso común de "Enviar proforma" y "Enviar comprobante":
 * fila de mensaje + copia en R2 + upload a Meta + envío. Queda en el chat con
 * sus tildes, igual que los adjuntos del inbox.
 *
 * Dos modos de envío:
 *  - suelto: mensaje de imagen/documento; solo dentro de la ventana de 24 hs.
 *  - plantilla: plantilla aprobada con el archivo en el encabezado; sirve con
 *    la ventana cerrada (se paga como mensaje de plantilla).
 *
 * Las verificaciones (teléfono y ventana de 24 hs) están separadas para que
 * el caller pueda hacerlas ANTES de generar el archivo y no gastar, por
 * ejemplo, un número de proforma en un envío que no va a salir.
 */
import { db } from '@/db'
import { conversations, messages } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { AppError, ValidationError } from '@/lib/errors'
import { ensureConversacionParaCliente } from '@/lib/inbox/ensure-conversacion'
import { estaDentroDe24h } from '@/lib/whatsapp/ventana'
import {
  buildBodyComponents,
  buildHeaderMediaComponent,
  sendMediaMessage,
  sendTemplateMessage,
  uploadMediaToMeta,
  type TemplateComponent,
} from '@/lib/whatsapp/client'
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
 * Conversación y teléfono del cliente (la del lead si vino del chat; se crea
 * si no hay). Tira ValidationError si el cliente no tiene teléfono válido.
 */
export async function destinoDelCliente(clienteId: string): Promise<DestinoCliente> {
  const { conversationId } = await ensureConversacionParaCliente(clienteId)

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { id: true, waContactPhone: true },
  })
  if (!conv?.waContactPhone) {
    throw new ValidationError('La conversación del cliente no tiene teléfono de WhatsApp')
  }
  return { conversationId, waContactPhone: conv.waContactPhone }
}

/** Destino verificando además la ventana de 24 hs (VentanaCerradaError si está cerrada). */
export async function prepararEnvioAlCliente(
  clienteId: string,
  mensajeVentanaCerrada?: string,
): Promise<DestinoCliente> {
  const destino = await destinoDelCliente(clienteId)
  if (!(await estaDentroDe24h(destino.conversationId))) {
    throw new VentanaCerradaError(mensajeVentanaCerrada)
  }
  return destino
}

export type ArchivoParaCliente = {
  buffer: Buffer
  mimeType: string
  filename: string
  /** Texto que acompaña al archivo en el chat (caption del mensaje suelto). */
  caption: string
}

export type ModoEnvio =
  | { tipo: 'suelto' }
  | {
      tipo: 'plantilla'
      templateName: string
      templateLang: string
      headerFormat: 'IMAGE' | 'DOCUMENT'
      /** Valores de las variables del cuerpo, en orden. */
      valores: string[]
      /** Cuerpo de la plantilla ya resuelto, como se ve en el chat. */
      body: string
    }

export type EnvioArchivoResult = { conversationId: string; messageId: string; waMessageId: string }

/** Manda el archivo al chat del cliente. En modo suelto, el caller ya verificó la ventana. */
export async function enviarArchivoAlCliente(
  destino: DestinoCliente,
  archivo: ArchivoParaCliente,
  userId: string,
  modo: ModoEnvio = { tipo: 'suelto' },
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
      contentType: modo.tipo === 'plantilla' ? 'template' : mediaKind,
      body: modo.tipo === 'plantilla' ? modo.body : archivo.caption,
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
    if (modo.tipo === 'plantilla') {
      const components: TemplateComponent[] = [
        buildHeaderMediaComponent(modo.headerFormat, metaMediaId, archivo.filename),
        ...(buildBodyComponents(modo.valores) ?? []),
      ]
      waMessageId = await sendTemplateMessage(waContactPhone, modo.templateName, modo.templateLang, components)
    } else {
      waMessageId = await sendMediaMessage(waContactPhone, metaMediaId, mediaKind, archivo.caption)
    }
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
