/**
 * POST /api/pedidos/[id]/documentos/enviar — la proforma sale como documento
 * por el WhatsApp embebido a la conversación del cliente.
 *
 * Cobertura:
 *  1. 401 sin sesión
 *  2. tipo/via inválidos → 400, no emite nada
 *  3. pedido cancelado → 400
 *  4. sin acceso al cliente → 403
 *  5. cliente sin teléfono → 400 y no gasta número de proforma
 *  6. ventana de 24 hs cerrada → 422 WINDOW_CLOSED y no gasta número
 *  7. caso normal → mensaje 'document' con caption "Proforma 000141", PDF a R2
 *     y a Meta, envío con caption, waMessageId guardado, respuesta con número
 *  8. Meta rechaza → 502, el mensaje queda marcado como fallido en el chat
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockAuthFn, mockPedidoFindFirst, mockConvFindFirst, mockInsert, mockUpdate, mockExecute,
  mockCanAccess, mockEnsureConv, mockDentro24h, mockEmitir, mockUpload, mockSendMedia, mockPersist,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockPedidoFindFirst: vi.fn(),
  mockConvFindFirst: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockExecute: vi.fn(),
  mockCanAccess: vi.fn(),
  mockEnsureConv: vi.fn(),
  mockDentro24h: vi.fn(),
  mockEmitir: vi.fn(),
  mockUpload: vi.fn(),
  mockSendMedia: vi.fn(),
  mockPersist: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: { findFirst: mockPedidoFindFirst },
      conversations: { findFirst: mockConvFindFirst },
    },
    insert: mockInsert,
    update: mockUpdate,
    execute: mockExecute,
  },
}))
vi.mock('@/lib/authz/clientes', () => ({ canAccessCliente: mockCanAccess }))
vi.mock('@/lib/inbox/ensure-conversacion', () => ({ ensureConversacionParaCliente: mockEnsureConv }))
vi.mock('@/lib/whatsapp/ventana', () => ({ estaDentroDe24h: mockDentro24h }))
vi.mock('@/lib/pdf/pdf.service', () => ({ emitirDocumento: mockEmitir }))
vi.mock('@/lib/whatsapp/client', () => ({ uploadMediaToMeta: mockUpload, sendMediaMessage: mockSendMedia }))
vi.mock('@/lib/whatsapp/media', () => ({ persistOutboundMedia: mockPersist }))

import { POST } from '@/app/api/pedidos/[id]/documentos/enviar/route'
import { AuthzError, ValidationError } from '@/lib/errors'

const PEDIDO_ID = '550e8400-e29b-41d4-a716-446655440000'
const CLIENTE_ID = '550e8400-e29b-41d4-a716-446655440001'
const CONV_ID = '550e8400-e29b-41d4-a716-446655440002'
const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const PHONE = '5491155551234'

type Row = Record<string, unknown>

let inserted: Row[] = []
let updates: Row[] = []

function makeReq(body: unknown) {
  return new NextRequest(`http://localhost/api/pedidos/${PEDIDO_ID}/documentos/enviar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ctx = { params: Promise.resolve({ id: PEDIDO_ID }) }
const bodyOk = { tipo: 'proforma', via: 'whatsapp' }

beforeEach(() => {
  vi.clearAllMocks()
  inserted = []
  updates = []

  mockAuthFn.mockResolvedValue({ user: { id: USER_ID, role: 'agent' } })
  mockPedidoFindFirst.mockResolvedValue({ id: PEDIDO_ID, clienteId: CLIENTE_ID, estado: 'pendiente' })
  mockCanAccess.mockResolvedValue(undefined)
  mockEnsureConv.mockResolvedValue({ conversationId: CONV_ID, clienteId: CLIENTE_ID })
  mockConvFindFirst.mockResolvedValue({ id: CONV_ID, waContactPhone: PHONE })
  mockDentro24h.mockResolvedValue(true)
  mockEmitir.mockResolvedValue({
    buffer: Buffer.from('%PDF-fake'),
    numero: 141,
    nombreArchivo: 'Juan Perez - Proforma 000141.pdf',
  })
  mockPersist.mockResolvedValue('wa-media/conv/msg.pdf')
  mockUpload.mockResolvedValue('meta-media-1')
  mockSendMedia.mockResolvedValue('wamid.OK')
  mockExecute.mockResolvedValue(undefined)

  mockInsert.mockImplementation(() => ({
    values: (v: Row) => ({
      returning: async () => {
        inserted.push(v)
        return [{ id: `msg-${inserted.length}`, ...v }]
      },
    }),
  }))
  mockUpdate.mockImplementation(() => ({
    set: (v: Row) => ({
      where: async () => {
        updates.push(v)
      },
    }),
  }))
})

describe('POST /api/pedidos/[id]/documentos/enviar', () => {
  it('401 sin sesión', async () => {
    mockAuthFn.mockResolvedValueOnce(null)
    const res = await POST(makeReq(bodyOk), ctx)
    expect(res.status).toBe(401)
    expect(mockEmitir).not.toHaveBeenCalled()
  })

  it.each([
    [{ tipo: 'remito', via: 'whatsapp' }],
    [{ tipo: 'proforma', via: 'email' }],
    [{}],
  ])('body inválido %j → 400 sin emitir nada', async (body) => {
    const res = await POST(makeReq(body), ctx)
    expect(res.status).toBe(400)
    expect(mockEmitir).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('pedido cancelado → 400', async () => {
    mockPedidoFindFirst.mockResolvedValueOnce({ id: PEDIDO_ID, clienteId: CLIENTE_ID, estado: 'cancelado' })
    const res = await POST(makeReq(bodyOk), ctx)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/cancelado/)
    expect(mockEmitir).not.toHaveBeenCalled()
  })

  it('sin acceso al cliente → 403', async () => {
    mockCanAccess.mockRejectedValueOnce(new AuthzError('No tenés acceso a este cliente'))
    const res = await POST(makeReq(bodyOk), ctx)
    expect(res.status).toBe(403)
    expect(mockEnsureConv).not.toHaveBeenCalled()
    expect(mockEmitir).not.toHaveBeenCalled()
  })

  it('cliente sin teléfono → 400 y no gasta número de proforma', async () => {
    mockEnsureConv.mockRejectedValueOnce(new ValidationError('El cliente no tiene teléfono cargado'))
    const res = await POST(makeReq(bodyOk), ctx)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/teléfono/)
    expect(mockEmitir).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('ventana de 24 hs cerrada → 422 WINDOW_CLOSED y no gasta número de proforma', async () => {
    mockDentro24h.mockResolvedValueOnce(false)
    const res = await POST(makeReq(bodyOk), ctx)
    expect(res.status).toBe(422)
    const json = await res.json() as { error: string; code?: string }
    expect(json.code).toBe('WINDOW_CLOSED')
    expect(json.error).toMatch(/24 hs/)
    expect(mockEmitir).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockSendMedia).not.toHaveBeenCalled()
  })

  it('caso normal → documento en el chat del cliente con caption "Proforma 000141"', async () => {
    const res = await POST(makeReq(bodyOk), ctx)
    expect(res.status).toBe(200)

    const json = await res.json() as { data: Record<string, unknown> }
    expect(json.data).toMatchObject({
      via: 'whatsapp',
      conversationId: CONV_ID,
      messageId: 'msg-1',
      waMessageId: 'wamid.OK',
      numero: 141,
      nombreArchivo: 'Juan Perez - Proforma 000141.pdf',
    })

    // Se emite la proforma a nombre del usuario logueado (número correlativo + registro)
    expect(mockEmitir).toHaveBeenCalledWith(PEDIDO_ID, 'proforma', USER_ID)

    // Fila del mensaje: saliente, del agente, tipo documento, con el caption
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      conversationId: CONV_ID,
      direction: 'outbound',
      senderType: 'agent',
      senderId: USER_ID,
      contentType: 'document',
      body: 'Proforma 000141',
      isRead: true,
    })

    // Copia en R2 y upload a Meta con el nombre de archivo del PDF
    expect(mockPersist).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'msg-1',
      conversationId: CONV_ID,
      mimeType: 'application/pdf',
      filename: 'Juan Perez - Proforma 000141.pdf',
    }))
    expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf', 'Juan Perez - Proforma 000141.pdf')

    // Envío como documento al teléfono de la conversación, con caption
    expect(mockSendMedia).toHaveBeenCalledWith(PHONE, 'meta-media-1', 'document', 'Proforma 000141')

    // Guarda el id de Meta (tildes del chat) y actualiza la conversación
    expect(updates).toContainEqual({ waMessageId: 'wamid.OK' })
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('Meta rechaza el envío → 502 y el mensaje queda marcado como fallido', async () => {
    mockSendMedia.mockRejectedValueOnce(new Error('WhatsApp API error 400: (#131047) Re-engagement message'))
    const res = await POST(makeReq(bodyOk), ctx)
    expect(res.status).toBe(502)

    const json = await res.json() as { error: string; code?: string }
    expect(json.code).toBe('WA_SEND_FAILED')
    expect(json.error).toMatch(/No se pudo enviar por WhatsApp/)
    expect(json.error).toMatch(/131047/)

    const fallido = updates.find((u) => u['waStatus'] === 'failed')
    expect(fallido).toBeDefined()
    expect(fallido?.['waError']).toMatch(/131047/)
    expect(updates.some((u) => 'waMessageId' in u)).toBe(false)
    expect(mockExecute).not.toHaveBeenCalled()
  })
})
