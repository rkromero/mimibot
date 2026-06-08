import { db } from '@/db'
import { clientes, contacts, leads, conversations, pipelineStages } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { ValidationError, NotFoundError } from '@/lib/errors'

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const withCountry = digits.startsWith('54') ? digits : '54' + digits.replace(/^0/, '')
  return '+' + withCountry
}

export async function ensureConversacionParaCliente(
  clienteId: string,
): Promise<{ leadId: string; conversationId: string }> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
    columns: { id: true, nombre: true, apellido: true, telefono: true, leadId: true },
  })

  if (!cliente) throw new NotFoundError('Cliente')
  if (!cliente.telefono) throw new ValidationError('El cliente no tiene teléfono cargado')

  const phone = toE164(cliente.telefono)
  if (!phone) throw new ValidationError('El cliente no tiene teléfono válido')

  if (cliente.leadId) {
    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.leadId, cliente.leadId),
      columns: { id: true },
    })

    if (conv) return { leadId: cliente.leadId, conversationId: conv.id }

    // Lead exists but no conversation yet
    const [newConv] = await db
      .insert(conversations)
      .values({ leadId: cliente.leadId, waContactPhone: phone })
      .returning({ id: conversations.id })

    return { leadId: cliente.leadId, conversationId: newConv!.id }
  }

  // No leadId — create contact, lead, conversation, then link to cliente
  const firstStage =
    (await db.query.pipelineStages.findFirst({
      where: eq(pipelineStages.slug, 'nuevo'),
    })) ??
    (await db.query.pipelineStages.findFirst({
      orderBy: [asc(pipelineStages.position)],
    }))

  if (!firstStage) throw new Error('No hay etapas configuradas en el pipeline')

  let contact = await db.query.contacts.findFirst({
    where: eq(contacts.phone, phone),
    columns: { id: true },
  })

  if (!contact) {
    const [c] = await db
      .insert(contacts)
      .values({ name: `${cliente.nombre} ${cliente.apellido}`, phone })
      .returning({ id: contacts.id })
    contact = c!
  }

  const [newLead] = await db
    .insert(leads)
    .values({ contactId: contact.id, stageId: firstStage.id, source: 'manual' })
    .returning({ id: leads.id })

  const [newConv] = await db
    .insert(conversations)
    .values({ leadId: newLead!.id, waContactPhone: phone })
    .returning({ id: conversations.id })

  await db
    .update(clientes)
    .set({ leadId: newLead!.id, updatedAt: new Date() })
    .where(eq(clientes.id, clienteId))

  return { leadId: newLead!.id, conversationId: newConv!.id }
}
