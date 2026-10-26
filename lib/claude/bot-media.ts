/**
 * Galería de medios del bot (tabla bot_media, archivos en R2).
 *
 * - `elegirMedios` (en bot-reglas, pura): dadas las categorías pedidas y lo
 *   que hay cargado, decide qué 1 o 2 medios mandar.
 * - `enviarMediosBot`: baja el archivo de R2, lo sube a Meta, lo manda por
 *   WhatsApp y deja el mensaje (imagen / video) con su adjunto en el chat.
 */
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { attachments, botMedia, messages } from '@/db/schema'
import { getObjectBuffer } from '@/lib/r2/get-object'
import { sendMediaMessage, uploadMediaToMeta } from '@/lib/whatsapp/client'
import { waMediaType, ext } from '@/lib/whatsapp/mime'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { type CategoriaBotMedia, type MedioGaleria } from './bot-reglas'

export { elegirMedios, type MedioGaleria } from './bot-reglas'

/** Categorías con al menos un medio activo (para contarle al bot qué puede mandar). */
export async function categoriasConMedios(): Promise<CategoriaBotMedia[]> {
  const rows = await db.query.botMedia.findMany({
    where: eq(botMedia.activo, true),
    columns: { categoria: true },
  })
  return [...new Set(rows.map((r) => r.categoria))]
}

export async function listarMediosActivos(): Promise<MedioGaleria[]> {
  const rows = await db.query.botMedia.findMany({
    where: and(eq(botMedia.activo, true)),
    orderBy: [asc(botMedia.categoria), asc(botMedia.orden), asc(botMedia.createdAt)],
    columns: { id: true, categoria: true, titulo: true, r2Key: true, mimeType: true, orden: true },
  })
  return rows
}

/**
 * Manda los medios elegidos por WhatsApp y los deja en el chat como mensajes
 * del bot. Cada medio es independiente: si uno falla se loguea y sigue.
 * Devuelve cuántos salieron.
 */
export async function enviarMediosBot(params: {
  leadId: string
  conversationId: string
  contactPhone: string
  assignedTo: string | null
  medios: readonly MedioGaleria[]
}): Promise<number> {
  const { leadId, conversationId, contactPhone, assignedTo, medios } = params
  let enviados = 0

  for (const medio of medios) {
    try {
      const { buffer } = await getObjectBuffer(medio.r2Key)
      const tipo = waMediaType(medio.mimeType)
      if (tipo !== 'image' && tipo !== 'video') continue

      const filename = `${medio.titulo.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'medio'}.${ext(medio.mimeType)}`
      const metaMediaId = await uploadMediaToMeta(buffer, medio.mimeType, filename)
      const waMessageId = await sendMediaMessage(contactPhone, metaMediaId, tipo, medio.titulo)

      const [msg] = await db
        .insert(messages)
        .values({
          conversationId,
          waMessageId,
          direction: 'outbound',
          senderType: 'bot',
          contentType: tipo,
          body: medio.titulo,
          isRead: true,
          sentAt: new Date(),
        })
        .returning({ id: messages.id })

      if (msg) {
        await db.insert(attachments).values({
          messageId: msg.id,
          waMediaId: metaMediaId,
          r2Key: medio.r2Key,
          mimeType: medio.mimeType,
          fileSize: buffer.length,
          originalFilename: filename,
        })
      }

      await publishCrmEvent({ type: 'new_message', conversationId, leadId, assignedTo, direction: 'outbound' })
      enviados++
    } catch (err) {
      console.error(`[bot] no se pudo mandar el medio ${medio.id} (${medio.categoria}):`, err)
    }
  }

  return enviados
}
