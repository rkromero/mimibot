/**
 * POST /api/whatsapp/send (multipart) — adjuntar una imagen desde el chat.
 *
 * Bug real: un WebP adjuntado desde el chat llegaba a Meta tal cual y Meta lo
 * rechazaba. Ahora la ruta pasa el archivo por `adaptarImagenParaMeta` y lo
 * que sube es JPG.
 *
 *  1. WebP → a Meta y a R2 va `image/jpeg` con extensión .jpg, y el mensaje se crea como `image`.
 *  2. Conversión imposible → 400 con el mensaje del helper y no se crea el mensaje.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ValidationError } from '@/lib/errors'

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  resolverConv: vi.fn(),
  adaptar: vi.fn(),
  uploadMedia: vi.fn(),
  sendMedia: vi.fn(),
  persist: vi.fn(),
  insertValues: vi.fn(),
  execute: vi.fn().mockResolvedValue(undefined),
  updateWhere: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/whatsapp/apertura', () => ({
  resolverConversacionParaEnvio: m.resolverConv,
  variablesParaChat: vi.fn(),
}))
vi.mock('@/lib/whatsapp/ventana', () => ({ estaDentroDe24h: vi.fn() }))
vi.mock('@/lib/followup/engine', () => ({ esPlantillaUltimoSeguimiento: vi.fn(), enviarUltimoSeguimiento: vi.fn() }))
vi.mock('@/lib/whatsapp/imagen-meta', () => ({ adaptarImagenParaMeta: m.adaptar }))
vi.mock('@/lib/whatsapp/client', () => ({
  sendTextMessage: vi.fn(),
  sendMediaMessage: m.sendMedia,
  uploadMediaToMeta: m.uploadMedia,
  sendTemplateMessage: vi.fn(),
  buildBodyComponents: vi.fn(),
}))
vi.mock('@/lib/whatsapp/media', () => ({ persistOutboundMedia: m.persist }))
vi.mock('@/db', () => ({
  db: {
    query: {},
    insert: () => ({
      values: (v: unknown) => {
        m.insertValues(v)
        return { returning: () => Promise.resolve([{ id: 'msg-1', ...(v as object) }]) }
      },
    }),
    update: () => ({ set: () => ({ where: m.updateWhere }) }),
    execute: m.execute,
  },
}))

import { POST } from '@/app/api/whatsapp/send/route'

const CONV_ID = 'cccccccc-0000-0000-0000-000000000001'
const WEBP = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary')
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])

function reqConArchivo(nombre: string, tipo: string, bytes: Buffer) {
  const fd = new FormData()
  fd.append('file', new Blob([new Uint8Array(bytes)], { type: tipo }), nombre)
  fd.append('conversationId', CONV_ID)
  return new NextRequest('http://localhost/api/whatsapp/send', { method: 'POST', body: fd })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ user: { id: 'u-1', role: 'vendedor', name: 'Toti' } })
  m.resolverConv.mockResolvedValue({ waContactPhone: '5492966412541', contactName: 'Guillermo', productoInteres: null })
  m.persist.mockResolvedValue('wa-media/c/msg-1.jpg')
  m.uploadMedia.mockResolvedValue('meta-media-1')
  m.sendMedia.mockResolvedValue('wamid.X')
})

describe('POST /api/whatsapp/send con imagen adjunta', () => {
  it('1. WebP → sube JPG a Meta y a R2, mensaje tipo image', async () => {
    m.adaptar.mockResolvedValue({ buffer: JPG, mimeType: 'image/jpeg', filename: 'foto.jpg' })

    const res = await POST(reqConArchivo('foto.webp', 'image/webp', WEBP))
    expect(res.status).toBe(201)

    expect(m.adaptar).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/webp', filename: 'foto.webp' }))
    expect(m.uploadMedia).toHaveBeenCalledWith(JPG, 'image/jpeg', 'foto.jpg')
    expect(m.persist).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/jpeg', filename: 'foto.jpg' }))
    expect(m.sendMedia).toHaveBeenCalledWith('5492966412541', 'meta-media-1', 'image')
    expect(m.insertValues).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'image', direction: 'outbound' }))
  })

  it('2. conversión imposible → 400 con mensaje claro y sin mensaje creado', async () => {
    m.adaptar.mockRejectedValue(new ValidationError('WhatsApp no acepta imágenes HEIC y no se pudo convertir. Mandala en JPG o PNG.'))

    const res = await POST(reqConArchivo('foto.heic', 'image/heic', WEBP))
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/HEIC.*JPG o PNG/)

    expect(m.insertValues).not.toHaveBeenCalled()
    expect(m.uploadMedia).not.toHaveBeenCalled()
    expect(m.sendMedia).not.toHaveBeenCalled()
  })
})
