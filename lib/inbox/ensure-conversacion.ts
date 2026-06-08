import { db } from '@/db'
import { clientes, conversations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ValidationError, NotFoundError } from '@/lib/errors'

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const withCountry = digits.startsWith('54') ? digits : '54' + digits.replace(/^0/, '')
  return '+' + withCountry
}

export async function ensureConversacionParaCliente(
  clienteId: string,
): Promise<{ conversationId: string; clienteId: string }> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
    columns: { id: true, telefono: true, leadId: true },
  })

  if (!cliente) throw new NotFoundError('Cliente')
  if (!cliente.telefono) throw new ValidationError('El cliente no tiene teléfono cargado')

  const phone = toE164(cliente.telefono)
  if (!phone) throw new ValidationError('El cliente no tiene teléfono válido')

  // 1. Buscar conversación ya asignada al cliente
  const existingClienteConv = await db.query.conversations.findFirst({
    where: eq(conversations.clienteId, clienteId),
    columns: { id: true },
  })
  if (existingClienteConv) return { conversationId: existingClienteConv.id, clienteId }

  // 2. Si el cliente viene de un lead, reasignar su conversación
  if (cliente.leadId) {
    const leadConv = await db.query.conversations.findFirst({
      where: eq(conversations.leadId, cliente.leadId),
      columns: { id: true },
    })
    if (leadConv) {
      await db
        .update(conversations)
        .set({ clienteId, updatedAt: new Date() })
        .where(eq(conversations.id, leadConv.id))
      return { conversationId: leadConv.id, clienteId }
    }
  }

  // 3. Crear conversación nueva con clienteId (sin lead)
  const [newConv] = await db
    .insert(conversations)
    .values({ clienteId, waContactPhone: phone })
    .returning({ id: conversations.id })

  return { conversationId: newConv!.id, clienteId }
}
