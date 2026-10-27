import { eq, asc } from 'drizzle-orm'
import { db } from '@/db'
import { leads, conversations, messages, botConfig } from '@/db/schema'
import { anthropic, BOT_MODEL } from './client'
import { withRetry } from './retry'
import { sendTextMessage } from '@/lib/whatsapp/client'
import { publishCrmEvent } from '@/lib/realtime/broker'
import { programarSeguimientoIndagacion } from '@/lib/followup/engine'
import { leadTienePropuestaEnviada } from '@/lib/leads/propuesta-enviada'
import { agregarTagALead, tagListaEspera } from '@/lib/leads/tags'
import {
  armarContextoLead,
  armarHistorialClaude,
  armarInstruccionEmpresa,
  armarSeccionMedios,
  armarSeccionPlazo,
  armarSeccionPrecio,
  armarSeccionProductosExcluidos,
  separarResumen,
  HANDOFF_MARKER,
  PLAZO_PROPUESTA_DEFAULT,
  PLAZO_PROPUESTA_AUTOMATICA,
} from './bot-context'
import { detectarPedidoMedios, detectarPedidoReunion, extraerSenales, reemplazarPlazoPropuesta } from './bot-reglas'
import { elegirMedios, enviarMediosBot, listarMediosActivos, type MedioGaleria } from './bot-media'
import { armarSeccionCotizacion, datosFormularioLead, GRAMAJE_DEFAULT_BOT } from './bot-cotizacion'
import { listarGramajesCotizador } from './bot-propuesta'
import { procesarTurnoPostPropuesta } from './bot-post-propuesta'
import {
  cerrarSinCalificar,
  derivarPorPedidoDeReunion,
  pausarBotPorPropuestaEnviada,
  performHandoff,
} from './bot-handoff'

const DEFAULT_SYSTEM_PROMPT = `Sos un asistente de ventas. Tu objetivo es calificar al lead de manera conversacional y amable.

Hacé estas preguntas de a una, en orden natural:
1. ¿Cuál es tu nombre?
2. ¿Qué estás buscando o en qué te podemos ayudar?
3. ¿Cuál es tu presupuesto aproximado?
4. ¿Para cuándo lo necesitás?

Cuando hayas obtenido toda la información de calificación, O cuando el usuario pida explícitamente hablar con una persona, incluí ${HANDOFF_MARKER} al final de tu mensaje de despedida.

Respondé siempre en el mismo idioma que el usuario. Sé breve y conversacional. No uses listas ni markdown. Máximo 2-3 oraciones por respuesta.`

export async function processBotTurn(params: {
  leadId: string
  conversationId: string
  inboundMessageId: string
  contactPhone: string
}): Promise<void> {
  const { leadId, conversationId, contactPhone } = params

  // Cargar lead y configuración del bot
  const [lead, config] = await Promise.all([
    db.query.leads.findFirst({
      where: eq(leads.id, leadId),
      with: { contact: { columns: { name: true } } },
    }),
    db.query.botConfig.findFirst(),
  ])

  if (!lead || !lead.botEnabled) return

  // No activar bot para conversaciones de clientes
  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { clienteId: true },
  })
  if (conv?.clienteId) return

  // Ya calificó: si tiene propuesta enviada, sigue la charla en modo
  // post-propuesta (dudas, muestra, primer pedido). Si no, no hay turno.
  if (lead.botQualified) {
    await procesarTurnoPostPropuesta({ lead, config, conversationId, contactPhone })
    return
  }

  // Ya se le mandó una propuesta: el bot no tiene nada más que calificar.
  // Queda nota interna, se apaga para este lead y se avisa al asignado.
  if (await leadTienePropuestaEnviada(leadId)) {
    await pausarBotPorPropuestaEnviada(lead, conversationId, params.inboundMessageId)
    return
  }

  // <<CRITERIO_DE_CALIFICACION>>: definir la condición que marca al lead como calificado.
  // Actualmente se califica (handoff) cuando: el bot supera maxTurns, el bot incluye
  // [HANDOFF] en su respuesta, o el usuario escribe una frase de handoff.
  if (lead.botTurnCount >= (config?.maxTurns ?? 6)) {
    await performHandoff(lead, conversationId, 'Límite de turnos alcanzado.', null, config)
    return
  }

  const { systemPrompt, claudeMessages, mediosDisponibles } = await construirContextoBot(lead, config, conversationId)
  if (claudeMessages.length === 0) return
  const ultimo = claudeMessages.at(-1)
  const ultimoDelUsuario = ultimo?.role === 'user' ? ultimo.content : ''

  // Pide llamada, visita o reunión: handoff inmediato, sin pasar por Claude.
  if (detectarPedidoReunion(ultimoDelUsuario)) {
    await derivarPorPedidoDeReunion(lead, conversationId, contactPhone, ultimoDelUsuario)
    return
  }

  let claudeResponse: string
  try {
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: BOT_MODEL,
          max_tokens: 512,
          system: systemPrompt,
          messages: claudeMessages,
        }),
      2,
      800,
    )
    claudeResponse = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  } catch (err) {
    // Claude falló — loguear y no responder. El lead queda para atención manual.
    console.error('[bot] Claude error:', err)
    return
  }

  // <<CRITERIO_DE_CALIFICACION>>: condición principal — [HANDOFF] en respuesta del bot
  // o frase de handoff detectada en el último mensaje del usuario.
  // El bloque [RESUMEN] (datos relevados) nunca va al cliente: queda como nota interna.
  // Los marcadores [LISTA_ESPERA: x] y [FOTO: cat] tampoco: son señales para el sistema.
  const senales = extraerSenales(claudeResponse)
  const { visible: cleanResponse, resumen, handoff } = separarResumen(senales.texto)
  const shouldHandoff = handoff || checkHandoffPhrases(ultimoDelUsuario, config?.handoffPhrases ?? [])

  if (cleanResponse) {
    // Guardar respuesta del bot en DB
    await db.insert(messages).values({
      conversationId,
      direction: 'outbound',
      senderType: 'bot',
      contentType: 'text',
      body: cleanResponse,
      isRead: true,
      sentAt: new Date(),
    })

    // Emitir SSE para que el chat se actualice con la respuesta del bot
    await publishCrmEvent({
      type: 'new_message',
      conversationId,
      leadId,
      assignedTo: lead.assignedTo ?? null,
      direction: 'outbound',
    })
  }

  // Incrementar contador de turnos
  await db.update(leads)
    .set({ botTurnCount: (lead.botTurnCount ?? 0) + 1, updatedAt: new Date() })
    .where(eq(leads.id, leadId))

  // Enviar por WhatsApp
  if (cleanResponse) {
    try {
      await sendTextMessage(contactPhone, cleanResponse)
    } catch (err) {
      console.error('[bot] Error enviando mensaje por WhatsApp:', err)
    }
  }

  // Fotos / videos de la galería: lo que pidió el modelo o, si no marcó nada,
  // lo que la persona pidió ver en su mensaje.
  const categorias = senales.medios.length > 0 ? senales.medios : (detectarPedidoMedios(ultimoDelUsuario) ?? [])
  if (categorias.length > 0 && mediosDisponibles.length > 0) {
    const elegidos = elegirMedios(mediosDisponibles, categorias)
    if (elegidos.length > 0) {
      await enviarMediosBot({ leadId, conversationId, contactPhone, assignedTo: lead.assignedTo ?? null, medios: elegidos })
    }
  }

  // Producto que no hacemos: etiqueta "lista-espera-<producto>" y nunca
  // califica. Si el bot además cerró ([HANDOFF]), se apaga sin pasar a ventas.
  if (senales.listaEspera.length > 0) {
    for (const producto of senales.listaEspera) {
      try {
        await agregarTagALead(leadId, tagListaEspera(producto), { motivo: `bot: pide ${producto}, no lo hacemos` })
      } catch (err) {
        console.error('[bot] no se pudo etiquetar lista de espera:', err)
      }
    }
    if (shouldHandoff) {
      await cerrarSinCalificar(lead, conversationId, senales.listaEspera, resumen)
      return
    }
  } else if (shouldHandoff) {
    await performHandoff(lead, conversationId, cleanResponse, resumen, config)
    return
  }

  // El bot acaba de escribir: si la persona no responde, seguimiento de indagación
  // (2 hs → retomar la pregunta; 23 hs → mensaje final; luego Perdido).
  try {
    await programarSeguimientoIndagacion(leadId)
  } catch (err) {
    console.error('[bot] no se pudo programar el seguimiento de indagación:', err)
  }
}

export type LeadConContacto = typeof leads.$inferSelect & { contact?: { name: string | null } | null }

/**
 * System prompt (config + lo que ya sabemos del lead) e historial en turnos
 * para Claude. Lo usan el turno normal del bot y el mensaje para retomar.
 */
export async function construirContextoBot(
  lead: LeadConContacto,
  config: typeof botConfig.$inferSelect | null | undefined,
  conversationId: string,
): Promise<{
  systemPrompt: string
  claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  mediosDisponibles: MedioGaleria[]
}> {
  const [history, mediosDisponibles, gramajes] = await Promise.all([
    db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.sentAt)],
    }),
    listarMediosActivos().catch((err) => {
      console.error('[bot] no se pudo leer la galería de medios:', err)
      return [] as MedioGaleria[]
    }),
    listarGramajesCotizador().catch((err) => {
      console.error('[bot] no se pudieron leer los gramajes del cotizador:', err)
      return [] as number[]
    }),
  ])

  // Contacto → user; bot y equipo (apertura con plantilla, textos del vendedor) → assistant.
  // Si la conversación arrancó con mensajes del equipo, van al contexto del system prompt.
  const { turnos: claudeMessages, previosDelEquipo } = armarHistorialClaude(history)

  // Lo que ya sabemos del lead (formulario del landing, notas) para que el bot
  // no vuelva a saludar ni a preguntar lo que ya está cargado.
  const customFields = (lead.customFields ?? {}) as Record<string, unknown>
  const empresa =
    lead.empresa?.trim() ||
    (typeof customFields['empresa'] === 'string' ? customFields['empresa'] : null)
  const contextoLead = armarContextoLead(
    {
      contactName: lead.contact?.name ?? null,
      empresa,
      productoInteres: lead.productInterest,
      localidad: lead.localidad,
      direccion: lead.direccion,
      notas: lead.notes,
    },
    previosDelEquipo,
  )

  // Con propuesta automática (default), el PDF sale solo por el chat al derivar:
  // el plazo que se le dice al cliente es "por acá, en un momento", no el configurado.
  const propuestaAutomatica = config?.propuestaAutomatica !== false
  const plazoConfigurado = config?.plazoPropuesta?.trim() || PLAZO_PROPUESTA_DEFAULT
  const plazo = propuestaAutomatica ? PLAZO_PROPUESTA_AUTOMATICA : plazoConfigurado
  // Si el prompt guardado todavía promete "72 hs hábiles", pasa al plazo que corresponde.
  const basePrompt = reemplazarPlazoPropuesta(config?.systemPrompt || DEFAULT_SYSTEM_PROMPT, plazo)
  // La empresa / marca se pregunta si falta y se pide en el [RESUMEN] para
  // guardarla en el lead al calificar (qualifyAndAssign).
  const partes = [
    basePrompt,
    contextoLead,
    armarInstruccionEmpresa(empresa),
    armarSeccionPrecio(config?.precioReferencia, plazo),
    armarSeccionProductosExcluidos(config?.productosExcluidos),
    armarSeccionPlazo(plazo, propuestaAutomatica),
    // Cantidad / gramaje / packaging en el [RESUMEN]: con eso se crea la propuesta sola al calificar.
    // Si el formulario ya trajo volumen / packaging, el bot los usa en vez de repreguntar.
    armarSeccionCotizacion(
      gramajes,
      config?.gramajeDefault ?? GRAMAJE_DEFAULT_BOT,
      datosFormularioLead(customFields, lead.notes),
    ),
    armarSeccionMedios([...new Set(mediosDisponibles.map((m) => m.categoria))]),
  ].filter(Boolean)
  return { systemPrompt: partes.join('\n\n'), claudeMessages, mediosDisponibles }
}

/**
 * Mensaje corto para retomar la indagación cuando la persona dejó de responder:
 * vuelve sobre la pregunta que quedó pendiente, sin saludar ni presentarse.
 * Devuelve null si Claude falla (el caller usa un texto fijo).
 */
export async function generarMensajeRetomar(leadId: string, conversationId: string): Promise<string | null> {
  const [lead, config] = await Promise.all([
    db.query.leads.findFirst({ where: eq(leads.id, leadId), with: { contact: { columns: { name: true } } } }),
    db.query.botConfig.findFirst(),
  ])
  if (!lead) return null

  const { systemPrompt, claudeMessages } = await construirContextoBot(lead, config, conversationId)
  if (claudeMessages.length === 0) return null

  const instruccion =
    '[Instrucción del sistema, no es un mensaje de la persona] Pasaron unas horas y la persona no respondió tu último mensaje. ' +
    'Escribí UN solo mensaje breve (máximo 2 oraciones) para retomar: volvé sobre la pregunta que quedó pendiente, ' +
    'de forma amable y fácil de contestar. No saludes de nuevo, no te presentes, no repitas información ya dada, ' +
    'no digas que es un seguimiento automático, sin markdown ni listas. Respondé solo con el mensaje.'

  try {
    const response = await withRetry(
      () =>
        anthropic.messages.create({
          model: BOT_MODEL,
          max_tokens: 200,
          system: systemPrompt,
          messages: [...claudeMessages, { role: 'user', content: instruccion }],
        }),
      2,
      800,
    )
    const crudo = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const texto = separarResumen(crudo).visible
    return texto || null
  } catch (err) {
    console.error('[bot] Claude error generando mensaje para retomar:', err)
    return null
  }
}

function checkHandoffPhrases(userMessage: string, phrases: string[]): boolean {
  const lower = userMessage.toLowerCase()
  const defaultPhrases = ['hablar con alguien', 'hablar con una persona', 'quiero un humano', 'agente humano']
  const allPhrases = [...defaultPhrases, ...phrases]
  return allPhrases.some((p) => lower.includes(p.toLowerCase()))
}

