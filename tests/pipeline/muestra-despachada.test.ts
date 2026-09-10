/**
 * Aviso "salió tu muestra" (lib/leads/muestra-despachada.ts): plantilla con la
 * foto de la guía en el encabezado.
 *
 *  prepararAvisoMuestra
 *   1. Muestra sin entregar / ya avisada / sin pedido → no disponible, con motivo.
 *   2. Retiro en fábrica o sin foto → no hay guía para mandar.
 *   3. Sin plantilla configurada, sin aprobar o sin encabezado de imagen → motivo claro.
 *   4. Foto PDF con plantilla de imagen → no coincide.
 *   5. Caso feliz → texto resuelto (nombre, expreso, nº de pedido), JPEG detectado por bytes.
 *  enviarAvisoMuestra
 *   6. Sube la foto a Meta, manda la plantilla con encabezado imagen + variables,
 *      deja el mensaje con adjunto en el chat y marca el lead como avisado.
 *  marcarMuestraAvisadaSinEnviar
 *   7. No toca WhatsApp; marca, deja nota y avisa por realtime.
 *  listarMuestrasPendientesAviso
 *   8. Roles sin leads no consultan nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  findLead: vi.fn(),
  findPedido: vi.fn(),
  findConfig: vi.fn(),
  findTemplate: vi.fn(),
  findConversation: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn().mockResolvedValue(undefined),
  insertValues: vi.fn(),
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn(),
  ensureConv: vi.fn(),
  publish: vi.fn().mockResolvedValue(undefined),
  getObject: vi.fn(),
  uploadMedia: vi.fn(),
  sendTemplate: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    query: {
      leads: { findFirst: m.findLead },
      pedidos: { findFirst: m.findPedido },
      whatsappConfig: { findFirst: m.findConfig },
      whatsappTemplates: { findFirst: m.findTemplate },
      conversations: { findFirst: m.findConversation },
    },
    update: () => ({
      set: (values: unknown) => {
        m.updateSet(values)
        return { where: m.updateWhere }
      },
    }),
    insert: () => ({
      values: (v: unknown) => {
        m.insertValues(v)
        return Object.assign(Promise.resolve(undefined), {
          returning: () => Promise.resolve([{ id: 'msg-1' }]),
        })
      },
    }),
    execute: m.execute,
    select: m.select,
  },
}))
vi.mock('@/lib/inbox/ensure-conversacion', () => ({ ensureConversacionParaCliente: m.ensureConv }))
vi.mock('@/lib/realtime/broker', () => ({ publishCrmEvent: m.publish }))
vi.mock('@/lib/r2/get-object', () => ({ getObjectBuffer: m.getObject }))
vi.mock('@/lib/whatsapp/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/whatsapp/client')>()
  return {
    ...real,
    uploadMediaToMeta: m.uploadMedia,
    sendTemplateMessage: m.sendTemplate,
  }
})

import {
  prepararAvisoMuestra,
  enviarAvisoMuestra,
  marcarMuestraAvisadaSinEnviar,
  listarMuestrasPendientesAviso,
  variablesAvisoMuestra,
} from '@/lib/leads/muestra-despachada'

const ENTREGADA = new Date('2026-09-08T14:00:00.000Z')
const LEAD = {
  id: 'lead-1',
  contactId: 'c-1',
  assignedTo: 'agente-1',
  productInterest: 'Alfajores',
  muestraEntregadaAt: ENTREGADA,
  muestraAvisadaAt: null,
  contact: { name: 'Juan Pérez' },
  assignedUser: { name: 'Nicolás Gómez' },
}
const PEDIDO = {
  id: 'aaaaaaaa-0000-0000-0000-0000abcd1234',
  clienteId: 'cli-1',
  remitoFotoUrl: 'firmas/123-abc.png',
  expresoNombre: 'Vía Cargo',
  metodoEntrega: 'expreso',
  entregadoAt: ENTREGADA,
}
const TEMPLATE = {
  bodyText: 'Hola {{1}}, tu muestra ya salió por {{2}}. Te adjuntamos la guía del pedido {{3}}.',
  variables: [
    { index: 1, source: 'cliente_nombre', sample: 'Cliente' },
    { index: 2, source: 'pedido_expreso', sample: 'el expreso' },
    { index: 3, source: 'pedido_numero', sample: '00000000' },
  ],
  headerFormat: 'IMAGE',
}
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x10, 0x4a, 0x46, 0x49, 0x46])
const PDF = Buffer.from('%PDF-1.4 hola', 'binary')

beforeEach(() => {
  vi.clearAllMocks()
  m.findLead.mockResolvedValue(LEAD)
  m.findPedido.mockResolvedValue(PEDIDO)
  m.findConfig.mockResolvedValue({ muestraTemplateName: 'muestra_despachada', muestraTemplateLang: 'es' })
  m.findTemplate.mockResolvedValue(TEMPLATE)
  m.findConversation.mockResolvedValue({ waContactPhone: '5491155550000' })
  m.ensureConv.mockResolvedValue({ conversationId: 'conv-1', clienteId: 'cli-1' })
  m.getObject.mockResolvedValue({ buffer: JPEG, contentType: 'image/png' })
  m.uploadMedia.mockResolvedValue('media-777')
  m.sendTemplate.mockResolvedValue('wamid.ABC')
})

describe('variablesAvisoMuestra', () => {
  it('usa las configuradas en la plantilla si las hay', () => {
    expect(variablesAvisoMuestra('Hola {{1}}', [{ index: 1, source: 'cliente_nombre_completo', sample: 'X' }]))
      .toEqual([{ index: 1, source: 'cliente_nombre_completo', sample: 'X' }])
  })

  it('plantilla importada de Meta sin variables: por posición, solo las que aparecen en el texto', () => {
    expect(variablesAvisoMuestra('Hola {{1}}, salió por {{2}}. Pedido {{3}}.', [])).toEqual([
      { index: 1, source: 'cliente_nombre', sample: 'Cliente' },
      { index: 2, source: 'pedido_expreso', sample: 'el expreso' },
      { index: 3, source: 'pedido_numero', sample: '00000000' },
    ])
    expect(variablesAvisoMuestra('Sin variables', null)).toEqual([])
  })

  it('plantilla importada: el texto se resuelve con nombre, expreso y nº de pedido', async () => {
    m.findTemplate.mockResolvedValue({ bodyText: 'Hola {{1}}, tu muestra salió por {{2}} (pedido {{3}}). Saludos, {{4}}.', variables: [], headerFormat: 'IMAGE' })
    const r = await prepararAvisoMuestra('lead-1', 'Admin')
    expect(r.ok && r.body).toBe('Hola Juan, tu muestra salió por Vía Cargo (pedido ABCD1234). Saludos, Nicolás Gómez.')
  })
})

describe('prepararAvisoMuestra', () => {
  it('muestra sin entregar → no disponible', async () => {
    m.findLead.mockResolvedValue({ ...LEAD, muestraEntregadaAt: null })
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/todavía no se marcó como entregada/)
    expect(m.findPedido).not.toHaveBeenCalled()
  })

  it('ya avisada → dice cuándo y devuelve avisadaAt', async () => {
    const avisada = new Date('2026-09-09T10:00:00.000Z')
    m.findLead.mockResolvedValue({ ...LEAD, muestraAvisadaAt: avisada })
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    expect(r.avisadaAt).toEqual(avisada)
    expect(r.pedidoId).toBe(PEDIDO.id)
    if (!r.ok) expect(r.motivo).toMatch(/Ya se avisó el 09\/09\/2026/)
  })

  it('ya avisada pero con reenviar → arma la vista previa igual', async () => {
    const avisada = new Date('2026-09-09T10:00:00.000Z')
    m.findLead.mockResolvedValue({ ...LEAD, muestraAvisadaAt: avisada })
    const r = await prepararAvisoMuestra('lead-1', null, { reenviar: true })
    expect(r.ok).toBe(true)
    expect(r.avisadaAt).toEqual(avisada)
  })

  it('sin pedido de muestra entregado → no disponible', async () => {
    m.findPedido.mockResolvedValue(undefined)
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/No encontré el pedido/)
  })

  it('retiro en fábrica (sin foto) → no hay guía para mandar', async () => {
    m.findPedido.mockResolvedValue({ ...PEDIDO, remitoFotoUrl: null, metodoEntrega: 'retiro_fabrica' })
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/retiró en fábrica/)
    expect(m.findConfig).not.toHaveBeenCalled()
  })

  it('expreso marcado entregado sin foto → lo dice', async () => {
    m.findPedido.mockResolvedValue({ ...PEDIDO, remitoFotoUrl: null })
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/sin la foto de la guía/)
  })

  it('sin plantilla configurada → manda a Ajustes', async () => {
    m.findConfig.mockResolvedValue({ muestraTemplateName: null, muestraTemplateLang: null })
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/Ajustes → WhatsApp/)
    expect(m.findTemplate).not.toHaveBeenCalled()
  })

  it('plantilla no aprobada → motivo con el nombre', async () => {
    m.findTemplate.mockResolvedValue(undefined)
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    expect(r.templateName).toBe('muestra_despachada')
    if (!r.ok) expect(r.motivo).toMatch(/"muestra_despachada" \(es\) no está aprobada/)
  })

  it('plantilla sin encabezado de imagen → no se puede adjuntar la guía', async () => {
    m.findTemplate.mockResolvedValue({ ...TEMPLATE, headerFormat: 'TEXT' })
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/no tiene encabezado de imagen/)
    expect(m.getObject).not.toHaveBeenCalled()
  })

  it('la guía es PDF y la plantilla espera imagen → no coincide', async () => {
    m.getObject.mockResolvedValue({ buffer: PDF, contentType: 'application/pdf' })
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/espera una imagen y la guía es un PDF/)
  })

  it('no se puede leer la foto de R2 → motivo, sin lanzar', async () => {
    m.getObject.mockRejectedValue(new Error('NoSuchKey'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/No se pudo leer la foto/)
    warn.mockRestore()
  })

  it('cliente sin teléfono → el motivo es el de la conversación', async () => {
    m.ensureConv.mockRejectedValue(new Error('El cliente no tiene teléfono cargado'))
    const r = await prepararAvisoMuestra('lead-1', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('El cliente no tiene teléfono cargado')
  })

  it('caso feliz: texto resuelto, JPEG detectado por bytes aunque R2 diga PNG, nombre de la guía', async () => {
    const r = await prepararAvisoMuestra('lead-1', 'Admin')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.body).toBe('Hola Juan, tu muestra ya salió por Vía Cargo. Te adjuntamos la guía del pedido ABCD1234.')
    expect(r.valores).toEqual(['Juan', 'Vía Cargo', 'ABCD1234'])
    expect(r.headerFormat).toBe('IMAGE')
    expect(r.archivo.mime).toBe('image/jpeg')
    expect(r.archivo.nombre).toBe('guia-envio-ABCD1234.jpg')
    expect(r.fotoKey).toBe('firmas/123-abc.png')
    expect(r.waContactPhone).toBe('5491155550000')
    expect(m.ensureConv).toHaveBeenCalledWith('cli-1')
  })

  it('usa el nombre del vendedor asignado antes que el de quien manda', async () => {
    m.findTemplate.mockResolvedValue({
      bodyText: 'Hola {{1}}, te escribe {{2}}.',
      variables: [
        { index: 1, source: 'cliente_nombre', sample: 'Cliente' },
        { index: 2, source: 'vendedor_nombre', sample: 'el equipo' },
      ],
      headerFormat: 'IMAGE',
    })
    const r = await prepararAvisoMuestra('lead-1', 'Admin')
    expect(r.ok && r.body).toBe('Hola Juan, te escribe Nicolás Gómez.')
  })
})

describe('enviarAvisoMuestra', () => {
  it('sube la foto, manda la plantilla con encabezado imagen y variables, deja el chat y marca avisado', async () => {
    const r = await enviarAvisoMuestra('lead-1', { id: 'admin-1', name: 'Admin' })

    expect(m.uploadMedia).toHaveBeenCalledWith(JPEG, 'image/jpeg', 'guia-envio-ABCD1234.jpg')
    expect(m.sendTemplate).toHaveBeenCalledWith('5491155550000', 'muestra_despachada', 'es', [
      { type: 'header', parameters: [{ type: 'image', image: { id: 'media-777' } }] },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Juan' },
          { type: 'text', text: 'Vía Cargo' },
          { type: 'text', text: 'ABCD1234' },
        ],
      },
    ])

    // Mensaje en el chat + la foto como adjunto (misma clave R2 que subió fábrica)
    const inserts = m.insertValues.mock.calls.map((c) => c[0] as Record<string, unknown>)
    expect(inserts[0]).toMatchObject({
      conversationId: 'conv-1',
      waMessageId: 'wamid.ABC',
      direction: 'outbound',
      senderType: 'agent',
      senderId: 'admin-1',
      contentType: 'template',
      body: r.body,
      isRead: true,
    })
    expect(inserts[1]).toMatchObject({
      messageId: 'msg-1',
      r2Key: 'firmas/123-abc.png',
      mimeType: 'image/jpeg',
      fileSize: JPEG.length,
      originalFilename: 'guia-envio-ABCD1234.jpg',
    })
    expect(inserts[2]).toMatchObject({
      leadId: 'lead-1',
      userId: 'admin-1',
      action: 'note_added',
      metadata: { sistema: true, motivo: 'muestra_avisada', pedidoId: PEDIDO.id, texto: 'Aviso de muestra despachada enviado por WhatsApp — pedido #ABCD1234' },
    })
    expect(m.execute).toHaveBeenCalledTimes(1)

    expect(m.updateSet).toHaveBeenCalledTimes(1)
    expect(m.updateSet.mock.calls[0]![0]).toMatchObject({ muestraAvisadaAt: r.avisadaAt })
    expect(m.publish).toHaveBeenCalledWith({ type: 'muestra_avisada', leadId: 'lead-1', assignedTo: 'agente-1' })
    expect(r.pedidoId).toBe(PEDIDO.id)
  })

  it('reenvío: manda de nuevo, la nota dice "reenviado" y actualiza la fecha de aviso', async () => {
    m.findLead.mockResolvedValue({ ...LEAD, muestraAvisadaAt: new Date('2026-09-09T10:00:00.000Z') })
    await expect(enviarAvisoMuestra('lead-1', { id: 'u', name: null })).rejects.toThrow(/Ya se avisó/)
    expect(m.sendTemplate).not.toHaveBeenCalled()

    const r = await enviarAvisoMuestra('lead-1', { id: 'u', name: null }, { reenviar: true })
    expect(m.sendTemplate).toHaveBeenCalledTimes(1)
    const nota = m.insertValues.mock.calls.map((c) => c[0] as { action?: string; metadata?: { texto?: string } }).find((v) => v.action === 'note_added')
    expect(nota?.metadata?.texto).toMatch(/reenviado por WhatsApp/)
    expect(m.updateSet.mock.calls[0]![0]).toMatchObject({ muestraAvisadaAt: r.avisadaAt })
  })

  it('si no se puede mandar, lanza con el motivo y no toca Meta ni la base', async () => {
    m.findTemplate.mockResolvedValue(undefined)
    await expect(enviarAvisoMuestra('lead-1', { id: 'u', name: null })).rejects.toThrow(/no está aprobada/)
    expect(m.uploadMedia).not.toHaveBeenCalled()
    expect(m.sendTemplate).not.toHaveBeenCalled()
    expect(m.updateSet).not.toHaveBeenCalled()
  })

  it('si Meta rechaza el envío, el lead sigue pendiente', async () => {
    m.sendTemplate.mockRejectedValue(new Error('WhatsApp API error 400'))
    await expect(enviarAvisoMuestra('lead-1', { id: 'u', name: null })).rejects.toThrow(/WhatsApp API error/)
    expect(m.insertValues).not.toHaveBeenCalled()
    expect(m.updateSet).not.toHaveBeenCalled()
  })
})

describe('marcarMuestraAvisadaSinEnviar', () => {
  it('marca, deja nota y avisa por realtime sin tocar WhatsApp', async () => {
    const r = await marcarMuestraAvisadaSinEnviar('lead-1', 'admin-1')
    expect(m.uploadMedia).not.toHaveBeenCalled()
    expect(m.sendTemplate).not.toHaveBeenCalled()
    expect(m.updateSet.mock.calls[0]![0]).toMatchObject({ muestraAvisadaAt: r.avisadaAt })
    expect(m.insertValues.mock.calls[0]![0]).toMatchObject({
      action: 'note_added',
      metadata: { motivo: 'muestra_avisada', pedidoId: PEDIDO.id, texto: expect.stringContaining('sin mandar la plantilla') as string },
    })
    expect(m.publish).toHaveBeenCalledWith({ type: 'muestra_avisada', leadId: 'lead-1', assignedTo: 'agente-1' })
  })

  it('ya avisada o sin entregar → error de validación', async () => {
    m.findLead.mockResolvedValue({ ...LEAD, muestraAvisadaAt: new Date() })
    await expect(marcarMuestraAvisadaSinEnviar('lead-1', 'u')).rejects.toThrow(/Ya se avisó/)
    m.findLead.mockResolvedValue({ ...LEAD, muestraEntregadaAt: null })
    await expect(marcarMuestraAvisadaSinEnviar('lead-1', 'u')).rejects.toThrow(/todavía no se marcó/)
    expect(m.updateSet).not.toHaveBeenCalled()
  })
})

describe('listarMuestrasPendientesAviso', () => {
  it('roles sin leads (fábrica, repartidor) → lista vacía sin consultar', async () => {
    const fabrica = { id: 'f', role: 'fabrica', name: 'F' } as Parameters<typeof listarMuestrasPendientesAviso>[0]
    expect(await listarMuestrasPendientesAviso(fabrica)).toEqual([])
    expect(m.select).not.toHaveBeenCalled()
  })
})
