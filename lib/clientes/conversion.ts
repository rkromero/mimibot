import { eq, and, isNull } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { leads, clientes, conversations, territorioAgente, contacts } from '@/db/schema'
import { NotFoundError } from '@/lib/errors'

type DrizzleDb = Db
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

type LeadConContacto = typeof leads.$inferSelect & {
  contact: typeof contacts.$inferSelect | null
}

export interface ConversionResult {
  cliente: typeof clientes.$inferSelect
  wasNew: boolean
}

/**
 * Busca o crea el cliente correspondiente a un lead, SIN cerrar el lead ni
 * tocar su conversación. Reutilizado por la conversión al ganar
 * (`convertirLeadACliente`) y por el envío de muestras desde un lead.
 *
 * - Si ya existe un cliente con el mismo email, lo vincula (`leadId`) en vez de
 *   duplicar, y le completa dirección/localidad si no las tenía.
 * - Si no, crea el cliente con los datos del contacto + dirección del lead,
 *   heredando territorio y asignación del agente del lead.
 */
export async function obtenerOCrearClienteDesdeLead(
  tx: Tx,
  lead: LeadConContacto,
  userId: string,
): Promise<ConversionResult> {
  if (!lead.contact) throw new NotFoundError('Contacto del lead')
  const contact = lead.contact

  // Check if cliente already exists with same email
  let existingCliente: typeof clientes.$inferSelect | undefined

  if (contact.email) {
    existingCliente = await tx.query.clientes.findFirst({
      where: eq(clientes.email, contact.email),
    })
  }

  if (existingCliente) {
    // Update existing cliente to link the leadId without duplicating
    const updates: Partial<typeof clientes.$inferInsert> = {
      leadId: lead.id,
      updatedAt: new Date(),
    }
    if (!existingCliente.direccion && lead.direccion) updates.direccion = lead.direccion
    if (!existingCliente.localidad && lead.localidad) updates.localidad = lead.localidad

    const [updated] = await tx
      .update(clientes)
      .set(updates)
      .where(eq(clientes.id, existingCliente.id))
      .returning()

    return { cliente: updated!, wasNew: false }
  }

  // Parse name into nombre/apellido — use full name as nombre if no space
  const nameParts = contact.name.trim().split(/\s+/)
  const nombre = nameParts[0] ?? contact.name
  const apellido = nameParts.slice(1).join(' ') || '-'

  // Heredar el territorio del agente asignado: si el lead tiene un agente,
  // buscamos algún territorio activo donde ese agente esté asignado y se
  // lo seteamos al cliente. Si el agente está en varios, tomamos el
  // primero (heurística simple). Si no hay agente o no tiene territorio,
  // queda en null y un admin lo asigna después.
  let territorioId: string | null = null
  if (lead.assignedTo) {
    const territorioRow = await tx.query.territorioAgente.findFirst({
      where: and(
        eq(territorioAgente.agenteId, lead.assignedTo),
        isNull(territorioAgente.fechaDesasignacion),
      ),
      columns: { territorioId: true },
    })
    territorioId = territorioRow?.territorioId ?? null
  }

  // Create new cliente from lead data
  const [created] = await tx
    .insert(clientes)
    .values({
      nombre,
      apellido,
      email: contact.email ?? undefined,
      telefono: contact.phone ?? undefined,
      direccion: lead.direccion ?? undefined,
      localidad: lead.localidad ?? undefined,
      origen: 'convertido_de_lead',
      leadId: lead.id,
      territorioId: territorioId ?? undefined,
      asignadoA: lead.assignedTo ?? undefined,
      creadoPor: userId,
    })
    .returning()

  return { cliente: created!, wasNew: true }
}

export async function convertirLeadACliente(
  leadId: string,
  userId: string,
  drizzleDb: DrizzleDb = db,
): Promise<ConversionResult> {
  return drizzleDb.transaction(async (tx) => {
    // 1. Fetch lead with contact
    const lead = await tx.query.leads.findFirst({
      where: eq(leads.id, leadId),
      with: {
        contact: true,
      },
    })

    if (!lead) throw new NotFoundError('Lead')

    // 2. Find or create the cliente (links leadId / copies dirección)
    const resultado = await obtenerOCrearClienteDesdeLead(tx, lead, userId)

    // 3. Close lead
    await tx
      .update(leads)
      .set({ isOpen: false, updatedAt: new Date() })
      .where(eq(leads.id, leadId))

    // 4. Reasignar la conversación del lead al cliente
    await tx
      .update(conversations)
      .set({ clienteId: resultado.cliente.id, updatedAt: new Date() })
      .where(eq(conversations.leadId, leadId))

    return resultado
  })
}
