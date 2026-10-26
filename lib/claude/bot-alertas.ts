/**
 * Avisos del bot al equipo: nota interna en el chat (SSE) y push al
 * vendedor asignado (o a admins / gerentes si el lead no tiene dueño).
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { messages, users } from '@/db/schema'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { destinatariosAviso, tagConversacion, urlConversacion } from '@/lib/push/aviso'
import { enviarPushAUsuarios } from '@/lib/push/web-push'

/** Nota interna (no llega al cliente) y refresco del inbox. */
export async function dejarNotaInternaBot(params: {
  leadId: string
  conversationId: string
  assignedTo: string | null
  texto: string
}): Promise<void> {
  const { leadId, conversationId, assignedTo, texto } = params
  await db.insert(messages).values({
    conversationId,
    direction: 'outbound',
    senderType: 'system',
    contentType: 'internal_note',
    body: texto,
    isRead: true,
    sentAt: new Date(),
  })
  await publishCrmEvent({ type: 'new_message', conversationId, leadId, assignedTo, direction: 'outbound' })
}

/**
 * Push al asignado (y admins). Sin asignado, a admins y gerentes para que
 * alguien lo tome. Best-effort: nunca hace fallar el turno del bot.
 */
export async function alertarEquipoBot(params: {
  conversationId: string
  assignedTo: string | null
  titulo: string
  cuerpo: string
}): Promise<void> {
  const { conversationId, assignedTo, titulo, cuerpo } = params
  try {
    const equipo = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(eq(users.isActive, true), inArray(users.role, ['admin', 'gerente', 'agent', 'vendedor', 'rtv'])))
    const ids = destinatariosAviso(equipo, assignedTo)
    if (ids.length === 0) return
    await enviarPushAUsuarios(ids, {
      title: titulo,
      body: cuerpo,
      tag: `${tagConversacion(conversationId)}-bot`,
      url: urlConversacion(conversationId),
      conversationId,
    })
  } catch (err) {
    console.error('[bot] no se pudo mandar la alerta push al equipo:', err)
  }
}
