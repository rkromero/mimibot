import { eq, and, isNull } from 'drizzle-orm'
import { db, type Db } from '@/db'
import { leads, clientes, conversations, territorioAgente, contacts } from '@/db/schema'
import { NotFoundError } from '@/lib/errors'

type DrizzleDb = Db
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

type LeadConContacto = typeof leads.$inferSelect & {
  contact: typeof contacts.$inferSelect | null
}

type Cliente = typeof clientes.$inferSelect
type ClienteUpdates = Partial<typeof clientes.$inferInsert>

/** Dirección y documento que el lead puede aportar a la ficha del cliente. */
type DatosLeadParaCliente = Pick<
  typeof leads.$inferSelect,
  'direccion' | 'localidad' | 'provincia' | 'codigoPostal' | 'cuit'
>

export interface ConversionResult {
  cliente: Cliente
  wasNew: boolean
}

/**
 * Cliente activo que ya tenga el CUIT/DNI del lead. El CUIT es único entre
 * clientes activos: si existe, se vincula ese cliente en vez de duplicarlo y
 * nunca se copia el CUIT a un cliente distinto.
 */
async function buscarClienteActivoPorCuit(tx: Tx, cuit: string | null | undefined): Promise<Cliente | undefined> {
  if (!cuit) return undefined
  return tx.query.clientes.findFirst({
    where: and(eq(clientes.cuit, cuit), isNull(clientes.deletedAt)),
  })
}

/**
 * Campos de dirección y documento del lead que el cliente todavía no tiene.
 * Nunca pisa lo cargado en la ficha. `cuitDisponible` = ningún otro cliente
 * activo usa ese CUIT.
 */
function camposFaltantesDesdeLead(
  cliente: Cliente,
  lead: DatosLeadParaCliente,
  cuitDisponible: boolean,
): ClienteUpdates {
  const updates: ClienteUpdates = {}
  if (!cliente.direccion && lead.direccion) updates.direccion = lead.direccion
  if (!cliente.localidad && lead.localidad) updates.localidad = lead.localidad
  if (!cliente.provincia && lead.provincia) updates.provincia = lead.provincia
  if (!cliente.codigoPostal && lead.codigoPostal) updates.codigoPostal = lead.codigoPostal
  if (!cliente.cuit && lead.cuit && cuitDisponible) updates.cuit = lead.cuit
  return updates
}

/**
 * Completa la ficha de un cliente ya vinculado al lead con la dirección
 * (calle, localidad, provincia, CP) y el CUIT/DNI que el lead tenga y el
 * cliente no. Lo usa el envío de muestras cuando el lead ya tiene cliente:
 * lo que se cargó en el lead después de la primera muestra también llega.
 */
export async function completarClienteDesdeLead(
  tx: Tx,
  cliente: Cliente,
  lead: DatosLeadParaCliente,
): Promise<Cliente> {
  const otroConCuit = !cliente.cuit ? await buscarClienteActivoPorCuit(tx, lead.cuit) : undefined
  const updates = camposFaltantesDesdeLead(cliente, lead, !otroConCuit || otroConCuit.id === cliente.id)
  if (Object.keys(updates).length === 0) return cliente

  const [updated] = await tx
    .update(clientes)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(clientes.id, cliente.id))
    .returning()

  return updated ?? cliente
}

/**
 * Busca o crea el cliente correspondiente a un lead, SIN cerrar el lead ni
 * tocar su conversación. Reutilizado por la conversión al ganar
 * (`convertirLeadACliente`) y por el envío de muestras desde un lead.
 *
 * - Si ya existe un cliente con el mismo email, o uno activo con el mismo
 *   CUIT/DNI, lo vincula (`leadId`) en vez de duplicar y le completa la
 *   dirección (calle, localidad, provincia, CP) y el CUIT que no tenía.
 * - Si no, crea el cliente con los datos del contacto + dirección y CUIT del
 *   lead, heredando territorio y asignación del agente del lead.
 */
export async function obtenerOCrearClienteDesdeLead(
  tx: Tx,
  lead: LeadConContacto,
  userId: string,
): Promise<ConversionResult> {
  if (!lead.contact) throw new NotFoundError('Contacto del lead')
  const contact = lead.contact

  // Cliente existente: por email, o por CUIT/DNI entre clientes activos
  let existingCliente: Cliente | undefined

  if (contact.email) {
    existingCliente = await tx.query.clientes.findFirst({
      where: eq(clientes.email, contact.email),
    })
  }
  const porCuit = await buscarClienteActivoPorCuit(tx, lead.cuit)
  existingCliente ??= porCuit

  if (existingCliente) {
    // Vincular el lead sin duplicar y completar lo que le falte a la ficha.
    // El CUIT solo se copia si no lo tiene otro cliente activo.
    const cuitDisponible = !porCuit || porCuit.id === existingCliente.id
    const updates: ClienteUpdates = {
      leadId: lead.id,
      updatedAt: new Date(),
      ...camposFaltantesDesdeLead(existingCliente, lead, cuitDisponible),
    }

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

  // Create new cliente from lead data (no hay otro activo con este CUIT:
  // si lo hubiera, se habría vinculado arriba)
  const [created] = await tx
    .insert(clientes)
    .values({
      nombre,
      apellido,
      email: contact.email ?? undefined,
      telefono: contact.phone ?? undefined,
      direccion: lead.direccion ?? undefined,
      localidad: lead.localidad ?? undefined,
      provincia: lead.provincia ?? undefined,
      codigoPostal: lead.codigoPostal ?? undefined,
      cuit: lead.cuit ?? undefined,
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

    // 2. Find or create the cliente (links leadId / copies dirección y CUIT)
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
