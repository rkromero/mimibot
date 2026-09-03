/**
 * Plantilla de apertura automática a leads nuevos (lib/leads/apertura.ts).
 *
 *  1. Comodines de variables: vendedor asignado → nombre por defecto → "el equipo"; producto → "tu producto".
 *  2. Sin plantilla configurada / no aprobada / sin teléfono → no manda, deja nota y no marca contactado.
 *  3. Ya enviada → no repite.
 *  4. Caso feliz: manda la plantilla con las variables, guarda el mensaje, marca el lead y avisa en vivo.
 *  5. Meta rechaza el envío → nota interna en el chat, el lead sigue sin contactar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockWaConfig,
  mockFindLead,
  mockFindConv,
  mockFindTemplate,
  mockFindUser,
  mockInsertValues,
  mockUpdateSet,
  mockExecute,
  mockSendTemplate,
  mockPublish,
} = vi.hoisted(() => ({
  mockWaConfig: vi.fn(),
  mockFindLead: vi.fn(),
  mockFindConv: vi.fn(),
  mockFindTemplate: vi.fn(),
  mockFindUser: vi.fn(),
  mockInsertValues: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockExecute: vi.fn(),
  mockSendTemplate: vi.fn(),
  mockPublish: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    query: {
      whatsappConfig: { findFirst: mockWaConfig },
      leads: { findFirst: mockFindLead },
      conversations: { findFirst: mockFindConv },
      whatsappTemplates: { findFirst: mockFindTemplate },
      users: { findFirst: mockFindUser },
    },
    insert: () => ({ values: mockInsertValues }),
    update: () => ({
      set: (values: unknown) => {
        mockUpdateSet(values)
        return { where: vi.fn().mockResolvedValue(undefined) }
      },
    }),
    execute: mockExecute,
  },
}))

vi.mock('@/lib/whatsapp/client', () => ({
  sendTemplateMessage: mockSendTemplate,
  buildBodyComponents: (values: string[]) => [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }],
}))
vi.mock('@/lib/realtime/broker', () => ({ publishCrmEvent: mockPublish }))

import { contextoApertura, enviarAperturaLead, PRODUCTO_FALLBACK, REMITENTE_FALLBACK } from '@/lib/leads/apertura'

const LEAD_ID = 'lead-1'
const CONV_ID = 'conv-1'
const PLANTILLA = {
  bodyText: 'Hola {{1}},  Soy {{2}} de ALIPRO. Vi que completaste el formulario por fason de {{3}}. Contame qué necesitás y lo vemos juntos.',
  variables: [
    { index: 1, sample: '', source: 'cliente_nombre' },
    { index: 2, sample: '', source: 'vendedor_nombre' },
    { index: 3, sample: '', source: 'lead_producto_interes' },
  ],
}
const CONFIG = { aperturaTemplateName: 'apertura_lead', aperturaTemplateLang: 'es', aperturaAutoLeads: true, aperturaNombreDefault: null }
const LEAD = {
  id: LEAD_ID,
  assignedTo: 'user-teo',
  productInterest: 'alfajores',
  aperturaEnviadaAt: null,
  contact: { name: 'Homero Simpson' },
}

function inserts() {
  return mockInsertValues.mock.calls.map((c) => c[0] as Record<string, unknown>)
}
function notasActividad() {
  return inserts().filter((i) => i['action'] === 'note_added').map((i) => (i['metadata'] as { motivo: string }).motivo)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockWaConfig.mockResolvedValue(CONFIG)
  mockFindLead.mockResolvedValue(LEAD)
  mockFindConv.mockResolvedValue({ id: CONV_ID, waContactPhone: '+5491100000000' })
  mockFindTemplate.mockResolvedValue(PLANTILLA)
  mockFindUser.mockResolvedValue({ name: 'Teo' })
  mockInsertValues.mockResolvedValue(undefined)
  mockExecute.mockResolvedValue(undefined)
  mockSendTemplate.mockResolvedValue('wamid.123')
  mockPublish.mockResolvedValue(undefined)
})

describe('contextoApertura', () => {
  it('usa el vendedor asignado, si no el nombre por defecto, si no "el equipo"', () => {
    expect(contextoApertura({ contactName: 'Ana', vendedorNombre: 'Teo', nombreDefault: 'Rodo', productInterest: 'x' }).vendedorNombre).toBe('Teo')
    expect(contextoApertura({ contactName: 'Ana', vendedorNombre: null, nombreDefault: 'Rodo', productInterest: 'x' }).vendedorNombre).toBe('Rodo')
    expect(contextoApertura({ contactName: 'Ana', vendedorNombre: '  ', nombreDefault: '', productInterest: 'x' }).vendedorNombre).toBe(REMITENTE_FALLBACK)
  })

  it('producto vacío → "tu producto"; nombre recortado', () => {
    const ctx = contextoApertura({ contactName: '  Ana Pérez ', vendedorNombre: 'Teo', nombreDefault: null, productInterest: null })
    expect(ctx.productoInteres).toBe(PRODUCTO_FALLBACK)
    expect(ctx.clienteNombre).toBe('Ana Pérez')
  })
})

describe('enviarAperturaLead', () => {
  it('caso feliz: manda la plantilla con nombre, vendedor y producto', async () => {
    const r = await enviarAperturaLead(LEAD_ID, { origen: 'landing' })

    expect(r).toEqual({
      enviada: true,
      body: 'Hola Homero,  Soy Teo de ALIPRO. Vi que completaste el formulario por fason de alfajores. Contame qué necesitás y lo vemos juntos.',
    })
    expect(mockSendTemplate).toHaveBeenCalledWith(
      '+5491100000000',
      'apertura_lead',
      'es',
      [{ type: 'body', parameters: [{ type: 'text', text: 'Homero' }, { type: 'text', text: 'Teo' }, { type: 'text', text: 'alfajores' }] }],
    )

    const mensaje = inserts().find((i) => i['contentType'] === 'template')
    expect(mensaje).toMatchObject({ conversationId: CONV_ID, waMessageId: 'wamid.123', direction: 'outbound', senderType: 'agent', senderId: 'user-teo', isRead: true })

    expect(mockUpdateSet).toHaveBeenCalledTimes(1)
    const set = mockUpdateSet.mock.calls[0]![0] as { aperturaEnviadaAt: Date; lastContactedAt: Date }
    expect(set.aperturaEnviadaAt).toBeInstanceOf(Date)
    expect(set.lastContactedAt).toBeInstanceOf(Date)

    expect(notasActividad()).toEqual(['apertura_automatica'])
    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'new_message', leadId: LEAD_ID, direction: 'outbound' }))
  })

  it('sin vendedor asignado usa el nombre por defecto de Ajustes; sin producto, "tu producto"', async () => {
    mockWaConfig.mockResolvedValue({ ...CONFIG, aperturaNombreDefault: 'Rodo' })
    mockFindLead.mockResolvedValue({ ...LEAD, assignedTo: null, productInterest: null })

    const r = await enviarAperturaLead(LEAD_ID, { origen: 'landing' })

    expect(r.enviada).toBe(true)
    expect(mockFindUser).not.toHaveBeenCalled()
    const componentes = mockSendTemplate.mock.calls[0]![3] as Array<{ parameters: Array<{ text: string }> }>
    expect(componentes[0]!.parameters.map((p) => p.text)).toEqual(['Homero', 'Rodo', PRODUCTO_FALLBACK])
  })

  it('creado a mano sin vendedor: firma quien lo creó', async () => {
    mockFindLead.mockResolvedValue({ ...LEAD, assignedTo: null })
    await enviarAperturaLead(LEAD_ID, { origen: 'manual', remitenteNombre: 'Silvana' })
    const componentes = mockSendTemplate.mock.calls[0]![3] as Array<{ parameters: Array<{ text: string }> }>
    expect(componentes[0]!.parameters[1]!.text).toBe('Silvana')
  })

  it('sin plantilla configurada → no manda, deja nota y no marca contactado', async () => {
    mockWaConfig.mockResolvedValue({ ...CONFIG, aperturaTemplateName: null })
    const r = await enviarAperturaLead(LEAD_ID, { origen: 'landing' })
    expect(r.enviada).toBe(false)
    expect(mockSendTemplate).not.toHaveBeenCalled()
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(notasActividad()).toEqual(['apertura_no_enviada'])
  })

  it('plantilla no aprobada → nota en la actividad y en el chat', async () => {
    mockFindTemplate.mockResolvedValue(undefined)
    const r = await enviarAperturaLead(LEAD_ID, { origen: 'landing' })
    expect(r.enviada).toBe(false)
    expect(r.enviada === false && r.motivo).toContain('no está aprobada')
    expect(inserts().some((i) => i['contentType'] === 'internal_note')).toBe(true)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('sin teléfono de WhatsApp → no manda', async () => {
    mockFindConv.mockResolvedValue({ id: CONV_ID, waContactPhone: null })
    const r = await enviarAperturaLead(LEAD_ID, { origen: 'landing' })
    expect(r.enviada).toBe(false)
    expect(mockSendTemplate).not.toHaveBeenCalled()
    expect(notasActividad()).toEqual(['apertura_no_enviada'])
  })

  it('ya enviada → no repite ni deja nota', async () => {
    mockFindLead.mockResolvedValue({ ...LEAD, aperturaEnviadaAt: new Date() })
    const r = await enviarAperturaLead(LEAD_ID, { origen: 'landing' })
    expect(r).toEqual({ enviada: false, motivo: 'La apertura ya se mandó' })
    expect(mockSendTemplate).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('Meta rechaza el envío → nota interna, el lead sigue sin contactar', async () => {
    mockSendTemplate.mockRejectedValue(new Error('(#131026) Message undeliverable'))
    const r = await enviarAperturaLead(LEAD_ID, { origen: 'landing' })
    expect(r.enviada).toBe(false)
    expect(r.enviada === false && r.motivo).toContain('131026')
    expect(mockUpdateSet).not.toHaveBeenCalled()
    expect(inserts().some((i) => i['contentType'] === 'internal_note')).toBe(true)
    expect(inserts().some((i) => i['contentType'] === 'template')).toBe(false)
    expect(mockPublish).not.toHaveBeenCalled()
  })
})
