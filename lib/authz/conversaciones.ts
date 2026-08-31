import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { conversations } from '@/db/schema'
import { AuthzError, NotFoundError } from '@/lib/errors'
import type { Session } from 'next-auth'
import { canAccessLead } from '@/lib/authz'
import { canAccessCliente } from '@/lib/authz/clientes'

type SessionUser = Session['user']

export type ConversacionRef = {
  id: string
  leadId: string | null
  clienteId: string | null
}

/**
 * Verifica que el usuario pueda operar una conversación del inbox y devuelve
 * a quién pertenece (lead o cliente).
 *
 * Una conversación puede ser de un lead, de un cliente, o de ambos (lead que
 * se convirtió en cliente). Se resuelve con la misma precedencia que el
 * listado del inbox (`app/api/inbox`): si tiene cliente manda el cliente.
 *
 * - conversación de cliente → mismas reglas que el cliente (cartera / territorio)
 * - conversación de lead    → mismas reglas que el lead (asignado)
 * - sin lead ni cliente     → sólo admin y gerente (en el inbox aparece como
 *                             "sin asignar", que ventas nunca ve)
 */
export async function canAccessConversacion(
  user: SessionUser,
  conversationId: string,
): Promise<ConversacionRef> {
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { id: true, leadId: true, clienteId: true },
  })
  if (!conv) throw new NotFoundError('Conversación')

  if (conv.clienteId) {
    await canAccessCliente(user, conv.clienteId)
    return conv
  }
  if (conv.leadId) {
    await canAccessLead(user, conv.leadId)
    return conv
  }
  if (user.role === 'admin' || user.role === 'gerente') return conv
  throw new AuthzError('No tenés acceso a esta conversación')
}
