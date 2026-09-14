// Aviso de mensaje entrante: enriquece el evento SSE (nombre + preview para
// la tarjeta en escritorio) y manda el push a los celulares de quienes
// corresponde. Se llama desde el webhook de WhatsApp.

import { db } from '@/db'
import { users, leads, contacts, clientes } from '@/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { nombreCompleto, nombreLead } from '@/lib/clientes/nombre'
import { armarPayloadPush, destinatariosAviso, previewMensaje } from './aviso'
import { enviarPushAUsuarios } from './web-push'

type Params = {
  conversationId: string
  leadId: string | null
  clienteId: string | null
  assignedTo: string | null
  contentType: string
  body: string | null
}

/** "Empresa · Persona" o solo la persona, según tenga empresa / marca. */
async function nombreContacto(p: Params): Promise<string> {
  if (p.leadId) {
    const [row] = await db
      .select({ name: contacts.name, empresa: leads.empresa })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .where(eq(leads.id, p.leadId))
      .limit(1)
    if (row?.name) return nombreLead(row.name, row.empresa).completo
  }
  if (p.clienteId) {
    const row = await db.query.clientes.findFirst({
      where: eq(clientes.id, p.clienteId),
      columns: { nombre: true, apellido: true, empresa: true },
    })
    if (row) return nombreCompleto(row)
  }
  return 'Mensaje nuevo'
}

export async function avisarMensajeEntrante(p: Params): Promise<void> {
  const contactName = await nombreContacto(p).catch(() => 'Mensaje nuevo')
  const preview = previewMensaje(p.contentType, p.body)

  await publishCrmEvent({
    type: 'new_message',
    conversationId: p.conversationId,
    leadId: p.leadId,
    assignedTo: p.assignedTo,
    direction: 'inbound',
    contactName,
    preview,
  })

  // El push no bloquea la respuesta al webhook de Meta
  void (async () => {
    const equipo = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(eq(users.isActive, true), inArray(users.role, ['admin', 'gerente', 'agent', 'vendedor', 'rtv'])))
    const ids = destinatariosAviso(equipo, p.assignedTo)
    await enviarPushAUsuarios(ids, armarPayloadPush({ conversationId: p.conversationId, contactName, preview }))
  })().catch((err) => console.error('[push] error avisando mensaje entrante:', err))
}
