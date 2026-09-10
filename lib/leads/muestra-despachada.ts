/**
 * Aviso "salió tu muestra" por WhatsApp: plantilla aprobada con la foto de la
 * guía de envío en el encabezado. Ver `muestra-aviso.ts` para el contexto y
 * los helpers puros.
 *
 * - `prepararAvisoMuestra`: arma todo sin mandar (vista previa del modal). Si
 *   no se puede, dice por qué en vez de lanzar.
 * - `enviarAvisoMuestra`: sube la foto a Meta, manda la plantilla, deja el
 *   mensaje con la imagen en el chat y marca el lead como avisado.
 * - `marcarMuestraAvisadaSinEnviar`: "ya le avisé por otro lado".
 * - `listarMuestrasPendientesAviso`: lo que ve el popup / Mi día.
 */
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Session } from 'next-auth'
import { db } from '@/db'
import {
  activityLog,
  attachments,
  contacts,
  conversations,
  leads,
  messages,
  pedidos,
  pipelineStages,
  users,
  whatsappConfig,
  whatsappTemplates,
} from '@/db/schema'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { esRolVentas } from '@/lib/authz/roles'
import { formatFechaInstanteAR } from '@/lib/dates'
import { ensureConversacionParaCliente } from '@/lib/inbox/ensure-conversacion'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { getObjectBuffer } from '@/lib/r2/get-object'
import {
  buildBodyComponents,
  buildHeaderMediaComponent,
  sendTemplateMessage,
  uploadMediaToMeta,
  type TemplateComponent,
} from '@/lib/whatsapp/client'
import { applyTemplateValues, resolveTemplateVariables, toTemplateVariables, type TemplateVariable } from '@/lib/whatsapp/variables'
import {
  detectarMime,
  formatoHeaderParaMime,
  nombreArchivoGuia,
  numeroPedidoCorto,
  type FormatoHeaderGuia,
  type MuestraPendienteAviso,
} from './muestra-aviso'

type SessionUser = Session['user']

type LeadAviso = {
  id: string
  contactId: string
  assignedTo: string | null
  productInterest: string | null
  muestraEntregadaAt: Date | null
  muestraAvisadaAt: Date | null
}

type PedidoAviso = {
  id: string
  clienteId: string
  remitoFotoUrl: string | null
  expresoNombre: string | null
  metodoEntrega: string | null
  entregadoAt: Date | null
}

/** Lo que muestra el modal aunque el envío no esté disponible. */
type BasePreparacion = {
  pedidoId: string | null
  /** Clave R2 de la foto de la guía, para la vista previa (/api/attachments/url?key=) */
  fotoKey: string | null
  /** Ya se avisó: cuándo */
  avisadaAt: Date | null
  templateName: string | null
}

export type PreparacionAvisoMuestra =
  | (BasePreparacion & { ok: false; motivo: string })
  | (BasePreparacion & {
      ok: true
      lead: LeadAviso
      pedido: PedidoAviso
      pedidoId: string
      fotoKey: string
      conversationId: string
      waContactPhone: string
      templateName: string
      templateLang: string
      headerFormat: FormatoHeaderGuia
      valores: string[]
      body: string
      archivo: { buffer: Buffer; mime: string; nombre: string }
    })

/**
 * Variables de la plantilla del aviso. Si se configuraron al registrarla, esas;
 * si la plantilla se importó de Meta sin configuración (lo habitual para las
 * de imagen, que se crean en el Administrador de WhatsApp), por posición:
 * {{1}} nombre del cliente · {{2}} expreso · {{3}} nº de pedido · {{4}} vendedor.
 */
export function variablesAvisoMuestra(bodyText: string, rawVariables: unknown): TemplateVariable[] {
  const configuradas = toTemplateVariables(rawVariables)
  if (configuradas.length > 0) return configuradas
  const porPosicion: Array<{ source: string; sample: string }> = [
    { source: 'cliente_nombre', sample: 'Cliente' },
    { source: 'pedido_expreso', sample: 'el expreso' },
    { source: 'pedido_numero', sample: '00000000' },
    { source: 'vendedor_nombre', sample: 'el equipo' },
  ]
  return porPosicion
    .map((v, i) => ({ index: i + 1, ...v }))
    .filter((v) => bodyText.includes(`{{${v.index}}}`))
}

/** Último pedido de muestra entregado del lead (el que tiene la guía). */
async function pedidoMuestraEntregado(leadId: string): Promise<PedidoAviso | null> {
  const pedido = await db.query.pedidos.findFirst({
    where: and(
      eq(pedidos.leadId, leadId),
      eq(pedidos.tipo, 'muestra'),
      eq(pedidos.estado, 'entregado'),
      isNull(pedidos.deletedAt),
    ),
    orderBy: [desc(pedidos.entregadoAt), desc(pedidos.updatedAt)],
    columns: { id: true, clienteId: true, remitoFotoUrl: true, expresoNombre: true, metodoEntrega: true, entregadoAt: true },
  })
  return pedido ?? null
}

/**
 * Arma el aviso sin mandarlo. `vendedorNombre` es el nombre de quien está por
 * mandar; se usa solo si el lead no tiene vendedor asignado.
 */
export async function prepararAvisoMuestra(
  leadId: string,
  vendedorNombre: string | null,
): Promise<PreparacionAvisoMuestra> {
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), isNull(leads.deletedAt)),
    columns: { id: true, contactId: true, assignedTo: true, productInterest: true, muestraEntregadaAt: true, muestraAvisadaAt: true },
    with: {
      contact: { columns: { name: true } },
      assignedUser: { columns: { name: true } },
    },
  })
  if (!lead) throw new NotFoundError('Lead')

  const pedido = lead.muestraEntregadaAt ? await pedidoMuestraEntregado(leadId) : null
  const base: BasePreparacion = {
    pedidoId: pedido?.id ?? null,
    fotoKey: pedido?.remitoFotoUrl ?? null,
    avisadaAt: lead.muestraAvisadaAt ?? null,
    templateName: null,
  }
  const noDisponible = (motivo: string, extra?: Partial<BasePreparacion>): PreparacionAvisoMuestra =>
    ({ ...base, ...extra, ok: false, motivo })

  if (!lead.muestraEntregadaAt) return noDisponible('La muestra todavía no se marcó como entregada')
  if (lead.muestraAvisadaAt) {
    return noDisponible(`Ya se avisó el ${formatFechaInstanteAR(lead.muestraAvisadaAt)}`)
  }
  if (!pedido) return noDisponible('No encontré el pedido de muestra entregado de este lead')
  if (!pedido.remitoFotoUrl) {
    return noDisponible(
      pedido.metodoEntrega === 'retiro_fabrica'
        ? 'La muestra se retiró en fábrica: no hay guía de envío para mandar'
        : 'El pedido se marcó entregado sin la foto de la guía, así que no hay nada para adjuntar',
    )
  }

  const config = await db.query.whatsappConfig.findFirst({
    columns: { muestraTemplateName: true, muestraTemplateLang: true },
  })
  const templateName = config?.muestraTemplateName?.trim() || null
  const templateLang = config?.muestraTemplateLang?.trim() || 'es'
  if (!templateName) {
    return noDisponible('Elegí la plantilla del aviso de muestra en Ajustes → WhatsApp')
  }

  const tmpl = await db.query.whatsappTemplates.findFirst({
    where: and(
      eq(whatsappTemplates.name, templateName),
      eq(whatsappTemplates.language, templateLang),
      eq(whatsappTemplates.status, 'APPROVED'),
    ),
    columns: { bodyText: true, variables: true, headerFormat: true },
  })
  if (!tmpl) {
    return noDisponible(
      `La plantilla "${templateName}" (${templateLang}) no está aprobada en WhatsApp. Cuando Meta la apruebe, sincronizá en Ajustes → WhatsApp → Plantillas.`,
      { templateName },
    )
  }
  const headerFormat = tmpl.headerFormat === 'IMAGE' || tmpl.headerFormat === 'DOCUMENT' ? tmpl.headerFormat : null
  if (!headerFormat) {
    return noDisponible(
      `La plantilla "${templateName}" no tiene encabezado de imagen, así que la guía no se puede adjuntar. Creala en el Administrador de WhatsApp de Meta con encabezado "Imagen" y sincronizá las plantillas.`,
      { templateName },
    )
  }

  // La foto: se baja acá (y no solo al mandar) para detectar el tipo real y
  // avisar en la vista previa si no coincide con el encabezado de la plantilla.
  let archivo: { buffer: Buffer; mime: string; nombre: string }
  try {
    const { buffer, contentType } = await getObjectBuffer(pedido.remitoFotoUrl)
    const mime = detectarMime(buffer, contentType ?? 'application/octet-stream')
    archivo = { buffer, mime, nombre: nombreArchivoGuia(pedido.id, mime) }
  } catch (err) {
    console.warn('[muestra-despachada] No se pudo leer la foto de la guía:', err)
    return noDisponible('No se pudo leer la foto de la guía del pedido', { templateName })
  }
  const formatoArchivo = formatoHeaderParaMime(archivo.mime)
  if (!formatoArchivo) {
    return noDisponible(`La foto de la guía tiene un formato que WhatsApp no acepta (${archivo.mime})`, { templateName })
  }
  if (formatoArchivo !== headerFormat) {
    return noDisponible(
      headerFormat === 'IMAGE'
        ? 'La plantilla espera una imagen y la guía es un PDF'
        : 'La plantilla espera un documento (PDF) y la guía es una foto',
      { templateName },
    )
  }

  // Conversación del cliente (la del lead si vino del chat; se crea si no hay)
  let conversationId: string
  try {
    conversationId = (await ensureConversacionParaCliente(pedido.clienteId)).conversationId
  } catch (err) {
    return noDisponible(err instanceof Error ? err.message : 'El cliente no tiene WhatsApp', { templateName })
  }
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { waContactPhone: true },
  })
  if (!conv?.waContactPhone) return noDisponible('La conversación del cliente no tiene teléfono de WhatsApp', { templateName })

  const valores = resolveTemplateVariables(variablesAvisoMuestra(tmpl.bodyText, tmpl.variables), {
    clienteNombre: lead.contact?.name ?? undefined,
    vendedorNombre: lead.assignedUser?.name ?? vendedorNombre ?? undefined,
    productoInteres: lead.productInterest ?? undefined,
    pedidoNumero: numeroPedidoCorto(pedido.id),
    pedidoExpreso: pedido.expresoNombre ?? undefined,
  })
  const body = applyTemplateValues(tmpl.bodyText, valores).trim()

  return {
    ...base,
    ok: true,
    lead,
    pedido,
    pedidoId: pedido.id,
    fotoKey: pedido.remitoFotoUrl,
    conversationId,
    waContactPhone: conv.waContactPhone,
    templateName,
    templateLang,
    headerFormat,
    valores,
    body,
    archivo,
  }
}

/** Manda la plantilla con la foto, deja el mensaje en el chat y marca el lead como avisado. */
export async function enviarAvisoMuestra(
  leadId: string,
  user: { id: string; name: string | null },
): Promise<{ body: string; avisadaAt: Date; pedidoId: string }> {
  const prep = await prepararAvisoMuestra(leadId, user.name)
  if (!prep.ok) throw new ValidationError(prep.motivo)
  const { lead, pedido, conversationId, waContactPhone, templateName, templateLang, headerFormat, valores, body, archivo } = prep

  const mediaId = await uploadMediaToMeta(archivo.buffer, archivo.mime, archivo.nombre)
  const components: TemplateComponent[] = [
    buildHeaderMediaComponent(headerFormat, mediaId, archivo.nombre),
    ...(buildBodyComponents(valores) ?? []),
  ]
  const waMessageId = await sendTemplateMessage(waContactPhone, templateName, templateLang, components)

  const ahora = new Date()
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      waMessageId,
      direction: 'outbound',
      senderType: 'agent',
      senderId: user.id,
      contentType: 'template',
      body,
      isRead: true,
      sentAt: ahora,
    })
    .returning({ id: messages.id })
  if (msg) {
    // La foto ya vive en R2 (la subió fábrica): el chat la muestra desde esa misma clave
    await db.insert(attachments).values({
      messageId: msg.id,
      r2Key: pedido.remitoFotoUrl!,
      mimeType: archivo.mime,
      fileSize: archivo.buffer.length,
      originalFilename: archivo.nombre,
    })
  }
  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conversationId}`,
  )

  await marcarAvisada(lead, user.id, ahora, {
    pedidoId: pedido.id,
    texto: `Aviso de muestra despachada enviado por WhatsApp — pedido #${numeroPedidoCorto(pedido.id)}`,
  })

  return { body, avisadaAt: ahora, pedidoId: pedido.id }
}

/** "Ya le avisé por otro lado": saca el lead de pendientes sin mandar nada. */
export async function marcarMuestraAvisadaSinEnviar(
  leadId: string,
  userId: string,
): Promise<{ avisadaAt: Date }> {
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), isNull(leads.deletedAt)),
    columns: { id: true, contactId: true, assignedTo: true, productInterest: true, muestraEntregadaAt: true, muestraAvisadaAt: true },
  })
  if (!lead) throw new NotFoundError('Lead')
  if (!lead.muestraEntregadaAt) throw new ValidationError('La muestra todavía no se marcó como entregada')
  if (lead.muestraAvisadaAt) throw new ValidationError(`Ya se avisó el ${formatFechaInstanteAR(lead.muestraAvisadaAt)}`)

  const pedido = await pedidoMuestraEntregado(leadId)
  const ahora = new Date()
  await marcarAvisada(lead, userId, ahora, {
    pedidoId: pedido?.id ?? null,
    texto: 'Muestra despachada: marcada como avisada al cliente (sin mandar la plantilla)',
  })
  return { avisadaAt: ahora }
}

async function marcarAvisada(
  lead: LeadAviso,
  userId: string,
  ahora: Date,
  nota: { pedidoId: string | null; texto: string },
): Promise<void> {
  await db.update(leads).set({ muestraAvisadaAt: ahora, updatedAt: ahora }).where(eq(leads.id, lead.id))
  await db.insert(activityLog).values({
    leadId: lead.id,
    userId,
    action: 'note_added',
    metadata: { sistema: true, motivo: 'muestra_avisada', pedidoId: nota.pedidoId, texto: nota.texto },
  })
  await publishCrmEvent({ type: 'muestra_avisada', leadId: lead.id, assignedTo: lead.assignedTo })
}

/**
 * Muestras entregadas a las que todavía no se les avisó al cliente, de la
 * más reciente a la más vieja. Admin ve todas; gerente las de sus agentes;
 * ventas las de sus leads.
 */
export async function listarMuestrasPendientesAviso(user: SessionUser): Promise<MuestraPendienteAviso[]> {
  const conds = [isNull(leads.deletedAt), isNotNull(leads.muestraEntregadaAt), isNull(leads.muestraAvisadaAt)]

  if (esRolVentas(user.role)) {
    conds.push(eq(leads.assignedTo, user.id))
  } else if (user.role === 'gerente') {
    const { getSessionContext } = await import('@/lib/territorios/context')
    const ctx = await getSessionContext(user)
    if (ctx.agentesVisibles.length === 0) return []
    conds.push(inArray(leads.assignedTo, ctx.agentesVisibles))
  } else if (user.role !== 'admin') {
    return []
  }

  const rows = await db
    .select({
      leadId: leads.id,
      nombre: contacts.name,
      telefono: contacts.phone,
      entregadaAt: leads.muestraEntregadaAt,
      etapa: pipelineStages.name,
      etapaColor: pipelineStages.color,
      asignadoNombre: users.name,
    })
    .from(leads)
    .innerJoin(contacts, eq(leads.contactId, contacts.id))
    .leftJoin(pipelineStages, eq(leads.stageId, pipelineStages.id))
    .leftJoin(users, eq(leads.assignedTo, users.id))
    .where(and(...conds))
    .orderBy(desc(leads.muestraEntregadaAt))
    .limit(100)

  if (rows.length === 0) return []

  // Pedido de muestra entregado de cada lead (el más reciente si hubo varios)
  const pedidosRows = await db
    .select({
      id: pedidos.id,
      leadId: pedidos.leadId,
      remitoFotoUrl: pedidos.remitoFotoUrl,
      expresoNombre: pedidos.expresoNombre,
      entregadoAt: pedidos.entregadoAt,
    })
    .from(pedidos)
    .where(
      and(
        inArray(pedidos.leadId, rows.map((r) => r.leadId)),
        eq(pedidos.tipo, 'muestra'),
        eq(pedidos.estado, 'entregado'),
        isNull(pedidos.deletedAt),
      ),
    )
    .orderBy(desc(pedidos.entregadoAt))
  const pedidoPorLead = new Map<string, (typeof pedidosRows)[number]>()
  for (const p of pedidosRows) {
    if (p.leadId && !pedidoPorLead.has(p.leadId)) pedidoPorLead.set(p.leadId, p)
  }

  return rows.map((r) => {
    const p = pedidoPorLead.get(r.leadId)
    return {
      leadId: r.leadId,
      nombre: r.nombre,
      telefono: r.telefono,
      entregadaAt: (r.entregadaAt ?? new Date()).toISOString(),
      pedidoId: p?.id ?? null,
      expresoNombre: p?.expresoNombre ?? null,
      conFoto: !!p?.remitoFotoUrl,
      etapa: r.etapa,
      etapaColor: r.etapaColor,
      asignadoNombre: r.asignadoNombre,
    }
  })
}
