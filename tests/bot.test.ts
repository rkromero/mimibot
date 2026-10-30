import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock de todas las dependencias externas antes de importar el módulo.
// `insert().values()` devuelve una cadena que sirve tanto para `.returning()`
// como para `.onConflictDoNothing()` y para `await` directo.
vi.mock('@/db', () => {
  const chain = () => {
    const c: Record<string, unknown> = {}
    c['returning'] = vi.fn(() => Promise.resolve([{ id: 'row-1' }]))
    c['onConflictDoNothing'] = vi.fn(() => c)
    c['then'] = (res: (v: unknown) => void) => Promise.resolve(undefined).then(res)
    return c
  }
  return {
    db: {
      query: {
        leads: { findFirst: vi.fn() },
        botConfig: { findFirst: vi.fn() },
        botMedia: { findMany: vi.fn().mockResolvedValue([]) },
        propuestas: { findFirst: vi.fn().mockResolvedValue(null) },
        tags: { findFirst: vi.fn().mockResolvedValue({ id: 'tag-1' }) },
        followUpConfig: { findFirst: vi.fn().mockResolvedValue(null) },
        conversations: { findFirst: vi.fn().mockResolvedValue(null) },
        messages: { findMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
        pipelineStages: { findMany: vi.fn().mockResolvedValue([]) },
        recetas: { findMany: vi.fn().mockResolvedValue([{ gramaje: 40 }, { gramaje: 60 }, { gramaje: 80 }]) },
      },
      insert: vi.fn(() => ({ values: vi.fn(() => chain()) })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
      execute: vi.fn(() => Promise.resolve()),
    },
  }
})

vi.mock('@/lib/claude/client', () => ({
  anthropic: {
    messages: { create: vi.fn() },
  },
  BOT_MODEL: 'claude-sonnet-4-5',
}))

vi.mock('@/lib/whatsapp/client', () => ({
  sendTextMessage: vi.fn(),
  sendMediaMessage: vi.fn().mockResolvedValue('wamid.media'),
  uploadMediaToMeta: vi.fn().mockResolvedValue('meta-media-1'),
}))

vi.mock('@/lib/r2/get-object', () => ({
  getObjectBuffer: vi.fn().mockResolvedValue({ buffer: Buffer.from('jpg'), contentType: 'image/jpeg' }),
}))

vi.mock('@/lib/push/web-push', () => ({
  enviarPushAUsuarios: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/assignment', () => ({
  assignLeadByRule: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/cotizador/propuestas.service', () => ({
  crearPropuesta: vi.fn().mockResolvedValue({
    id: 'prop-1',
    numero: 7,
    vigenteHasta: '2026-11-02',
    resultado: { escenarios: [{ cantidad: 1200, precioUnitNeto: 1, neto: 1, iva: 1, total: 1500000, setup: 0, elegido: true }] },
  }),
}))

vi.mock('@/lib/cotizador/enviar-propuesta.service', () => ({
  enviarPropuestaDesdeBot: vi.fn().mockResolvedValue({ etapaMovida: true }),
}))

vi.mock('@/lib/claude/bot-post-propuesta', () => ({
  procesarTurnoPostPropuesta: vi.fn().mockResolvedValue(true),
}))

import { db } from '@/db'
import { crearPropuesta } from '@/lib/cotizador/propuestas.service'
import { enviarPropuestaDesdeBot } from '@/lib/cotizador/enviar-propuesta.service'
import { anthropic } from '@/lib/claude/client'
import { sendTextMessage, sendMediaMessage } from '@/lib/whatsapp/client'
import { enviarPushAUsuarios } from '@/lib/push/web-push'
import { processBotTurn } from '@/lib/claude/bot'
import { procesarTurnoPostPropuesta } from '@/lib/claude/bot-post-propuesta'
import { RESPUESTA_PIDE_REUNION } from '@/lib/claude/bot-handoff'

const mockFindLead = db.query.leads.findFirst as ReturnType<typeof vi.fn>
const mockFindConfig = db.query.botConfig.findFirst as ReturnType<typeof vi.fn>
const mockFindMessages = db.query.messages.findMany as ReturnType<typeof vi.fn>
const mockFindStages = db.query.pipelineStages.findMany as ReturnType<typeof vi.fn>
const mockFindPropuesta = db.query.propuestas.findFirst as ReturnType<typeof vi.fn>
const mockFindMedia = db.query.botMedia.findMany as ReturnType<typeof vi.fn>
const mockInsert = db.insert as ReturnType<typeof vi.fn>
const mockUpdate = db.update as ReturnType<typeof vi.fn>
const mockClaudeCreate = anthropic.messages.create as ReturnType<typeof vi.fn>
const mockSendText = sendTextMessage as ReturnType<typeof vi.fn>
const mockSendMedia = sendMediaMessage as ReturnType<typeof vi.fn>
const mockPush = enviarPushAUsuarios as ReturnType<typeof vi.fn>
const mockCrearPropuesta = crearPropuesta as ReturnType<typeof vi.fn>
const mockEnviarPropuesta = enviarPropuestaDesdeBot as ReturnType<typeof vi.fn>
const mockTurnoPost = procesarTurnoPostPropuesta as ReturnType<typeof vi.fn>

/** Etiqueta registrada en la actividad `tag_added` (el tag ya existe en el mock de tags.findFirst). */
function tagAgregado(inserts: Record<string, unknown>[], nombre: string) {
  return inserts.find((v) => v['action'] === 'tag_added' && (v['metadata'] as { tagName?: string })?.tagName === nombre)
}

/** Cadena insert/update inspeccionable: devuelve los `values` y `set` registrados. */
function instalarCadenas() {
  const valuesMock = vi.fn((_values: unknown) => {
    const c: Record<string, unknown> = {}
    c['returning'] = vi.fn().mockResolvedValue([{ id: 'row-1' }])
    c['onConflictDoNothing'] = vi.fn(() => c)
    c['then'] = (res: (v: unknown) => void) => Promise.resolve(undefined).then(res)
    return c
  })
  mockInsert.mockReturnValue({ values: valuesMock })
  const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
  mockUpdate.mockReturnValue({ set: setMock })
  return {
    inserts: () => valuesMock.mock.calls.map((c) => c[0] as Record<string, unknown>),
    sets: () => setMock.mock.calls.map((c) => c[0] as Record<string, unknown>),
  }
}

const baseParams = {
  leadId: 'lead-1',
  conversationId: 'conv-1',
  inboundMessageId: 'msg-in-1',
  contactPhone: '+5491123456789',
}

const configBase = {
  systemPrompt: 'Sos un bot de ventas. La propuesta sale en 72 hs hábiles.',
  maxTurns: 6,
  handoffPhrases: [],
  precioReferencia: 'desde $350 por alfajor en 300 u film cristal, + IVA',
  productosExcluidos: ['triple', 'sin TACC'],
  plazoPropuesta: 'hoy mismo en horario hábil',
}

function leadActivo(extra: Record<string, unknown> = {}) {
  return { id: 'lead-1', botEnabled: true, botQualified: false, botTurnCount: 1, assignedTo: 'user-9', contact: { name: 'Rodolfo' }, ...extra }
}

function historial(ultimoDelUsuario: string) {
  return [
    { id: 'm1', senderType: 'contact', contentType: 'text', body: 'Hola', sentAt: new Date() },
    { id: 'm2', senderType: 'bot', contentType: 'text', body: '¿Qué buscás?', sentAt: new Date() },
    { id: 'm3', senderType: 'contact', contentType: 'text', body: ultimoDelUsuario, sentAt: new Date() },
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindPropuesta.mockResolvedValue(null)
  mockFindMedia.mockResolvedValue([])
  mockFindStages.mockResolvedValue([])
  ;(db.query.tags.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tag-1' })
  ;(db.query.messages.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })
})

describe('processBotTurn', () => {
  it('no procesa si el bot está desactivado', async () => {
    mockFindLead.mockResolvedValue({ id: 'lead-1', botEnabled: false, botQualified: false, botTurnCount: 0 })
    mockFindConfig.mockResolvedValue(null)

    await processBotTurn(baseParams)

    expect(mockClaudeCreate).not.toHaveBeenCalled()
  })

  it('no procesa si el lead ya fue calificado', async () => {
    mockFindLead.mockResolvedValue({ id: 'lead-1', botEnabled: true, botQualified: true, botTurnCount: 3 })
    mockFindConfig.mockResolvedValue(null)

    await processBotTurn(baseParams)

    expect(mockClaudeCreate).not.toHaveBeenCalled()
  })

  it('responde con Claude y guarda el mensaje', async () => {
    mockFindLead.mockResolvedValue({ id: 'lead-1', botEnabled: true, botQualified: false, botTurnCount: 1 })
    mockFindConfig.mockResolvedValue({ systemPrompt: 'Sos un bot de ventas.', maxTurns: 6, handoffPhrases: [] })
    mockFindMessages.mockResolvedValue([
      { id: 'm1', senderType: 'contact', contentType: 'text', body: 'Hola', sentAt: new Date() },
    ])
    mockClaudeCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hola! ¿En qué te puedo ayudar?' }],
    })
    instalarCadenas()
    mockSendText.mockResolvedValue('wamid.xxx')

    await processBotTurn(baseParams)

    expect(mockClaudeCreate).toHaveBeenCalledOnce()
    expect(mockInsert).toHaveBeenCalled()
    expect(mockSendText).toHaveBeenCalledWith('+5491123456789', 'Hola! ¿En qué te puedo ayudar?')
  })

  it('detecta el marcador [HANDOFF] y activa el handoff', async () => {
    mockFindLead.mockResolvedValue({ id: 'lead-1', botEnabled: true, botQualified: false, botTurnCount: 4 })
    mockFindConfig.mockResolvedValue({ systemPrompt: 'test', maxTurns: 6, handoffPhrases: [] })
    mockFindMessages.mockResolvedValue([
      { id: 'm1', senderType: 'contact', contentType: 'text', body: 'quiero comprar', sentAt: new Date() },
    ])
    mockClaudeCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Perfecto, te paso con un asesor. [HANDOFF]' }],
    })
    mockFindStages.mockResolvedValue([
      { id: 's1', slug: 'nuevo', position: 0, isTerminal: false },
      { id: 's2', slug: 'contactado', position: 1, isTerminal: false },
      { id: 's3', slug: 'calificado', position: 2, isTerminal: false },
    ])
    const { sets } = instalarCadenas()
    mockSendText.mockResolvedValue('wamid.yyy')

    await processBotTurn(baseParams)

    // Verificar que se hizo handoff: update de lead con botEnabled: false
    expect(mockUpdate).toHaveBeenCalled()
    expect(sets().find((s) => s['botEnabled'] === false)).toBeDefined()
    // Sin [RESUMEN] no hay datos para cotizar: no se crea propuesta
    expect(mockCrearPropuesta).not.toHaveBeenCalled()
  })

  it('lead ya calificado con el bot prendido: corre el turno post-propuesta y no califica de nuevo', async () => {
    mockFindLead.mockResolvedValue(leadActivo({ botQualified: true }))
    mockFindConfig.mockResolvedValue(configBase)

    await processBotTurn(baseParams)

    expect(mockTurnoPost).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-1', contactPhone: baseParams.contactPhone }))
    expect(mockClaudeCreate).not.toHaveBeenCalled()
  })

  it('lead calificado con el bot apagado: no hay turno de ningún tipo', async () => {
    mockFindLead.mockResolvedValue(leadActivo({ botQualified: true, botEnabled: false }))
    mockFindConfig.mockResolvedValue(configBase)

    await processBotTurn(baseParams)

    expect(mockTurnoPost).not.toHaveBeenCalled()
    expect(mockClaudeCreate).not.toHaveBeenCalled()
  })

  describe('propuesta automática al calificar', () => {
    const stages = [
      { id: 's1', slug: 'nuevo', position: 0, isTerminal: false },
      { id: 's3', slug: 'calificado', position: 2, isTerminal: false },
    ]

    function prepararHandoff(resumen: string, config: Record<string, unknown> = {}, leadExtra: Record<string, unknown> = {}) {
      mockFindLead.mockResolvedValue(leadActivo({ botTurnCount: 4, ...leadExtra }))
      mockFindConfig.mockResolvedValue({ ...configBase, ...config })
      mockFindMessages.mockResolvedValue(historial('dale, mandame la propuesta'))
      mockFindStages.mockResolvedValue(stages)
      mockClaudeCreate.mockResolvedValue({
        content: [{ type: 'text', text: `¡Genial! Hoy mismo te llega la propuesta. [HANDOFF]\n[RESUMEN]\n${resumen}` }],
      })
      mockSendText.mockResolvedValue('wamid.zzz')
      ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ id: 'user-9', role: 'vendedor' }, { id: 'admin-1', role: 'admin' }])),
        })),
      })
      return instalarCadenas()
    }

    it('crea la propuesta con cantidad / gramaje / packaging del resumen, la envía por WhatsApp, deja nota y avisa', async () => {
      const { inserts } = prepararHandoff(
        'Empresa: La Espiga\nCantidad: 1.200 alfajores\nGramaje: 80 g\nPackaging: personalizado\nScore: 11/14, grado A',
      )

      await processBotTurn(baseParams)

      expect(mockCrearPropuesta).toHaveBeenCalledWith(
        'lead-1',
        { cantidad: 1200, gramaje: 80, packaging: 'personalizado', descuentoManualPct: 0 },
        'user-9',
      )
      // Sale al toque a nombre del vendedor asignado (etapa + seguimiento los hace el servicio)
      expect(mockEnviarPropuesta).toHaveBeenCalledWith('prop-1', 'user-9')
      const nota = inserts().find(
        (v) => v['contentType'] === 'internal_note' && String(v['body']).includes('PROP-00007'),
      )
      expect(nota).toBeDefined()
      expect(String(nota!['body'])).toContain('creada y enviada por WhatsApp automáticamente')
      expect(String(nota!['body'])).toContain('1.200 alfajores de 80 g, packaging personalizado')
      expect(String(nota!['body'])).toContain('total $1.500.000')
      expect(String(nota!['body'])).toContain('vigente hasta 02/11/2026')
      expect(mockPush).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ title: 'Propuesta PROP-00007 enviada a Rodolfo' }),
      )
    })

    it('si el envío por WhatsApp falla, la propuesta queda en borrador y la nota lo dice', async () => {
      const { inserts } = prepararHandoff('Cantidad: 500\nGramaje: 60\nPackaging: cristal')
      mockEnviarPropuesta.mockRejectedValueOnce(new Error('Meta no respondió'))

      await processBotTurn(baseParams)

      expect(mockCrearPropuesta).toHaveBeenCalledOnce()
      const nota = inserts().find((v) => v['contentType'] === 'internal_note' && String(v['body']).includes('PROP-00007'))
      expect(String(nota!['body'])).toContain('NO se pudo enviar por WhatsApp: Meta no respondió')
      expect(String(nota!['body'])).toContain('enviala desde la ficha')
      expect(mockPush).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ title: 'Propuesta PROP-00007 creada, falta enviarla a Rodolfo' }),
      )
    })

    it('sin gramaje cotiza con el gramaje por defecto configurado y lo aclara en la nota', async () => {
      const { inserts } = prepararHandoff('Cantidad: 500\nGramaje: -\nPackaging: cristal', { gramajeDefault: 60 })

      await processBotTurn(baseParams)

      expect(mockCrearPropuesta).toHaveBeenCalledWith(
        'lead-1',
        expect.objectContaining({ cantidad: 500, gramaje: 60, packaging: 'cristal' }),
        'user-9',
      )
      const nota = inserts().find((v) => v['contentType'] === 'internal_note' && String(v['body']).includes('PROP-00007'))
      expect(String(nota!['body'])).toContain('gramaje no indicado: se cotizó 60 g')
    })

    it('sin cantidad no crea nada y deja una nota para cotizar a mano', async () => {
      const { inserts } = prepararHandoff('Empresa: La Espiga\nCantidad: -\nGramaje: 60\nPackaging: cristal')

      await processBotTurn(baseParams)

      expect(mockCrearPropuesta).not.toHaveBeenCalled()
      const nota = inserts().find(
        (v) => v['contentType'] === 'internal_note' && String(v['body']).includes('No se creó la propuesta automática'),
      )
      expect(String(nota!['body'])).toContain('no relevó la cantidad')
    })

    it('si el bot no relevó la cantidad pero el formulario trae un rango, cotiza el número más chico y lo aclara', async () => {
      const { inserts } = prepararHandoff(
        'Empresa: La Espiga\nCantidad: -\nGramaje: 60\nPackaging: -',
        {},
        {
          customFields: { cantidad: '300 a 1.000 u./mes', packaging: 'Bobina impresa con su marca' },
          notes: 'Nueva consulta desde web-alipro\n\nVolumen mensual: 300 a 1.000 u./mes\nPackaging: Bobina impresa con su marca',
        },
      )

      await processBotTurn(baseParams)

      // El prompt le dice al bot que el formulario ya trajo el volumen y el packaging
      const system = String(mockClaudeCreate.mock.calls[0]![0].system)
      expect(system).toContain('en el formulario puso "300 a 1.000 u./mes"')
      expect(system).toContain('eligió "Bobina impresa con su marca"')

      expect(mockCrearPropuesta).toHaveBeenCalledWith(
        'lead-1',
        { cantidad: 300, gramaje: 60, packaging: 'personalizado', descuentoManualPct: 0 },
        'user-9',
      )
      const nota = inserts().find(
        (v) => v['contentType'] === 'internal_note' && String(v['body']).includes('creada y enviada por WhatsApp'),
      )
      expect(String(nota!['body'])).toContain('cantidad tomada del formulario ("300 a 1.000 u./mes"): se cotizó 300')
      expect(String(nota!['body'])).toContain('packaging tomado del formulario')
    })

    it('con la opción apagada en Ajustes no crea propuesta ni deja nota', async () => {
      const { inserts } = prepararHandoff('Cantidad: 500\nGramaje: 60\nPackaging: cristal', { propuestaAutomatica: false })

      await processBotTurn(baseParams)

      expect(mockCrearPropuesta).not.toHaveBeenCalled()
      expect(inserts().some((v) => String(v['body']).includes('propuesta automática'))).toBe(false)
    })

    it('si el lead ya tiene una propuesta, no crea otra', async () => {
      prepararHandoff('Cantidad: 500\nGramaje: 60\nPackaging: cristal')
      // leadTienePropuestaEnviada filtra por estado (borrador no cuenta); el chequeo de duplicado no
      mockFindPropuesta.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'prop-0', numero: 3 })

      await processBotTurn(baseParams)

      expect(mockCrearPropuesta).not.toHaveBeenCalled()
    })

    it('si el cotizador falla (falta un insumo), el handoff igual se completa y queda nota del error', async () => {
      const { inserts, sets } = prepararHandoff('Cantidad: 500\nGramaje: 60\nPackaging: cristal')
      mockCrearPropuesta.mockRejectedValueOnce(new Error('Falta un insumo activo de tipo bobina (por unidad)'))

      await processBotTurn(baseParams)

      expect(sets().find((s) => s['botQualified'] === true)).toBeDefined()
      const nota = inserts().find((v) => String(v['body']).includes('No se pudo crear la propuesta automática'))
      expect(String(nota!['body'])).toContain('Falta un insumo activo de tipo bobina')
    })
  })

  it('inyecta precio, productos excluidos y plazo en el system prompt (y reemplaza las 72 hs hábiles)', async () => {
    mockFindLead.mockResolvedValue(leadActivo())
    mockFindConfig.mockResolvedValue(configBase)
    mockFindMessages.mockResolvedValue(historial('cuánto sale?'))
    mockClaudeCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Desde $350 por alfajor.' }] })
    instalarCadenas()

    await processBotTurn(baseParams)

    const system = (mockClaudeCreate.mock.calls[0]![0] as { system: string }).system
    expect(system).toContain('## Precio')
    expect(system).toContain('desde $350 por alfajor en 300 u film cristal, + IVA')
    expect(system).toContain('## Productos que NO hacemos')
    expect(system).toContain('- sin TACC')
    // Datos fijos: congelados siempre excluidos, colores de film y dirección única
    expect(system).toContain('- productos congelados')
    expect(system).toContain('## Datos fijos (no inventes ni prometas otra cosa)')
    expect(system).toContain('cristal (transparente) o negro liso. NO existe film blanco')
    expect(system).toContain('La planta está en José Ignacio de la Rosa 6276, Mataderos, CABA. Es la ÚNICA dirección')
    expect(system).toContain('NO hacemos nada congelado')
    // Con propuesta automática (default) el plazo es "por acá, en un momento", no el configurado
    expect(system).toContain('## Tiempos y mensaje de cierre')
    expect(system).toContain('Te mando la propuesta por acá en un momento')
    expect(system).toContain('La propuesta sale en por este mismo chat, apenas terminemos con estas preguntas.')
    expect(system).not.toMatch(/72 hs hábiles\./)
  })

  it('con la propuesta automática apagada, el plazo es el configurado y el cierre habla del asesor', async () => {
    mockFindLead.mockResolvedValue(leadActivo())
    mockFindConfig.mockResolvedValue({ ...configBase, propuestaAutomatica: false })
    mockFindMessages.mockResolvedValue(historial('cuánto sale?'))
    mockClaudeCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Desde $350 por alfajor.' }] })
    instalarCadenas()

    await processBotTurn(baseParams)

    const system = (mockClaudeCreate.mock.calls[0]![0] as { system: string }).system
    expect(system).toContain('## Tiempos')
    expect(system).toContain('La propuesta sale en hoy mismo en horario hábil.')
    expect(system).not.toContain('Te mando la propuesta por acá en un momento')
  })

  it('con propuesta enviada no llama a Claude: nota interna, bot apagado y push al asignado', async () => {
    mockFindLead.mockResolvedValue(leadActivo())
    mockFindConfig.mockResolvedValue(configBase)
    mockFindPropuesta.mockResolvedValue({ id: 'prop-1' })
    ;(db.query.messages.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ body: 'vi la propuesta, me sirve' })
    ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ id: 'user-9', role: 'vendedor' }, { id: 'admin-1', role: 'admin' }])),
      })),
    })
    const { inserts, sets } = instalarCadenas()

    await processBotTurn(baseParams)

    expect(mockClaudeCreate).not.toHaveBeenCalled()
    expect(mockSendText).not.toHaveBeenCalled()
    const nota = inserts().find((v) => v['contentType'] === 'internal_note')
    expect(nota).toBeDefined()
    expect(String(nota!['body'])).toContain('después de recibir la propuesta')
    expect(sets().find((s) => s['botEnabled'] === false)).toBeDefined()
    expect(mockPush).toHaveBeenCalledOnce()
    const [ids, payload] = mockPush.mock.calls[0]! as [string[], { title: string; url: string }]
    expect(ids).toEqual(expect.arrayContaining(['user-9', 'admin-1']))
    expect(payload.title).toContain('Rodolfo')
    expect(payload.url).toBe('/inbox?conversation=conv-1')
  })

  it('pide "triple": etiqueta lista-espera-triple y NO pasa a Calificado', async () => {
    mockFindLead.mockResolvedValue(leadActivo())
    mockFindConfig.mockResolvedValue(configBase)
    mockFindMessages.mockResolvedValue(historial('quiero alfajores triples'))
    mockClaudeCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Por ahora no hacemos triples, pero sí el clásico de 50 g. ¿Te sirve? [LISTA_ESPERA: triple]' }],
    })
    const { inserts, sets } = instalarCadenas()

    await processBotTurn(baseParams)

    expect(mockSendText).toHaveBeenCalledWith('+5491123456789', 'Por ahora no hacemos triples, pero sí el clásico de 50 g. ¿Te sirve?')
    const tag = tagAgregado(inserts(), 'lista-espera-triple')
    expect(tag).toBeDefined()
    expect(inserts().find((v) => v['action'] === 'tag_added')).toBeDefined()
    expect(sets().find((s) => s['botQualified'] === true)).toBeUndefined()
    expect(inserts().find((v) => v['action'] === 'bot_handoff')).toBeUndefined()
  })

  it('"sin TACC" con cierre: etiqueta, bot apagado, sin Calificado ni asignación', async () => {
    mockFindLead.mockResolvedValue(leadActivo())
    mockFindConfig.mockResolvedValue(configBase)
    mockFindMessages.mockResolvedValue(historial('no, solo me interesa sin tacc'))
    mockClaudeCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Entiendo. Te avisamos cuando lo tengamos. [LISTA_ESPERA: sin TACC] [HANDOFF]\n[RESUMEN]\nEmpresa: -' }],
    })
    const { inserts, sets } = instalarCadenas()

    await processBotTurn(baseParams)

    expect(mockSendText).toHaveBeenCalledWith('+5491123456789', 'Entiendo. Te avisamos cuando lo tengamos.')
    expect(tagAgregado(inserts(), 'lista-espera-sin-tacc')).toBeDefined()
    expect(sets().find((s) => s['botQualified'] === true)).toBeUndefined()
    expect(sets().find((s) => s['botEnabled'] === false)).toBeDefined()
    expect(inserts().find((v) => v['action'] === 'bot_handoff')).toBeUndefined()
    const nota = inserts().find((v) => v['contentType'] === 'internal_note')
    expect(String(nota!['body'])).toContain('NO pasa a Calificado')
  })

  it('pedir foto manda una imagen real de la galería (R2 → Meta → WhatsApp) y la deja en el chat', async () => {
    mockFindLead.mockResolvedValue(leadActivo())
    mockFindConfig.mockResolvedValue(configBase)
    mockFindMessages.mockResolvedValue(historial('me mandás fotos del producto?'))
    mockFindMedia.mockResolvedValue([
      { id: 'med-1', categoria: 'producto_terminado', titulo: 'Alfajor 50 g', r2Key: 'bot-media/producto_terminado/a.jpg', mimeType: 'image/jpeg', orden: 0 },
      { id: 'med-2', categoria: 'planta', titulo: 'Planta', r2Key: 'bot-media/planta/p.jpg', mimeType: 'image/jpeg', orden: 0 },
    ])
    mockClaudeCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Te paso unas fotos. [FOTO: producto_terminado]' }] })
    const { inserts } = instalarCadenas()

    await processBotTurn(baseParams)

    const system = (mockClaudeCreate.mock.calls[0]![0] as { system: string }).system
    expect(system).toContain('## Fotos y videos')
    expect(mockSendText).toHaveBeenCalledWith('+5491123456789', 'Te paso unas fotos.')
    expect(mockSendMedia).toHaveBeenCalledTimes(1)
    expect(mockSendMedia).toHaveBeenCalledWith('+5491123456789', 'meta-media-1', 'image', 'Alfajor 50 g')
    const imagen = inserts().find((v) => v['contentType'] === 'image')
    expect(imagen).toMatchObject({ senderType: 'bot', body: 'Alfajor 50 g', waMessageId: 'wamid.media' })
    const adjunto = inserts().find((v) => v['r2Key'] === 'bot-media/producto_terminado/a.jpg')
    expect(adjunto).toMatchObject({ mimeType: 'image/jpeg', waMediaId: 'meta-media-1' })
  })

  it('si el modelo no marca [FOTO] pero la persona pidió ver el producto, manda igual', async () => {
    mockFindLead.mockResolvedValue(leadActivo())
    mockFindConfig.mockResolvedValue(configBase)
    mockFindMessages.mockResolvedValue(historial('tenés alguna foto?'))
    mockFindMedia.mockResolvedValue([
      { id: 'med-1', categoria: 'producto_terminado', titulo: 'Alfajor 50 g', r2Key: 'bot-media/a.jpg', mimeType: 'image/jpeg', orden: 0 },
    ])
    mockClaudeCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Claro, mirá.' }] })
    instalarCadenas()

    await processBotTurn(baseParams)

    expect(mockSendMedia).toHaveBeenCalledOnce()
  })

  it('pide una llamada: handoff inmediato sin Claude, tag pide-reunion y push', async () => {
    mockFindLead.mockResolvedValue(leadActivo())
    mockFindConfig.mockResolvedValue(configBase)
    mockFindMessages.mockResolvedValue(historial('me pueden llamar mañana?'))
    mockFindStages.mockResolvedValue([
      { id: 's1', slug: 'nuevo', position: 0, isTerminal: false },
      { id: 's3', slug: 'calificado', position: 2, isTerminal: false },
    ])
    ;(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([{ id: 'user-9', role: 'vendedor' }])) })),
    })
    const { inserts, sets } = instalarCadenas()

    await processBotTurn(baseParams)

    expect(mockClaudeCreate).not.toHaveBeenCalled()
    expect(mockSendText).toHaveBeenCalledWith('+5491123456789', RESPUESTA_PIDE_REUNION)
    expect(sets().find((s) => s['botQualified'] === true && s['stageId'] === 's3')).toBeDefined()
    expect(tagAgregado(inserts(), 'pide-reunion')).toBeDefined()
    expect(inserts().find((v) => v['action'] === 'bot_handoff')).toBeDefined()
    expect(mockPush).toHaveBeenCalledOnce()
    expect(mockPush.mock.calls[0]![0]).toEqual(['user-9'])
    expect((mockPush.mock.calls[0]![1] as { title: string }).title).toContain('pide que lo contacten')
  })
})
