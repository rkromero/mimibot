import { eq, and, isNull } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { leads, clientes, territorioAgente } from '@/db/schema'
import { NotFoundError } from '@/lib/errors'

type DrizzleDb = Db

export interface ConversionResult {
  cliente: typeof clientes.$inferSelect
  wasNew: boolean
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
    if (!lead.contact) throw new NotFoundError('Contacto del lead')

    const contact = lead.contact

    // 2. Check if cliente already exists with same email
    let existingCliente: typeof clientes.$inferSelect | undefined

    if (contact.email) {
      existingCliente = await tx.query.clientes.findFirst({
        where: eq(clientes.email, contact.email),
      })
    }

    let cliente: typeof clientes.$inferSelect
    let wasNew: boolean

    if (existingCliente) {
      // Update existing cliente to link the leadId without duplicating
      const [updated] = await tx
        .update(clientes)
        .set({
          leadId,
          updatedAt: new Date(),
        })
        .where(eq(clientes.id, existingCliente.id))
        .returning()

      cliente = updated!
      wasNew = false
    } else {
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
          origen: 'convertido_de_lead',
          leadId,
          territorioId: territorioId ?? undefined,
          asignadoA: lead.assignedTo ?? undefined,
          creadoPor: userId,
        })
        .returning()

      cliente = created!
      wasNew = true
    }

    // 3. Close lead
    await tx
      .update(leads)
      .set({ isOpen: false, updatedAt: new Date() })
      .where(eq(leads.id, leadId))

    return { cliente, wasNew }
  })
}
