import { and, eq, isNull } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { conversations } from '@/db/schema'
import { toWhatsappE164 } from '@/lib/whatsapp/phone'

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

  // Unificación: el hilo de WhatsApp es uno solo por persona. Si el mismo
  // teléfono ya tiene una conversación SIN lead (típicamente la de un
  // cliente), se adopta en vez de crear una segunda; las que ya pertenecen a
  // otro lead no se tocan (teléfonos compartidos entre leads distintos).
  const telefono = toWhatsappE164(phone) ?? phone
  const mismaPersona = await drizzleDb.query.conversations.findFirst({
    where: and(eq(conversations.waContactPhone, telefono), isNull(conversations.leadId)),
    columns: { id: true },
  })
  if (mismaPersona) {
    await drizzleDb
      .update(conversations)
      .set({ leadId, updatedAt: new Date() })
      .where(eq(conversations.id, mismaPersona.id))
    return { conversationId: mismaPersona.id, creada: false }
  }

  const [creada] = await drizzleDb
    .insert(conversations)
    .values({
      leadId,
      // Formato de WhatsApp (+549...): el webhook matchea por igualdad
      waContactPhone: toWhatsappE164(phone) ?? phone,
      waPhoneNumberId: process.env['WA_PHONE_NUMBER_ID'] ?? null,
    })
    .returning({ id: conversations.id })

  return { conversationId: creada!.id, creada: true }
}
