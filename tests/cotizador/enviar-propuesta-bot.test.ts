/**
 * enviarPropuestaDesdeBot: el bot manda la propuesta recién creada por
 * WhatsApp (mensaje del bot, sin senderId), la pasa a 'enviada' a nombre del
 * vendedor asignado, mueve el lead a "Propuesta enviada" y programa el
 * seguimiento. Si el lead no tiene WhatsApp, lanza y no registra nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockFindPropuesta, mockFindConv, mockUpdate, mockInsert, mockExecute,
  mockProgramar, mockOnPropuestaEnviada, mockSendMedia, mockUpload, mockPersist, mockPdf, mockActivarPost,
} = vi.hoisted(() => ({
  mockActivarPost: vi.fn(),
  mockFindPropuesta: vi.fn(),
  mockFindConv: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
  mockExecute: vi.fn(),
  mockProgramar: vi.fn(),
  mockOnPropuestaEnviada: vi.fn(),
  mockSendMedia: vi.fn(),
  mockUpload: vi.fn(),
  mockPersist: vi.fn(),
  mockPdf: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    query: {
      propuestas: { findFirst: mockFindPropuesta },
      conversations: { findFirst: mockFindConv },
    },
    update: mockUpdate,
    insert: mockInsert,
    execute: mockExecute,
  },
}))
vi.mock('@/lib/pdf/propuesta.service', () => ({ generarPropuestaPdf: mockPdf }))
vi.mock('@/lib/pdf/propuesta.template', () => ({
  formatNumeroPropuesta: (n: number) => `PROP-${String(n).padStart(5, '0')}`,
}))
vi.mock('@/lib/whatsapp/client', () => ({ uploadMediaToMeta: mockUpload, sendMediaMessage: mockSendMedia }))
vi.mock('@/lib/whatsapp/media', () => ({ persistOutboundMedia: mockPersist }))
vi.mock('@/lib/followup/engine', () => ({ programarSeguimientoPropuesta: mockProgramar }))
vi.mock('@/lib/leads/propuesta-enviada', () => ({ onPropuestaEnviada: mockOnPropuestaEnviada }))
vi.mock('@/lib/claude/bot-post-propuesta', () => ({ activarModoPostPropuesta: mockActivarPost }))

import { enviarPropuestaDesdeBot } from '@/lib/cotizador/enviar-propuesta.service'

const PROP_ID = '5a1b2c3d-0000-4000-8000-000000000051'

beforeEach(() => {
  vi.clearAllMocks()
  mockFindPropuesta.mockResolvedValue({ id: PROP_ID, leadId: 'lead-1', numero: 51, estado: 'borrador' })
  mockFindConv.mockResolvedValue({ id: 'conv-1', waContactPhone: '+5491100000000' })
  mockPdf.mockResolvedValue({ buffer: Buffer.from('pdf'), filename: 'PROP-00051.pdf', numero: 51 })
  mockInsert.mockReturnValue({
    values: vi.fn((v: unknown) => {
      const c = { returning: vi.fn().mockResolvedValue([{ id: 'msg-1', ...(v as object) }]) }
      return Object.assign(Promise.resolve(undefined), c)
    }),
  })
  mockUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) })
  mockExecute.mockResolvedValue(undefined)
  mockUpload.mockResolvedValue('meta-media-1')
  mockSendMedia.mockResolvedValue('wamid.doc')
  mockPersist.mockResolvedValue(undefined)
  mockOnPropuestaEnviada.mockResolvedValue({ etapaMovida: true, stageId: 'st-prop' })
  mockProgramar.mockResolvedValue(undefined)
})

describe('enviarPropuestaDesdeBot', () => {
  it('manda el PDF como documento del bot, marca enviada a nombre del vendedor, mueve de etapa y programa seguimiento', async () => {
    const r = await enviarPropuestaDesdeBot(PROP_ID, 'user-9')

    expect(r).toEqual({ etapaMovida: true })
    expect(mockPdf).toHaveBeenCalledWith(PROP_ID)
    expect(mockSendMedia).toHaveBeenCalledWith('+5491100000000', 'meta-media-1', 'document', 'Propuesta PROP-00051')

    // Un solo objeto de cadena para todos los insert: las llamadas a values() quedan en orden
    const valuesMock = (mockInsert.mock.results[0]!.value as { values: ReturnType<typeof vi.fn> }).values
    const [mensaje, actividad] = valuesMock.mock.calls.map((c) => c[0] as Record<string, unknown>)
    expect(mensaje).toMatchObject({ senderType: 'bot', senderId: null, contentType: 'document', body: 'Propuesta PROP-00051' })
    expect(actividad).toMatchObject({ action: 'propuesta_enviada', userId: 'user-9', metadata: { propuestaId: PROP_ID, numero: 51, via: 'whatsapp' } })

    expect(mockOnPropuestaEnviada).toHaveBeenCalledWith('lead-1', 'user-9', PROP_ID)
    expect(mockProgramar).toHaveBeenCalledWith('lead-1')
    // El bot sigue la charla después de la propuesta
    expect(mockActivarPost).toHaveBeenCalledWith('lead-1')
  })

  it('sin conversación de WhatsApp lanza y no marca nada como enviado', async () => {
    mockFindConv.mockResolvedValue(null)

    await expect(enviarPropuestaDesdeBot(PROP_ID, 'user-9')).rejects.toThrow('no tiene conversación de WhatsApp')

    expect(mockSendMedia).not.toHaveBeenCalled()
    expect(mockOnPropuestaEnviada).not.toHaveBeenCalled()
    expect(mockProgramar).not.toHaveBeenCalled()
    expect(mockActivarPost).not.toHaveBeenCalled()
  })

  it('propuesta inexistente o borrada: 404 sin generar PDF', async () => {
    mockFindPropuesta.mockResolvedValue(null)

    await expect(enviarPropuestaDesdeBot(PROP_ID, 'user-9')).rejects.toThrow()
    expect(mockPdf).not.toHaveBeenCalled()
  })
})
