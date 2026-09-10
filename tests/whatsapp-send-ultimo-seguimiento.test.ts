/**
 * POST /api/whatsapp/send — plantilla de último seguimiento elegida desde el
 * selector del chat (ventana cerrada).
 *
 * Bug real: un vendedor mandó `ultimo_seguimiento` desde el chat en vez del
 * botón del panel y el lead quedó sin plazo de cierre. Ahora, si la plantilla
 * elegida es la configurada como último seguimiento y la conversación es de
 * un lead, se delega en el motor (manda + nota + cierre programado).
 *
 *  1. Plantilla de último seguimiento + conversación de lead → motor, no envío suelto.
 *  2. Otra plantilla → envío suelto de siempre, el motor no se toca.
 *  3. Último seguimiento pero conversación de cliente (sin lead) → envío suelto.
 *  4. El motor dice que no se puede (lead cerrado / ya esperando) → error, no se manda nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ValidationError } from '@/lib/errors'

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  resolverConv: vi.fn(),
  dentro24h: vi.fn(),
  findTemplate: vi.fn(),
  findConversation: vi.fn(),
  findConfig: vi.fn(),
  esUltimo: vi.fn(),
  enviarUltimo: vi.fn(),
  sendTemplate: vi.fn(),
  insertValues: vi.fn(),
  execute: vi.fn().mockResolvedValue(undefined),
  updateWhere: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/whatsapp/apertura', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/whatsapp/apertura')>()
  return { ...real, resolverConversacionParaEnvio: m.resolverConv }
})
vi.mock('@/lib/whatsapp/ventana', () => ({ estaDentroDe24h: m.dentro24h }))
vi.mock('@/lib/followup/engine', () => ({
  esPlantillaUltimoSeguimiento: m.esUltimo,
  enviarUltimoSeguimiento: m.enviarUltimo,
}))
vi.mock('@/lib/whatsapp/client', () => ({
  sendTextMessage: vi.fn(),
  sendMediaMessage: vi.fn(),
  uploadMediaToMeta: vi.fn(),
  sendTemplateMessage: m.sendTemplate,
  buildBodyComponents: (values: string[]) => (values.length ? [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }] : undefined),
}))
vi.mock('@/lib/whatsapp/media', () => ({ persistOutboundMedia: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    query: {
      whatsappTemplates: { findFirst: m.findTemplate },
      conversations: { findFirst: m.findConversation },
      whatsappConfig: { findFirst: m.findConfig },
    },
    insert: () => ({
      values: (v: unknown) => {
        m.insertValues(v)
        return { returning: () => Promise.resolve([{ id: 'msg-1', body: (v as { body: string }).body }]) }
      },
    }),
    update: () => ({ set: () => ({ where: m.updateWhere }) }),
    execute: m.execute,
  },
}))

import { POST } from '@/app/api/whatsapp/send/route'

const CONV_ID = 'cccccccc-0000-0000-0000-000000000001'
const LEAD_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const CIERRA = new Date('2026-09-11T16:00:00.000Z')

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: CONV_ID, ...body }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ user: { id: 'u-1', role: 'vendedor', name: 'Toti' } })
  m.resolverConv.mockResolvedValue({ waContactPhone: '5492966412541', contactName: 'Guillermo', productoInteres: null })
  m.dentro24h.mockResolvedValue(false)
  m.findTemplate.mockResolvedValue({ bodyText: 'Hola {{1}}, último intento.', variables: [] })
  m.findConversation.mockResolvedValue({ leadId: LEAD_ID })
  m.esUltimo.mockImplementation(async (name: string) => name === 'ultimo_seguimiento')
  m.enviarUltimo.mockResolvedValue({ body: 'Hola Guillermo, último intento.', cierraEl: CIERRA })
  m.sendTemplate.mockResolvedValue('wamid.X')
})

describe('POST /api/whatsapp/send con plantilla de último seguimiento', () => {
  it('lead + plantilla de último seguimiento → delega en el motor y devuelve cuándo cierra', async () => {
    const res = await POST(req({ templateName: 'ultimo_seguimiento', templateLang: 'es' }))
    expect(res.status).toBe(201)
    const json = await res.json() as { sentAsTemplate: boolean; ultimoSeguimiento: boolean; data: { cierraEl: string } }
    expect(json.ultimoSeguimiento).toBe(true)
    expect(json.sentAsTemplate).toBe(true)
    expect(json.data.cierraEl).toBe(CIERRA.toISOString())
    expect(m.enviarUltimo).toHaveBeenCalledWith(LEAD_ID, { id: 'u-1', name: 'Toti' })
    // El envío suelto no corre: ni mensaje propio ni sendTemplateMessage
    expect(m.sendTemplate).not.toHaveBeenCalled()
    expect(m.insertValues).not.toHaveBeenCalled()
  })

  it('otra plantilla → envío suelto de siempre, el motor no se toca', async () => {
    const res = await POST(req({ templateName: 'apertura_lead', templateLang: 'es' }))
    expect(res.status).toBe(201)
    const json = await res.json() as { sentAsTemplate: boolean; ultimoSeguimiento?: boolean }
    expect(json.sentAsTemplate).toBe(true)
    expect(json.ultimoSeguimiento).toBeUndefined()
    expect(m.enviarUltimo).not.toHaveBeenCalled()
    expect(m.sendTemplate).toHaveBeenCalledWith('5492966412541', 'apertura_lead', 'es', expect.anything())
  })

  it('último seguimiento a una conversación de cliente (sin lead) → envío suelto', async () => {
    m.findConversation.mockResolvedValue({ leadId: null })
    const res = await POST(req({ templateName: 'ultimo_seguimiento', templateLang: 'es' }))
    expect(res.status).toBe(201)
    expect(m.enviarUltimo).not.toHaveBeenCalled()
    expect(m.sendTemplate).toHaveBeenCalledTimes(1)
  })

  it('el motor dice que no se puede → error y no se manda nada', async () => {
    m.enviarUltimo.mockRejectedValue(new ValidationError('Ya se mandó el último seguimiento y está esperando respuesta'))
    const res = await POST(req({ templateName: 'ultimo_seguimiento', templateLang: 'es' }))
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/Ya se mandó/)
    expect(m.sendTemplate).not.toHaveBeenCalled()
    expect(m.insertValues).not.toHaveBeenCalled()
  })

  it('el idioma también cuenta: mismo nombre en otro idioma no es la de último seguimiento', async () => {
    m.esUltimo.mockImplementation(async (name: string, lang: string) => name === 'ultimo_seguimiento' && lang === 'es')
    const res = await POST(req({ templateName: 'ultimo_seguimiento', templateLang: 'es_AR' }))
    expect(res.status).toBe(201)
    expect(m.enviarUltimo).not.toHaveBeenCalled()
  })
})
