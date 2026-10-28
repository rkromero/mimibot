/**
 * Modo post-propuesta del bot (lib/claude/bot-post-propuesta.ts):
 * - responde al cliente con los datos de la propuesta en el prompt
 * - se corre si el vendedor escribió después de la propuesta
 * - carga la muestra (expreso VIA CARGO / retiro) y guarda los datos en la ficha
 * - [PEDIDO] / [HANDOFF] apagan el bot, dejan nota y avisan
 * - al llegar al límite de turnos se apaga y avisa
 * - activarModoPostPropuesta prende el bot calificado salvo bot apagado a mano
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockFindLead, mockFindConfig, mockFindPropuesta, mockFindMessages, mockFindMedia,
  mockInsert, mockUpdate, mockSelect, mockClaude, mockSendText, mockPush, mockCrearMuestra, mockMuestraDelLead, mockFindActivacion,
  mockProgramarPregunta,
} = vi.hoisted(() => ({
  mockFindActivacion: vi.fn(),
  mockProgramarPregunta: vi.fn().mockResolvedValue(undefined),
  mockFindLead: vi.fn(),
  mockFindConfig: vi.fn(),
  mockFindPropuesta: vi.fn(),
  mockFindMessages: vi.fn(),
  mockFindMedia: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockSelect: vi.fn(),
  mockClaude: vi.fn(),
  mockSendText: vi.fn(),
  mockPush: vi.fn(),
  mockCrearMuestra: vi.fn(),
  mockMuestraDelLead: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    query: {
      leads: { findFirst: mockFindLead },
      botConfig: { findFirst: mockFindConfig },
      propuestas: { findFirst: mockFindPropuesta },
      messages: { findMany: mockFindMessages },
      botMedia: { findMany: mockFindMedia },
      tags: { findFirst: vi.fn().mockResolvedValue({ id: 'tag-np' }) },
      pipelineStages: { findFirst: vi.fn().mockResolvedValue({ id: 'st-pedido' }) },
      activityLog: { findFirst: mockFindActivacion },
    },
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  },
}))
vi.mock('@/lib/claude/client', () => ({ anthropic: { messages: { create: mockClaude } }, BOT_MODEL: 'test-model' }))
vi.mock('@/lib/whatsapp/client', () => ({ sendTextMessage: mockSendText, sendMediaMessage: vi.fn(), uploadMediaToMeta: vi.fn() }))
vi.mock('@/lib/r2/get-object', () => ({ getObjectBuffer: vi.fn() }))
vi.mock('@/lib/push/web-push', () => ({ enviarPushAUsuarios: mockPush }))
vi.mock('@/lib/realtime/broker', () => ({ publishCrmEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/leads/muestra.service', () => ({ crearMuestraParaLead: mockCrearMuestra, muestraDelLead: mockMuestraDelLead }))
vi.mock('@/lib/followup/engine', () => ({ programarPreguntaPropuestaVista: mockProgramarPregunta }))

import { activarModoPostPropuesta, procesarTurnoPostPropuesta } from '@/lib/claude/bot-post-propuesta'
import { EXPRESO_MUESTRA } from '@/lib/claude/bot-post-propuesta-reglas'

const ENVIADA = new Date('2026-10-27T12:00:00Z')

function lead(extra: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    botEnabled: true,
    botQualified: true,
    botTurnCount: 2,
    assignedTo: 'user-9',
    stageId: 'st-prop',
    empresa: 'La Espiga',
    productInterest: 'alfajores',
    localidad: null,
    direccion: null,
    provincia: null,
    codigoPostal: null,
    cuit: null,
    notes: null,
    contact: { name: 'Rodolfo' },
    ...extra,
  } as never
}

function msg(senderType: string, body: string, minutosDespues: number, contentType = 'text') {
  return { id: `m-${body.slice(0, 8)}`, senderType, contentType, direction: senderType === 'contact' ? 'inbound' : 'outbound', body, sentAt: new Date(ENVIADA.getTime() + minutosDespues * 60_000) }
}

function historial(...despues: ReturnType<typeof msg>[]) {
  return [
    msg('contact', 'Hola, quiero cotizar', -120),
    msg('bot', 'Dale, ¿cuántos querés?', -110),
    msg('contact', 'mil', -100),
    msg('bot', 'Te mando la propuesta', -10),
    msg('bot', 'Propuesta PROP-00051', 0, 'document'),
    ...despues,
  ]
}

function respuesta(texto: string) {
  mockClaude.mockResolvedValue({ content: [{ type: 'text', text: texto }] })
}

const config = { postPropuestaEnabled: true, postPropuestaMaxTurns: 12, conocimientoBot: 'Vida útil 45 días.', retiroFabricaInfo: 'Av. Siempreviva 123, de 9 a 16' }

let valuesMock: ReturnType<typeof vi.fn>
let setMock: ReturnType<typeof vi.fn>
const inserts = () => valuesMock.mock.calls.map((c) => c[0] as Record<string, unknown>)
const sets = () => setMock.mock.calls.map((c) => c[0] as Record<string, unknown>)
const notas = () => inserts().filter((v) => v['contentType'] === 'internal_note').map((v) => String(v['body']))
const systemPrompt = () => String((mockClaude.mock.calls[0]![0] as { system: string }).system)

beforeEach(() => {
  vi.clearAllMocks()
  valuesMock = vi.fn(() => {
    const c: Record<string, unknown> = {}
    c['returning'] = vi.fn().mockResolvedValue([{ id: 'row-1' }])
    c['onConflictDoNothing'] = vi.fn(() => c)
    c['then'] = (res: (v: unknown) => void) => Promise.resolve(undefined).then(res)
    return c
  })
  mockInsert.mockReturnValue({ values: valuesMock })
  setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
  mockUpdate.mockReturnValue({ set: setMock })
  mockSelect.mockReturnValue({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ id: 'user-9', role: 'vendedor' }, { id: 'admin-1', role: 'admin' }])) })) })
  mockFindMedia.mockResolvedValue([])
  mockMuestraDelLead.mockResolvedValue(null)
  // Se prendió al mandar la propuesta (misma marca de tiempo)
  mockFindActivacion.mockResolvedValue({ createdAt: ENVIADA })
  mockFindPropuesta.mockResolvedValue({
    numero: 51,
    cantidad: 1000,
    gramaje: 60,
    packaging: 'cristal',
    vigenteHasta: '2026-11-03',
    updatedAt: ENVIADA,
    resultado: { escenarios: [{ cantidad: 1000, precioUnitNeto: 450, neto: 450000, iva: 94500, total: 544500, setup: 0, elegido: true }] },
  })
  mockFindMessages.mockResolvedValue(historial(msg('contact', 'Sí, la vi', 60)))
  mockSendText.mockResolvedValue('wamid.1')
  mockCrearMuestra.mockResolvedValue({ pedidoId: 'ped-1', clienteId: 'cli-1', estado: 'pendiente_aprobacion', total: '1.00', metodoEntrega: 'expreso', expresoNombre: EXPRESO_MUESTRA, expresoDireccion: EXPRESO_MUESTRA, pagoSimbolico: '1.00', clienteNuevo: true })
})

const params = { conversationId: 'conv-1', contactPhone: '+5491100000000' }

describe('procesarTurnoPostPropuesta', () => {
  it('responde con la propuesta, el conocimiento y la muestra en el prompt, guarda el mensaje y suma un turno', async () => {
    respuesta('¡Qué bueno! ¿Te cierran los números?')

    const r = await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(r).toBe(true)
    const system = systemPrompt()
    expect(system).toContain('Propuesta PROP-00051')
    expect(system).toContain('1.000 unidades: $450 + IVA por alfajor, total $544.500 (la cantidad que pidió)')
    expect(system).toContain('Vida útil 45 días.')
    expect(system).toContain('Av. Siempreviva 123, de 9 a 16')
    expect(system).toContain('[PEDIDO] seguido de [HANDOFF]')
    expect(mockSendText).toHaveBeenCalledWith('+5491100000000', '¡Qué bueno! ¿Te cierran los números?')
    expect(inserts().find((v) => v['senderType'] === 'bot')).toMatchObject({ body: '¡Qué bueno! ¿Te cierran los números?', contentType: 'text' })
    expect(sets().find((s) => s['botTurnCount'] === 3)).toBeDefined()
    expect(sets().find((s) => s['botEnabled'] === false)).toBeUndefined()
  })

  it('sin propuesta enviada no hace nada (false)', async () => {
    mockFindPropuesta.mockResolvedValue(null)
    expect(await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })).toBe(false)
    expect(mockClaude).not.toHaveBeenCalled()
  })

  it('con la opción apagada no hace nada (false)', async () => {
    expect(await procesarTurnoPostPropuesta({ lead: lead(), config: { postPropuestaEnabled: false }, ...params })).toBe(false)
    expect(mockFindPropuesta).not.toHaveBeenCalled()
  })

  it('si el vendedor escribió después de la propuesta, se apaga sin responder', async () => {
    mockFindMessages.mockResolvedValue(historial(msg('agent', 'Hola Rodolfo, soy Juan', 30), msg('contact', 'Hola Juan', 60)))

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(mockClaude).not.toHaveBeenCalled()
    expect(mockSendText).not.toHaveBeenCalled()
    expect(sets().find((s) => s['botEnabled'] === false)).toBeDefined()
    expect(inserts().find((v) => v['action'] === 'bot_disabled')).toMatchObject({ metadata: { motivo: 'el vendedor tomó la conversación después de la propuesta' } })
    // Queda explicado en el chat, con cómo volver a prenderlo
    expect(notas().some((n) => n.includes('El bot se corrió') && n.includes('prendelo de nuevo'))).toBe(true)
  })

  it('si lo volvieron a prender desde el panel, lo que escribió el vendedor antes de eso ya no cuenta', async () => {
    // El vendedor escribió a los 30 min, lo prendieron a mano a los 45, el cliente escribe a los 60
    mockFindMessages.mockResolvedValue(historial(msg('agent', 'Me parece ok', 30), msg('contact', 'Me parece ok', 60)))
    mockFindActivacion.mockResolvedValue({ createdAt: new Date(ENVIADA.getTime() + 45 * 60_000) })
    respuesta('¡Buenísimo! ¿Cuántos negros y cuántos blancos querés para arrancar?')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(mockSendText).toHaveBeenCalledWith('+5491100000000', '¡Buenísimo! ¿Cuántos negros y cuántos blancos querés para arrancar?')
    expect(sets().find((s) => s['botEnabled'] === false)).toBeUndefined()
  })

  it('el prompt deja claro que el PDF ya llegó y que un "ok" después de la propuesta es acuerdo, y el historial incluye el archivo', async () => {
    mockFindMessages.mockResolvedValue(historial(msg('contact', 'Perfecto', 1)))
    respuesta('¿Pudiste abrirla? ¿Qué te parecieron los números?')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(systemPrompt()).toContain('NUNCA digas que la cotización está en camino')
    expect(systemPrompt()).toContain('llevala al primer pedido')
    const turnos = (mockClaude.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> }).messages
    expect(turnos.at(-2)?.content).toContain('[Archivo enviado: Propuesta PROP-00051]')
  })

  it('"gracias" a los pocos minutos de la propuesta: responde corto y deja programada la pregunta para una hora después', async () => {
    const reciente = new Date(Date.now() - 2 * 60_000)
    mockFindPropuesta.mockResolvedValue({ numero: 51, cantidad: 1000, gramaje: 60, packaging: 'cristal', vigenteHasta: '2026-11-03', updatedAt: reciente, resultado: { escenarios: [] } })
    mockFindActivacion.mockResolvedValue({ createdAt: reciente })
    mockFindMessages.mockResolvedValue([
      { id: 'm1', senderType: 'contact', contentType: 'text', direction: 'inbound', body: 'Cristal', sentAt: new Date(reciente.getTime() - 60_000) },
      { id: 'm2', senderType: 'bot', contentType: 'document', direction: 'outbound', body: 'Propuesta PROP-00051', sentAt: reciente },
      { id: 'm3', senderType: 'contact', contentType: 'text', direction: 'inbound', body: 'Gracias', sentAt: new Date(reciente.getTime() + 60_000) },
    ])
    respuesta('De nada! Vela tranquilo y cualquier duda me escribís por acá.')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(systemPrompt()).toContain('hace 2 minutos')
    expect(systemPrompt()).toContain('NO le preguntes si la vio')
    expect(mockSendText).toHaveBeenCalledWith('+5491100000000', 'De nada! Vela tranquilo y cualquier duda me escribís por acá.')
    expect(mockProgramarPregunta).toHaveBeenCalledWith('lead-1', reciente)
  })

  it('pasada la hora, o si la persona pregunta algo, no se programa la pregunta aparte', async () => {
    // ENVIADA es de ayer: ya pasó la hora
    mockFindMessages.mockResolvedValue(historial(msg('contact', 'Gracias', 90)))
    respuesta('¿Pudiste verla? ¿Qué te parecieron los números?')
    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })
    expect(systemPrompt()).toContain('preguntale si pudo abrirla')
    expect(mockProgramarPregunta).not.toHaveBeenCalled()

    // Reciente pero con una pregunta concreta: el bot la responde ahora
    const reciente = new Date(Date.now() - 2 * 60_000)
    mockFindPropuesta.mockResolvedValue({ numero: 51, cantidad: 1000, gramaje: 60, packaging: 'cristal', vigenteHasta: '2026-11-03', updatedAt: reciente, resultado: { escenarios: [] } })
    mockFindMessages.mockResolvedValue([
      { id: 'm1', senderType: 'contact', contentType: 'text', direction: 'inbound', body: 'Gracias, el precio incluye el envío?', sentAt: new Date(reciente.getTime() + 60_000) },
    ])
    respuesta('El envío se cotiza aparte según destino.')
    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })
    expect(mockProgramarPregunta).not.toHaveBeenCalled()
  })

  it('una plantilla a nombre del vendedor (aviso "salió tu muestra", último seguimiento) no cuenta como que tomó la charla', async () => {
    mockFindMessages.mockResolvedValue(historial(msg('agent', 'Salió tu muestra por Via Cargo', 30, 'template'), msg('contact', '¡Gracias! Ya la recibí', 60)))
    respuesta('¡Qué bueno! ¿Qué te pareció?')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(mockSendText).toHaveBeenCalledWith('+5491100000000', '¡Qué bueno! ¿Qué te pareció?')
    expect(sets().find((s) => s['botEnabled'] === false)).toBeUndefined()
  })

  it('el documento de la propuesta mandado por el vendedor no cuenta como que tomó la charla', async () => {
    mockFindMessages.mockResolvedValue([...historial().slice(0, 4), msg('agent', 'Propuesta PROP-00051', 0, 'document'), msg('contact', 'Gracias', 60)])
    respuesta('¿Pudiste verla?')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(mockSendText).toHaveBeenCalled()
  })

  it('carga la muestra por expreso VIA CARGO, guarda los datos en la ficha, deja nota y avisa', async () => {
    respuesta('¡Listo! Te la mando por Via Cargo y te aviso cuando salga.\n[MUESTRA]\nEntrega: expreso\nDireccion: Av. Rivadavia 1234\nLocalidad: Morón\nProvincia: Buenos Aires\nCP: 1708\nCUIT: 20-30123456-7')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(mockSendText).toHaveBeenCalledWith('+5491100000000', '¡Listo! Te la mando por Via Cargo y te aviso cuando salga.')
    expect(sets().find((s) => s['direccion'] === 'Av. Rivadavia 1234')).toMatchObject({ localidad: 'Morón', provincia: 'Buenos Aires', codigoPostal: '1708', cuit: '20-30123456-7' })
    expect(mockCrearMuestra).toHaveBeenCalledWith({
      leadId: 'lead-1',
      metodoEntrega: 'expreso',
      expresoNombre: EXPRESO_MUESTRA,
      expresoDireccion: EXPRESO_MUESTRA,
      userId: 'user-9',
      origen: 'bot',
    })
    expect(notas().some((n) => n.includes(`va por expreso ${EXPRESO_MUESTRA} a Av. Rivadavia 1234, Morón, Buenos Aires, CP 1708, CUIT/DNI 20-30123456-7`))).toBe(true)
    expect(mockPush).toHaveBeenCalledWith(expect.arrayContaining(['user-9']), expect.objectContaining({ title: 'Muestra cargada para Rodolfo' }))
    // La charla sigue: el bot no se apaga por cargar la muestra
    expect(sets().find((s) => s['botEnabled'] === false)).toBeUndefined()
  })

  it('retiro en fábrica: carga la muestra sin pedir datos ni tocar la ficha', async () => {
    respuesta('Te espero en la fábrica.\n[MUESTRA]\nEntrega: retiro\nDireccion: -\nLocalidad: -\nProvincia: -\nCP: -\nCUIT: -')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(mockCrearMuestra).toHaveBeenCalledWith(expect.objectContaining({ metodoEntrega: 'retiro_fabrica', expresoNombre: null, expresoDireccion: null }))
    expect(sets().find((s) => 'direccion' in s)).toBeUndefined()
    expect(notas().some((n) => n.includes('la retira en fábrica'))).toBe(true)
  })

  it('expreso con datos incompletos (ni en el bloque ni en la ficha): no carga y deja nota con lo que falta', async () => {
    respuesta('Dale.\n[MUESTRA]\nEntrega: expreso\nDireccion: Calle 1\nLocalidad: -\nProvincia: -\nCP: -\nCUIT: -')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(mockCrearMuestra).not.toHaveBeenCalled()
    expect(notas().some((n) => n.includes('faltan datos: localidad, provincia, código postal, CUIT o DNI'))).toBe(true)
  })

  it('completa con la ficha lo que el bloque no trae', async () => {
    respuesta('Dale.\n[MUESTRA]\nEntrega: expreso\nDireccion: -\nLocalidad: -\nProvincia: -\nCP: -\nCUIT: -')

    await procesarTurnoPostPropuesta({ lead: lead({ direccion: 'Calle 1', localidad: 'Morón', provincia: 'BA', codigoPostal: '1708', cuit: '20-1-1' }), config, ...params })

    expect(mockCrearMuestra).toHaveBeenCalled()
  })

  it('si ya tiene una muestra cargada no crea otra', async () => {
    mockMuestraDelLead.mockResolvedValue({ id: 'ped-0', estado: 'confirmado', metodoEntrega: 'expreso', createdAt: ENVIADA, entregadoAt: null })
    respuesta('Ya te la cargué.\n[MUESTRA]\nEntrega: retiro')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(systemPrompt()).toContain('Ya tiene una muestra cargada')
    expect(mockCrearMuestra).not.toHaveBeenCalled()
  })

  it('si falla la carga de la muestra, deja nota y avisa para cargarla desde la ficha', async () => {
    mockCrearMuestra.mockRejectedValue(new Error('Producto "Muestra" activo de la marca CDA'))
    respuesta('Listo.\n[MUESTRA]\nEntrega: retiro')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(notas().some((n) => n.includes('no se pudo cargar (Producto "Muestra" activo de la marca CDA). Cargala desde la ficha.'))).toBe(true)
    expect(mockPush).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Muestra pendiente para Rodolfo' }))
  })

  it('[PEDIDO]: apaga el bot, nota con el resumen, push "quiere hacer el primer pedido", etiqueta y columna Pedido a cargar', async () => {
    mockFindLead.mockResolvedValue({ id: 'lead-1', stageId: 'st-prop', isOpen: true, assignedTo: 'user-9' })
    respuesta('¡Buenísimo! Te cargo el pedido y te llega la proforma. [PEDIDO] [HANDOFF]\n[RESUMEN]\nQuiere 600 negros y 400 blancos.')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(mockSendText).toHaveBeenCalledWith('+5491100000000', '¡Buenísimo! Te cargo el pedido y te llega la proforma.')
    expect(sets().find((s) => s['botEnabled'] === false)).toBeDefined()
    expect(notas().some((n) => n.includes('quiere hacer el primer pedido') && n.includes('Quiere 600 negros y 400 blancos.'))).toBe(true)
    expect(mockPush).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Rodolfo quiere hacer el primer pedido', body: 'Quiere 600 negros y 400 blancos.' }))
    // Chip "Nuevo pedido" en la tarjeta: etiqueta nuevo-pedido
    expect(inserts().find((v) => v['action'] === 'tag_added')).toMatchObject({ metadata: { tagName: 'nuevo-pedido' } })
    expect(inserts().find((v) => v['tagId'] === 'tag-np')).toMatchObject({ leadId: 'lead-1' })
    // Y pasa a la columna "Pedido a cargar"
    expect(sets().find((s) => s['stageId'] === 'st-pedido')).toBeDefined()
    expect(inserts().find((v) => v['action'] === 'stage_changed')).toMatchObject({ metadata: { fromStageId: 'st-prop', toStageId: 'st-pedido', motivo: 'bot_pedido' } })
  })

  it('[HANDOFF] sin pedido no etiqueta nuevo-pedido', async () => {
    respuesta('Lo veo con el equipo. [HANDOFF]')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(inserts().find((v) => v['action'] === 'tag_added')).toBeUndefined()
    expect(sets().find((s) => 'stageId' in s)).toBeUndefined()
  })

  it('[HANDOFF] por descuento: apaga el bot y avisa al vendedor', async () => {
    respuesta('Lo consulto con el equipo y te digo. [HANDOFF]\n[RESUMEN]\nPide 10% de descuento.')

    await procesarTurnoPostPropuesta({ lead: lead(), config, ...params })

    expect(sets().find((s) => s['botEnabled'] === false)).toBeDefined()
    expect(mockPush).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Rodolfo necesita al vendedor', body: 'Pide 10% de descuento.' }))
  })

  it('al llegar al límite de turnos se apaga, deja nota y avisa sin llamar a Claude', async () => {
    await procesarTurnoPostPropuesta({ lead: lead({ botTurnCount: 12 }), config, ...params })

    expect(mockClaude).not.toHaveBeenCalled()
    expect(sets().find((s) => s['botEnabled'] === false)).toBeDefined()
    expect(notas().some((n) => n.includes('12 mensajes después de la propuesta'))).toBe(true)
    expect(mockPush).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Rodolfo sigue sin cerrar después de la propuesta' }))
  })
})

describe('activarModoPostPropuesta', () => {
  it('prende el bot calificado con el contador en cero y lo registra', async () => {
    mockFindConfig.mockResolvedValue({ postPropuestaEnabled: true })
    mockFindLead.mockResolvedValue({ id: 'lead-1', isOpen: true, botEnabled: false, botQualified: true })

    expect(await activarModoPostPropuesta('lead-1')).toBe(true)
    expect(sets()[0]).toMatchObject({ botEnabled: true, botQualified: true, botTurnCount: 0 })
    expect(inserts()[0]).toMatchObject({ action: 'bot_enabled' })
  })

  it('no lo prende si el bot estaba apagado a mano, el lead está cerrado o la opción está apagada', async () => {
    mockFindConfig.mockResolvedValue({ postPropuestaEnabled: true })
    mockFindLead.mockResolvedValue({ id: 'lead-1', isOpen: true, botEnabled: false, botQualified: false })
    expect(await activarModoPostPropuesta('lead-1')).toBe(false)

    mockFindLead.mockResolvedValue({ id: 'lead-1', isOpen: false, botEnabled: false, botQualified: true })
    expect(await activarModoPostPropuesta('lead-1')).toBe(false)

    mockFindConfig.mockResolvedValue({ postPropuestaEnabled: false })
    mockFindLead.mockResolvedValue({ id: 'lead-1', isOpen: true, botEnabled: false, botQualified: true })
    expect(await activarModoPostPropuesta('lead-1')).toBe(false)

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
