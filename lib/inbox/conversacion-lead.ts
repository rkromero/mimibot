import { eq } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { conversations } from '@/db/schema'

/**
 * Asegura que el lead tenga su conversación de WhatsApp (una por lead).
 *
 * Solo crea la fila: NO inserta mensajes ni toca `lastMessageAt`/`unreadCount`.
 * Una conversación sin mensajes no aparece en el inbox (ver /api/inbox); se
 * "abre" recién cuando el vendedor le escribe o la persona escribe por
 * WhatsApp, que es lo que setea `lastMessageAt`. Mientras tanto la fila
 * existe para que el panel del lead tenga el chat listo para escribir.
 */
export async function asegurarConversacionLead(
  leadId: string,
  phone: string,
  drizzleDb: Db = db,
): Promise<{ conversationId: string; creada: boolean }> {
  const existente = await drizzleDb.query.conversations.findFirst({
    where: eq(conversations.leadId, leadId),
    columns: { id: true },
  })
  if (existente) return { conversationId: existente.id, creada: false }

  const [creada] = await drizzleDb
    .insert(conversations)
    .values({
      leadId,
      waContactPhone: phone,
      waPhoneNumberId: process.env['WA_PHONE_NUMBER_ID'] ?? null,
    })
    .returning({ id: conversations.id })

  return { conversationId: creada!.id, creada: true }
}
