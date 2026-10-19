/**
 * Envíos masivos: el motor que manda. Lo dispara el programador cada minuto
 * (envíos programados vencidos o que quedaron a medias por un reinicio) y la
 * creación de un envío "ahora".
 *
 * Por cada destinatario pendiente: vuelve a chequear que el lead siga abierto
 * y con WhatsApp, resuelve las variables (nombre del contacto, vendedor
 * asignado o quien creó el envío, producto de interés), manda la plantilla,
 * deja el mensaje en el chat del lead marcado con el envío y actualiza los
 * contadores. Entre mensaje y mensaje espera PAUSA_ENTRE_MENSAJES_MS.
 *
 * Si la plantilla es la de último seguimiento (Ajustes → Seguimiento), cada
 * destinatario pasa por el mismo motor que el botón del panel del lead: se
 * manda, queda la nota y se programa el cierre a Perdido ("Dejó de responder")
 * si no contesta en el plazo. Los que no pueden (ya esperando, cerrados)
 * quedan omitidos con el motivo.
 *
 * Fuera del horario permitido (8 a 22 hs) se detiene y queda programado para
 * el próximo inicio; el programador lo retoma.
 */
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  contacts, conversations, enviosMasivos, enviosMasivosDestinatarios, leads, messages, users,
} from '@/db/schema'
import { ValidationError } from '@/lib/errors'
import { enviarUltimoSeguimiento, esPlantillaUltimoSeguimiento } from '@/lib/followup/engine'
import { contextoApertura } from '@/lib/leads/apertura'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { variablesParaChat } from '@/lib/whatsapp/apertura'
import { buildBodyComponents, sendTemplateMessage } from '@/lib/whatsapp/client'
import { applyTemplateValues, resolveTemplateVariables } from '@/lib/whatsapp/variables'
import { PAUSA_ENTRE_MENSAJES_MS, momentoDeEnvio, puedeEnviarAhora } from './reglas'

declare global {
  // eslint-disable-next-line no-var
  var __enviosMasivosEnCurso: Set<string> | undefined
}

const enCurso = (): Set<string> => (globalThis.__enviosMasivosEnCurso ??= new Set())

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type Envio = typeof enviosMasivos.$inferSelect

/** Envíos que corresponde procesar ahora: programados vencidos y "enviando" (interrumpidos). */
export async function procesarEnviosMasivosPendientes(): Promise<{ procesados: number }> {
  const ahora = new Date()
  const pendientes = await db
    .select({ id: enviosMasivos.id })
    .from(enviosMasivos)
    .where(and(
      inArray(enviosMasivos.estado, ['programado', 'enviando']),
      lte(enviosMasivos.programadoAt, ahora),
    ))
    .orderBy(asc(enviosMasivos.programadoAt))
  let procesados = 0
  for (const e of pendientes) {
    if (enCurso().has(e.id)) continue
    await procesarEnvio(e.id)
    procesados++
  }
  return { procesados }
}

type Destinatario = typeof enviosMasivosDestinatarios.$inferSelect

async function marcarDestinatario(
  d: Destinatario,
  cambios: Partial<typeof enviosMasivosDestinatarios.$inferInsert>,
  contador: 'enviados' | 'fallidos' | 'omitidos',
): Promise<void> {
  await db.update(enviosMasivosDestinatarios).set(cambios).where(eq(enviosMasivosDestinatarios.id, d.id))
  await db
    .update(enviosMasivos)
    .set({ [contador]: sql`${enviosMasivos[contador]} + 1`, updatedAt: new Date() })
    .where(eq(enviosMasivos.id, d.envioId))
}

/** Procesa un envío hasta terminarlo, cancelarlo o salir del horario. */
export async function procesarEnvio(envioId: string): Promise<void> {
  if (enCurso().has(envioId)) return
  enCurso().add(envioId)
  try {
    const envio = await db.query.enviosMasivos.findFirst({ where: eq(enviosMasivos.id, envioId) })
    if (!envio || envio.estado === 'cancelado' || envio.estado === 'completado') return

    const ahora = new Date()
    if (!puedeEnviarAhora(ahora)) {
      await db
        .update(enviosMasivos)
        .set({ estado: 'programado', programadoAt: momentoDeEnvio(null, ahora), updatedAt: ahora })
        .where(eq(enviosMasivos.id, envioId))
      return
    }

    await db
      .update(enviosMasivos)
      .set({ estado: 'enviando', iniciadoAt: envio.iniciadoAt ?? ahora, updatedAt: ahora })
      .where(eq(enviosMasivos.id, envioId))

    const creador = await db.query.users.findFirst({ where: eq(users.id, envio.creadoPor), columns: { name: true } })
    const esUltimoSeguimiento = await esPlantillaUltimoSeguimiento(envio.templateName, envio.templateLang)
    const variables = variablesParaChat(envio.templateBody, null)
    const varsConfiguradas = await variablesDePlantilla(envio)
    const vars = varsConfiguradas ?? variables

    const pendientes = await db.query.enviosMasivosDestinatarios.findMany({
      where: and(eq(enviosMasivosDestinatarios.envioId, envioId), eq(enviosMasivosDestinatarios.estado, 'pendiente')),
      orderBy: [asc(enviosMasivosDestinatarios.createdAt)],
    })

    for (const d of pendientes) {
      // ¿Lo cancelaron mientras corría? ¿Salimos del horario?
      const estadoActual = await db.query.enviosMasivos.findFirst({ where: eq(enviosMasivos.id, envioId), columns: { estado: true } })
      if (estadoActual?.estado === 'cancelado') return
      if (!puedeEnviarAhora(new Date())) {
        await db
          .update(enviosMasivos)
          .set({ estado: 'programado', programadoAt: momentoDeEnvio(null, new Date()), updatedAt: new Date() })
          .where(eq(enviosMasivos.id, envioId))
        return
      }

      await enviarADestinatario(envio, d, vars, creador?.name ?? null, esUltimoSeguimiento)
      await dormir(PAUSA_ENTRE_MENSAJES_MS)
    }

    await db
      .update(enviosMasivos)
      .set({ estado: 'completado', finalizadoAt: new Date(), updatedAt: new Date() })
      .where(eq(enviosMasivos.id, envioId))
  } catch (err) {
    console.error(`[envios-masivos] error procesando ${envioId}:`, err)
  } finally {
    enCurso().delete(envioId)
  }
}

/** Variables configuradas en la plantilla al registrarla (si las hay). */
async function variablesDePlantilla(envio: Envio) {
  const { whatsappTemplates } = await import('@/db/schema')
  const tmpl = await db.query.whatsappTemplates.findFirst({
    where: and(eq(whatsappTemplates.name, envio.templateName), eq(whatsappTemplates.language, envio.templateLang)),
    columns: { variables: true },
  })
  if (!tmpl) return null
  const vars = variablesParaChat(envio.templateBody, tmpl.variables)
  return vars.length > 0 ? vars : null
}

async function enviarADestinatario(
  envio: Envio,
  d: Destinatario,
  vars: ReturnType<typeof variablesParaChat>,
  nombreCreador: string | null,
  esUltimoSeguimiento = false,
): Promise<void> {
  const lead = await db
    .select({
      isOpen: leads.isOpen,
      assignedTo: leads.assignedTo,
      productInterest: leads.productInterest,
      contactName: contacts.name,
      vendedorNombre: users.name,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .where(eq(leads.id, d.leadId))
    .then((r) => r[0])

  if (!lead || !lead.isOpen) {
    await marcarDestinatario(d, { estado: 'omitido', motivo: 'El lead se cerró antes del envío' }, 'omitidos')
    return
  }

  const conv = d.conversationId
    ? await db.query.conversations.findFirst({ where: eq(conversations.id, d.conversationId), columns: { id: true, waContactPhone: true, leadId: true } })
    : await db.query.conversations.findFirst({ where: eq(conversations.leadId, d.leadId), columns: { id: true, waContactPhone: true, leadId: true } })
  if (!conv?.waContactPhone) {
    await marcarDestinatario(d, { estado: 'omitido', motivo: 'Sin teléfono de WhatsApp' }, 'omitidos')
    return
  }

  if (esUltimoSeguimiento) {
    await enviarUltimoSeguimientoADestinatario(envio, d, {
      id: lead.assignedTo ?? envio.creadoPor,
      name: lead.vendedorNombre ?? nombreCreador,
    })
    return
  }

  const ctx = contextoApertura({
    contactName: lead.contactName,
    vendedorNombre: lead.vendedorNombre,
    nombreDefault: nombreCreador,
    productInterest: lead.productInterest,
  })
  const valores = resolveTemplateVariables(vars, ctx)
  const body = applyTemplateValues(envio.templateBody, valores).trim()

  let waMessageId: string
  try {
    waMessageId = await sendTemplateMessage(conv.waContactPhone, envio.templateName, envio.templateLang, buildBodyComponents(valores))
  } catch (err) {
    const detalle = (err instanceof Error ? err.message : String(err)).slice(0, 300)
    await marcarDestinatario(d, { estado: 'fallido', motivo: detalle }, 'fallidos')
    return
  }

  const ahora = new Date()
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      waMessageId,
      direction: 'outbound',
      senderType: 'agent',
      senderId: lead.assignedTo ?? envio.creadoPor,
      contentType: 'template',
      body,
      isRead: true,
      sentAt: ahora,
      envioMasivoId: envio.id,
    })
    .returning({ id: messages.id })
  await db.execute(
    sql`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = ${conv.id}`,
  )
  await db.update(leads).set({ lastContactedAt: ahora, updatedAt: ahora }).where(eq(leads.id, d.leadId))
  await marcarDestinatario(d, { estado: 'enviado', enviadoAt: ahora, messageId: msg!.id, conversationId: conv.id, motivo: null }, 'enviados')

  await publishCrmEvent({
    type: 'new_message',
    conversationId: conv.id,
    leadId: d.leadId,
    assignedTo: lead.assignedTo ?? null,
    direction: 'outbound',
  })
}

/**
 * Último seguimiento por envío masivo: delega en el motor de seguimiento
 * (manda, nota en el chat, plazo de cierre, actividad, evento en vivo). Si el
 * motor dice que no se puede (ya esperando respuesta, lead cerrado, sin
 * plantilla aprobada) el destinatario queda omitido con ese motivo; un error
 * de Meta lo deja fallido.
 */
async function enviarUltimoSeguimientoADestinatario(
  envio: Envio,
  d: Destinatario,
  remitente: { id: string; name: string | null },
): Promise<void> {
  try {
    const r = await enviarUltimoSeguimiento(d.leadId, remitente, { envioMasivoId: envio.id })
    await marcarDestinatario(
      d,
      { estado: 'enviado', enviadoAt: new Date(), messageId: r.messageId, conversationId: r.conversationId, motivo: null },
      'enviados',
    )
  } catch (err) {
    const detalle = (err instanceof Error ? err.message : String(err)).slice(0, 300)
    if (err instanceof ValidationError) {
      await marcarDestinatario(d, { estado: 'omitido', motivo: detalle }, 'omitidos')
    } else {
      await marcarDestinatario(d, { estado: 'fallido', motivo: detalle }, 'fallidos')
    }
  }
}
