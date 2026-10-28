/**
 * Modo post-propuesta del bot (lo que toca la base).
 *
 * Al enviarse la propuesta (bot o vendedor) el lead vuelve a tener el bot
 * prendido, ya calificado (`botEnabled = true`, `botQualified = true`), y
 * cada mensaje de la persona pasa por `procesarTurnoPostPropuesta`: el bot
 * averigua si la vio y si le cierran los números, responde dudas con los
 * datos de la propuesta, carga la muestra si la pide (pedido de muestra
 * pendiente de aprobación, igual que el botón de la ficha) y, cuando la
 * persona decide el primer pedido o pide algo que no puede resolver
 * (descuento, hablar con alguien), se apaga y avisa al vendedor.
 *
 * Si el vendedor escribe en el chat después de la propuesta, el bot se corre
 * solo. "Bot OFF" a mano sigue mandando: con el bot apagado no hay turno.
 * Las reglas puras (prompt, secciones, parser de marcadores) están en
 * bot-post-propuesta-reglas.ts.
 */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { activityLog, botConfig, leads, messages, propuestas } from '@/db/schema'
import { anthropic, BOT_MODEL } from './client'
import { withRetry } from './retry'
import { sendTextMessage } from '@/lib/whatsapp/client'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { propuestaResultadoSchema } from '@/lib/validations/cotizador'
import { crearMuestraParaLead, muestraDelLead } from '@/lib/leads/muestra.service'
import { botApagadoAMano } from '@/lib/followup/propuesta'
import { agregarTagALead, TAG_NUEVO_PEDIDO } from '@/lib/leads/tags'
import { moverLeadAPedidoACargar } from '@/lib/leads/pedido-a-cargar'
import { formatFechaAR } from '@/lib/dates'
import { armarContextoLead, armarHistorialClaude, armarSeccionMedios } from './bot-context'
import { detectarPedidoMedios, extraerSenales } from './bot-reglas'
import { elegirMedios, enviarMediosBot, listarMediosActivos, type MedioGaleria } from './bot-media'
import { alertarEquipoBot, dejarNotaInternaBot } from './bot-alertas'
import {
  armarNotaMuestraCargada,
  armarSeccionConocimiento,
  armarSeccionDerivacionPost,
  armarSeccionEsperaPropuesta,
  armarSeccionMuestra,
  armarSeccionPropuestaEnviada,
  camposFichaDesdeMuestra,
  DEFAULT_POST_PROPUESTA_PROMPT,
  EXPRESO_MUESTRA,
  extraerSenalesPostPropuesta,
  faltantesMuestra,
  POST_PROPUESTA_MAX_TURNS_DEFAULT,
  type PropuestaParaBot,
} from './bot-post-propuesta-reglas'
import type { LeadConContacto } from './bot'
import { esAcuseDeRecibo, minutosDesde, MINUTOS_ESPERA_PROPUESTA } from '@/lib/followup/propuesta-vista'

export type ConfigPostPropuesta = Partial<
  Pick<
    typeof botConfig.$inferSelect,
    'postPropuestaEnabled' | 'postPropuestaPrompt' | 'postPropuestaMaxTurns' | 'conocimientoBot' | 'retiroFabricaInfo'
  >
> | null | undefined

/**
 * Se llama al registrar el envío de una propuesta: deja el bot prendido en
 * modo post-propuesta (calificado + habilitado, contador de turnos en cero).
 * No hace nada si la opción está apagada en Ajustes, el lead está cerrado o
 * alguien apagó el bot a mano antes de calificar.
 */
export async function activarModoPostPropuesta(leadId: string): Promise<boolean> {
  const config = await db.query.botConfig.findFirst({ columns: { postPropuestaEnabled: true } })
  if (config && !config.postPropuestaEnabled) return false

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    columns: { id: true, isOpen: true, botEnabled: true, botQualified: true },
  })
  if (!lead || !lead.isOpen) return false
  if (botApagadoAMano(lead)) return false

  await db
    .update(leads)
    .set({ botEnabled: true, botQualified: true, botTurnCount: 0, updatedAt: new Date() })
    .where(eq(leads.id, leadId))
  await db.insert(activityLog).values({
    leadId,
    action: 'bot_enabled',
    metadata: { motivo: 'propuesta enviada: el bot sigue la charla (modo post-propuesta)' },
  })
  return true
}

/** Import dinámico: el motor de seguimientos importa el bot (ciclo). Nunca hace fallar el turno. */
async function programarPreguntaPropuestaVistaBestEffort(leadId: string, propuestaEnviadaAt: Date): Promise<void> {
  try {
    const { programarPreguntaPropuestaVista } = await import('@/lib/followup/engine')
    await programarPreguntaPropuestaVista(leadId, propuestaEnviadaAt)
  } catch (err) {
    console.warn(`[bot] no se pudo programar la pregunta por la propuesta del lead ${leadId}:`, err)
  }
}

/** Última vez que prendieron el bot (al mandar la propuesta o a mano desde el panel). */
async function ultimaActivacionBot(leadId: string): Promise<Date | null> {
  const row = await db.query.activityLog.findFirst({
    where: and(eq(activityLog.leadId, leadId), eq(activityLog.action, 'bot_enabled')),
    orderBy: [desc(activityLog.createdAt)],
    columns: { createdAt: true },
  })
  return row?.createdAt ?? null
}

async function apagarBot(leadId: string, motivo: string): Promise<void> {
  await db.update(leads).set({ botEnabled: false, updatedAt: new Date() }).where(eq(leads.id, leadId))
  await db.insert(activityLog).values({ leadId, action: 'bot_disabled', metadata: { motivo } })
}

function fecha(d: Date | string | null | undefined): string | null {
  if (!d) return null
  try {
    return formatFechaAR(d)
  } catch {
    return null
  }
}

/** Última propuesta enviada (o aceptada) del lead, lista para el prompt. */
async function propuestaEnviadaDelLead(leadId: string): Promise<(PropuestaParaBot & { updatedAt: Date }) | null> {
  const p = await db.query.propuestas.findFirst({
    where: and(eq(propuestas.leadId, leadId), inArray(propuestas.estado, ['enviada', 'aceptada']), isNull(propuestas.deletedAt)),
    orderBy: [desc(propuestas.updatedAt)],
    columns: { numero: true, cantidad: true, gramaje: true, packaging: true, vigenteHasta: true, resultado: true, updatedAt: true },
  })
  if (!p) return null
  const parsed = propuestaResultadoSchema.safeParse(p.resultado)
  const escenarios = parsed.success
    ? parsed.data.escenarios.map((e) => ({ cantidad: e.cantidad, precioUnitNeto: e.precioUnitNeto, total: e.total, elegido: e.elegido }))
    : []
  return {
    numero: p.numero,
    cantidad: p.cantidad,
    gramaje: p.gramaje,
    packaging: p.packaging,
    vigenteHasta: fecha(p.vigenteHasta),
    enviadaEl: fecha(p.updatedAt),
    escenarios,
    updatedAt: p.updatedAt,
  }
}

/**
 * Un turno del bot después de la propuesta. Devuelve false si el lead no
 * tiene propuesta enviada o el modo está apagado (no hay nada que hacer);
 * true si el turno se procesó (haya respondido o no).
 */
export async function procesarTurnoPostPropuesta(params: {
  lead: LeadConContacto
  config: ConfigPostPropuesta
  conversationId: string
  contactPhone: string
}): Promise<boolean> {
  const { lead, config, conversationId, contactPhone } = params
  if (config?.postPropuestaEnabled === false) return false
  const leadId = lead.id
  const assignedTo = lead.assignedTo ?? null
  const nombre = lead.contact?.name ?? null

  const propuesta = await propuestaEnviadaDelLead(leadId)
  if (!propuesta) return false

  const [history, mediosDisponibles, muestra] = await Promise.all([
    db.query.messages.findMany({ where: eq(messages.conversationId, conversationId), orderBy: [asc(messages.sentAt)] }),
    listarMediosActivos().catch((err) => {
      console.error('[bot] no se pudo leer la galería de medios:', err)
      return [] as MedioGaleria[]
    }),
    muestraDelLead(leadId).catch((err) => {
      console.error('[bot] no se pudo consultar la muestra del lead:', err)
      return null
    }),
  ])

  // El vendedor ya escribió después de la propuesta: la charla es suya. Solo
  // cuenta texto escrito a mano: las plantillas (aviso "salió tu muestra",
  // último seguimiento, envíos masivos) y los adjuntos son automatismos o
  // botones, no una conversación del vendedor. Si después lo volvieron a
  // prender desde el panel, lo escrito antes de eso ya no cuenta: si no, el
  // bot se apagaría solo otra vez en el primer turno.
  const reactivadoAt = await ultimaActivacionBot(leadId)
  const desde = Math.max(propuesta.updatedAt.getTime(), reactivadoAt?.getTime() ?? 0)
  const vendedorEscribio = history.some(
    (m) => m.senderType === 'agent' && m.contentType === 'text' && m.sentAt.getTime() > desde,
  )
  if (vendedorEscribio) {
    await apagarBot(leadId, 'el vendedor tomó la conversación después de la propuesta')
    await dejarNotaInternaBot({
      leadId,
      conversationId,
      assignedTo,
      texto:
        'El bot se corrió porque alguien del equipo le escribió al cliente después de la propuesta: la charla queda en tus manos. ' +
        'Si querés que el bot la siga él, prendelo de nuevo desde el panel del lead.',
    })
    return true
  }

  const maxTurnos = config?.postPropuestaMaxTurns ?? POST_PROPUESTA_MAX_TURNS_DEFAULT
  if ((lead.botTurnCount ?? 0) >= maxTurnos) {
    await apagarBot(leadId, 'límite de turnos del modo post-propuesta')
    await dejarNotaInternaBot({
      leadId,
      conversationId,
      assignedTo,
      texto: `El bot ya intercambió ${maxTurnos} mensajes después de la propuesta sin cerrar. Se apagó: seguila vos.`,
    })
    await alertarEquipoBot({
      conversationId,
      assignedTo,
      titulo: `${nombre ?? 'Un lead'} sigue sin cerrar después de la propuesta`,
      cuerpo: 'El bot llegó al límite de mensajes. Tomá la conversación.',
    })
    return true
  }

  const { turnos: claudeMessages, previosDelEquipo } = armarHistorialClaude(history)
  if (claudeMessages.length === 0) return true
  const ultimo = claudeMessages.at(-1)
  const ultimoDelUsuario = ultimo?.role === 'user' ? ultimo.content : ''

  const minutosDesdePropuesta = minutosDesde(propuesta.updatedAt)
  const basePrompt = config?.postPropuestaPrompt?.trim() || DEFAULT_POST_PROPUESTA_PROMPT
  const systemPrompt = [
    basePrompt,
    armarContextoLead(
      {
        contactName: nombre,
        empresa: lead.empresa,
        productoInteres: lead.productInterest,
        localidad: lead.localidad,
        direccion: lead.direccion,
        notas: lead.notes,
      },
      previosDelEquipo,
    ),
    armarSeccionPropuestaEnviada(propuesta),
    armarSeccionEsperaPropuesta(minutosDesdePropuesta),
    armarSeccionMuestra({
      yaCargada: muestra
        ? { fecha: fecha(muestra.createdAt), metodoEntrega: muestra.metodoEntrega, entregada: muestra.entregadoAt !== null }
        : null,
      retiroFabricaInfo: config?.retiroFabricaInfo,
      datosLead: lead,
    }),
    armarSeccionConocimiento(config?.conocimientoBot),
    armarSeccionMedios([...new Set(mediosDisponibles.map((m) => m.categoria))]),
    armarSeccionDerivacionPost(),
  ]
    .filter(Boolean)
    .join('\n\n')

  let crudo: string
  try {
    const response = await withRetry(
      () => anthropic.messages.create({ model: BOT_MODEL, max_tokens: 600, system: systemPrompt, messages: claudeMessages }),
      2,
      800,
    )
    crudo = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  } catch (err) {
    console.error('[bot] Claude error (post-propuesta):', err)
    return true
  }

  const senales = extraerSenales(crudo)
  const post = extraerSenalesPostPropuesta(senales.texto)

  if (post.visible) {
    await db.insert(messages).values({
      conversationId,
      direction: 'outbound',
      senderType: 'bot',
      contentType: 'text',
      body: post.visible,
      isRead: true,
      sentAt: new Date(),
    })
    await publishCrmEvent({ type: 'new_message', conversationId, leadId, assignedTo, direction: 'outbound' })
    try {
      await sendTextMessage(contactPhone, post.visible)
    } catch (err) {
      console.error('[bot] Error enviando mensaje por WhatsApp (post-propuesta):', err)
    }
  }

  await db
    .update(leads)
    .set({ botTurnCount: (lead.botTurnCount ?? 0) + 1, updatedAt: new Date() })
    .where(eq(leads.id, leadId))

  // Acusó recibo enseguida ("gracias", "ok"): la pregunta "¿pudiste verla?"
  // queda para una hora después de la propuesta, no ahora.
  const soloAcuso =
    minutosDesdePropuesta < MINUTOS_ESPERA_PROPUESTA &&
    esAcuseDeRecibo(ultimoDelUsuario) &&
    !post.pedido && !post.handoff && !post.muestra && !post.muestraMarcada
  if (soloAcuso) await programarPreguntaPropuestaVistaBestEffort(leadId, propuesta.updatedAt)

  const categorias = senales.medios.length > 0 ? senales.medios : (detectarPedidoMedios(ultimoDelUsuario) ?? [])
  if (categorias.length > 0 && mediosDisponibles.length > 0) {
    const elegidos = elegirMedios(mediosDisponibles, categorias)
    if (elegidos.length > 0) {
      await enviarMediosBot({ leadId, conversationId, contactPhone, assignedTo, medios: elegidos })
    }
  }

  if (post.muestra) {
    await cargarMuestraDesdeBot({ lead, conversationId, datos: post.muestra, yaCargada: muestra !== null })
  } else if (post.muestraMarcada) {
    await dejarNotaInternaBot({
      leadId,
      conversationId,
      assignedTo,
      texto: 'El bot quiso cargar la muestra pero no indicó si la retira o va por expreso. Cargala desde la ficha si corresponde.',
    })
  }

  if (post.pedido || post.handoff) {
    await apagarBot(leadId, post.pedido ? 'el cliente quiere hacer el primer pedido' : 'el bot derivó al vendedor')
    if (post.pedido) {
      // Chip "Nuevo pedido" en la tarjeta y columna "Pedido a cargar" hasta que el vendedor lo cargue
      try {
        await agregarTagALead(leadId, TAG_NUEVO_PEDIDO, { motivo: 'bot: el cliente decidió el primer pedido' })
      } catch (err) {
        console.error('[bot] no se pudo etiquetar nuevo pedido:', err)
      }
      try {
        await moverLeadAPedidoACargar(leadId, { motivo: 'bot_pedido' })
      } catch (err) {
        console.error('[bot] no se pudo mover el lead a Pedido a cargar:', err)
      }
    }
    const resumen = post.resumen ? `\n\nResumen del bot:\n${post.resumen}` : ''
    await dejarNotaInternaBot({
      leadId,
      conversationId,
      assignedTo,
      texto: post.pedido
        ? `El cliente quiere hacer el primer pedido. Cargalo pendiente de aprobación y mandale la proforma con los datos para la seña. El bot se apagó.${resumen}`
        : `El bot derivó la charla al vendedor y se apagó: contestá vos.${resumen}`,
    })
    await alertarEquipoBot({
      conversationId,
      assignedTo,
      titulo: post.pedido ? `${nombre ?? 'Un lead'} quiere hacer el primer pedido` : `${nombre ?? 'Un lead'} necesita al vendedor`,
      cuerpo: (post.resumen?.split('\n').find((l) => l.trim()) ?? ultimoDelUsuario).slice(0, 160) || 'Tomá la conversación.',
    })
  }

  return true
}

async function cargarMuestraDesdeBot(params: {
  lead: LeadConContacto
  conversationId: string
  datos: NonNullable<ReturnType<typeof extraerSenalesPostPropuesta>['muestra']>
  yaCargada: boolean
}): Promise<void> {
  const { lead, conversationId, datos, yaCargada } = params
  const leadId = lead.id
  const assignedTo = lead.assignedTo ?? null
  const nombre = lead.contact?.name ?? 'el lead'

  if (yaCargada) {
    console.log('[bot] muestra: el lead ya tiene una muestra cargada, no se crea otra', { leadId })
    return
  }

  const faltan = faltantesMuestra(datos, lead)
  if (faltan.length > 0) {
    await dejarNotaInternaBot({
      leadId,
      conversationId,
      assignedTo,
      texto: `El bot quiso cargar la muestra por expreso pero faltan datos: ${faltan.join(', ')}. Completalos y cargala desde la ficha.`,
    })
    return
  }
  if (!assignedTo) {
    await dejarNotaInternaBot({
      leadId,
      conversationId,
      assignedTo,
      texto: 'El cliente pidió la muestra pero el lead no tiene vendedor asignado. Asignalo y cargala desde la ficha.',
    })
    return
  }

  try {
    // Lo que dijo la persona (dirección, CUIT/DNI) queda en la ficha: el
    // servicio de muestra lo copia al cliente.
    const campos = camposFichaDesdeMuestra(datos)
    if (Object.keys(campos).length > 0) {
      await db.update(leads).set({ ...campos, updatedAt: new Date() }).where(eq(leads.id, leadId))
    }

    const esExpreso = datos.entrega === 'expreso'
    const muestra = await crearMuestraParaLead({
      leadId,
      metodoEntrega: datos.entrega,
      expresoNombre: esExpreso ? EXPRESO_MUESTRA : null,
      expresoDireccion: esExpreso ? EXPRESO_MUESTRA : null,
      userId: assignedTo,
      origen: 'bot',
    })

    await dejarNotaInternaBot({ leadId, conversationId, assignedTo, texto: armarNotaMuestraCargada(datos, lead) })
    await alertarEquipoBot({
      conversationId,
      assignedTo,
      titulo: `Muestra cargada para ${nombre}`,
      cuerpo: esExpreso ? `Va por ${EXPRESO_MUESTRA}. El pedido de muestra ya está confirmado para fábrica.` : 'La retira en fábrica. El pedido de muestra ya está confirmado.',
    })
    await publishCrmEvent({ type: 'lead_updated', leadId, assignedTo, oldAssigned: assignedTo, stageId: lead.stageId, oldStageId: lead.stageId })
    console.log('[bot] muestra cargada', { leadId, pedidoId: muestra.pedidoId })
  } catch (err) {
    console.error('[bot] no se pudo cargar la muestra:', err)
    const detalle = err instanceof Error ? err.message : 'error desconocido'
    await dejarNotaInternaBot({
      leadId,
      conversationId,
      assignedTo,
      texto: `El cliente pidió la muestra pero no se pudo cargar (${detalle}). Cargala desde la ficha.`,
    })
    await alertarEquipoBot({
      conversationId,
      assignedTo,
      titulo: `Muestra pendiente para ${nombre}`,
      cuerpo: 'No se pudo cargar sola. Cargala desde la ficha del lead.',
    })
  }
}
