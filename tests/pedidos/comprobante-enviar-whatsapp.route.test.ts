/**
 * POST /api/pedidos/[id]/comprobante/enviar — el comprobante de entrega (foto
 * del remito firmado o firma del cliente) sale como imagen por el WhatsApp
 * embebido a la conversación del cliente.
 *
 * Cobertura:
 *  1. 401 sin sesión
 *  2. pedido inexistente → 404
 *  3. pedido cancelado → 400
 *  4. sin acceso al cliente → 403
 *  5. pedido sin comprobante (expreso sin foto / retiro en fábrica) → 400, no toca R2 ni el chat
 *  6. ventana de 24 hs cerrada → 422 WINDOW_CLOSED con mensaje de comprobante, no baja nada de R2
 *  7. expreso → baja remitoFotoUrl, mensaje 'image' con caption "Comprobante de entrega - Pedido #…",
 *     imagen a R2 y a Meta, envío con caption, waMessageId guardado
 *  8. reparto propio → usa firmaUrl; la firma guardada como PNG con bytes JPEG se manda como JPEG
 *  9. Meta rechaza → 502 y el mensaje queda marcado como fallido
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  pedidoFindFirst: vi.fn(),
  convFindFirst: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
  canAccess: vi.fn(),
  ensureConv: vi.fn(),
  dentro24h: vi.fn(),
  getObject: vi.fn(),
  upload: vi.fn(),
  sendMedia: vi.fn(),
  persist: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: { findFirst: m.pedidoFindFirst },
      conversations: { findFirst: m.convFindFirst },
    },
    insert: m.insert,
    update: m.update,
    execute: m.execute,
  },
}))
vi.mock('@/lib/authz/clientes', () => ({ canAccessCliente: m.canAccess }))
vi.mock('@/lib/inbox/ensure-conversacion', () => ({ ensureConversacionParaCliente: m.ensureConv }))
vi.mock('@/lib/whatsapp/ventana', () => ({ estaDentroDe24h: m.dentro24h }))
vi.mock('@/lib/r2/get-object', () => ({ getObjectBuffer: m.getObject }))
vi.mock('@/lib/whatsapp/client', () => ({ uploadMediaToMeta: m.upload, sendMediaMessage: m.sendMedia }))
vi.mock('@/lib/whatsapp/media', () => ({ persistOutboundMedia: m.persist }))

import { POST } from '@/app/api/pedidos/[id]/comprobante/enviar/route'
import { AuthzError } from '@/lib/errors'

const PEDIDO_ID = '550e8400-e29b-41d4-a716-4466554400ab'
const CLIENTE_ID = '550e8400-e29b-41d4-a716-446655440001'
const CONV_ID = '550e8400-e29b-41d4-a716-446655440002'
const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const PHONE = '5491155551234'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

type Row = Record<string, unknown>
let inserted: Row[] = []
let updates: Row[] = []

const req = () => new NextRequest(`http://localhost/api/pedidos/${PEDIDO_ID}/comprobante/enviar`, { method: 'POST' })
const ctx = { params: Promise.resolve({ id: PEDIDO_ID }) }

const pedidoExpreso = {
  id: PEDIDO_ID,
  clienteId: CLIENTE_ID,
  estado: 'entregado',
  metodoEntrega: 'expreso',
  esReparto: false,
  firmaUrl: null,
  remitoFotoUrl: 'remitos/123-abc.jpg',
}
const pedidoReparto = {
  ...pedidoExpreso,
  metodoEntrega: null,
  esReparto: true,
  firmaUrl: '/firmas/999-xyz.png',
  remitoFotoUrl: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  inserted = []
  updates = []

  m.auth.mockResolvedValue({ user: { id: USER_ID, role: 'agent' } })
  m.pedidoFindFirst.mockResolvedValue(pedidoExpreso)
  m.canAccess.mockResolvedValue(undefined)
  m.ensureConv.mockResolvedValue({ conversationId: CONV_ID, clienteId: CLIENTE_ID })
  m.convFindFirst.mockResolvedValue({ id: CONV_ID, waContactPhone: PHONE })
  m.dentro24h.mockResolvedValue(true)
  m.getObject.mockResolvedValue({ buffer: JPEG, contentType: 'image/jpeg' })
  m.persist.mockResolvedValue('wa-media/conv/msg.jpg')
  m.upload.mockResolvedValue('meta-media-1')
  m.sendMedia.mockResolvedValue('wamid.OK')
  m.execute.mockResolvedValue(undefined)

  m.insert.mockImplementation(() => ({
    values: (v: Row) => ({
      returning: async () => {
        inserted.push(v)
        return [{ id: `msg-${inserted.length}`, ...v }]
      },
    }),
  }))
  m.update.mockImplementation(() => ({
    set: (v: Row) => ({ where: async () => { updates.push(v) } }),
  }))
})

describe('POST /api/pedidos/[id]/comprobante/enviar', () => {
  it('1. 401 sin sesión', async () => {
    m.auth.mockResolvedValueOnce(null)
    const res = await POST(req(), ctx)
    expect(res.status).toBe(401)
    expect(m.getObject).not.toHaveBeenCalled()
  })

  it('2. pedido inexistente → 404', async () => {
    m.pedidoFindFirst.mockResolvedValueOnce(undefined)
    const res = await POST(req(), ctx)
    expect(res.status).toBe(404)
  })

  it('3. pedido cancelado → 400', async () => {
    m.pedidoFindFirst.mockResolvedValueOnce({ ...pedidoExpreso, estado: 'cancelado' })
    const res = await POST(req(), ctx)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/cancelado/)
    expect(m.getObject).not.toHaveBeenCalled()
  })

  it('4. sin acceso al cliente → 403', async () => {
    m.canAccess.mockRejectedValueOnce(new AuthzError('No tenés acceso a este cliente'))
    const res = await POST(req(), ctx)
    expect(res.status).toBe(403)
    expect(m.ensureConv).not.toHaveBeenCalled()
  })

  it.each([
    ['expreso sin foto', { ...pedidoExpreso, remitoFotoUrl: null }],
    ['retiro en fábrica', { ...pedidoExpreso, metodoEntrega: 'retiro_fabrica', remitoFotoUrl: null }],
    ['reparto sin firma', { ...pedidoReparto, firmaUrl: null }],
  ])('5. sin comprobante (%s) → 400 y no toca R2 ni el chat', async (_n, pedido) => {
    m.pedidoFindFirst.mockResolvedValueOnce(pedido)
    const res = await POST(req(), ctx)
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/no tiene comprobante/)
    expect(m.ensureConv).not.toHaveBeenCalled()
    expect(m.getObject).not.toHaveBeenCalled()
    expect(m.insert).not.toHaveBeenCalled()
  })

  it('6. ventana cerrada → 422 WINDOW_CLOSED con mensaje de comprobante, no baja nada de R2', async () => {
    m.dentro24h.mockResolvedValueOnce(false)
    const res = await POST(req(), ctx)
    expect(res.status).toBe(422)
    const json = await res.json() as { error: string; code?: string }
    expect(json.code).toBe('WINDOW_CLOSED')
    expect(json.error).toMatch(/24 hs/)
    expect(json.error).toMatch(/enviá el comprobante/)
    expect(m.getObject).not.toHaveBeenCalled()
    expect(m.insert).not.toHaveBeenCalled()
  })

  it('7. expreso → foto del remito como imagen al chat del cliente', async () => {
    const res = await POST(req(), ctx)
    expect(res.status).toBe(200)
    const json = await res.json() as { data: Record<string, unknown> }
    expect(json.data).toMatchObject({
      via: 'whatsapp',
      conversationId: CONV_ID,
      messageId: 'msg-1',
      waMessageId: 'wamid.OK',
      tipo: 'remito',
    })

    expect(m.getObject).toHaveBeenCalledWith('remitos/123-abc.jpg')

    const caption = 'Comprobante de entrega - Pedido #554400AB (remito firmado)'
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      conversationId: CONV_ID,
      direction: 'outbound',
      senderType: 'agent',
      senderId: USER_ID,
      contentType: 'image',
      body: caption,
      isRead: true,
    })

    expect(m.persist).toHaveBeenCalledWith(expect.objectContaining({
      buffer: JPEG,
      messageId: 'msg-1',
      conversationId: CONV_ID,
      mimeType: 'image/jpeg',
      filename: 'comprobante-entrega-554400AB.jpg',
    }))
    expect(m.upload).toHaveBeenCalledWith(JPEG, 'image/jpeg', 'comprobante-entrega-554400AB.jpg')
    expect(m.sendMedia).toHaveBeenCalledWith(PHONE, 'meta-media-1', 'image', caption)
    expect(updates).toContainEqual({ waMessageId: 'wamid.OK' })
    expect(m.execute).toHaveBeenCalled()
  })

  it('8. reparto propio → usa la firma; PNG con bytes JPEG se manda como JPEG y la key se sanea', async () => {
    m.pedidoFindFirst.mockResolvedValueOnce(pedidoReparto)
    m.getObject.mockResolvedValueOnce({ buffer: JPEG, contentType: 'image/png' })

    const res = await POST(req(), ctx)
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { tipo: string } }
    expect(json.data.tipo).toBe('firma')

    expect(m.getObject).toHaveBeenCalledWith('firmas/999-xyz.png')
    expect(m.upload).toHaveBeenCalledWith(JPEG, 'image/jpeg', 'comprobante-entrega-554400AB.png')
    expect(m.sendMedia).toHaveBeenCalledWith(PHONE, 'meta-media-1', 'image', expect.stringMatching(/firma del cliente/))
  })

  it('8b. firma PNG de verdad se manda como PNG sin recodificar', async () => {
    m.pedidoFindFirst.mockResolvedValueOnce(pedidoReparto)
    m.getObject.mockResolvedValueOnce({ buffer: PNG, contentType: 'image/png' })

    const res = await POST(req(), ctx)
    expect(res.status).toBe(200)
    expect(m.upload).toHaveBeenCalledWith(PNG, 'image/png', 'comprobante-entrega-554400AB.png')
  })

  it('9. Meta rechaza → 502 y el mensaje queda como fallido', async () => {
    m.sendMedia.mockRejectedValueOnce(new Error('(#131030) Recipient not in allowed list'))
    const res = await POST(req(), ctx)
    expect(res.status).toBe(502)
    const json = await res.json() as { error: string; code?: string }
    expect(json.code).toBe('WA_SEND_FAILED')
    expect(json.error).toMatch(/131030/)
    expect(updates).toContainEqual(expect.objectContaining({ waStatus: 'failed', waError: expect.stringContaining('131030') }))
    expect(updates).not.toContainEqual({ waMessageId: 'wamid.OK' })
  })
})
