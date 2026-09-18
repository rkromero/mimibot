/**
 * POST /api/propuestas/[id]/enviar — bajar el PDF de una propuesta que ya
 * salió no es un envío nuevo: no mueve el lead a "Propuesta enviada" ni
 * vuelve a programar el seguimiento automático ("¿pudiste ver la cotización
 * que te mandé ayer?"). El caso real: el vendedor bajó el PDF tres veces en
 * medio de la charla y el cliente recibió tres seguimientos fuera de contexto.
 *
 *  1. Descarga de una propuesta ya enviada → registra, sin etapa ni seguimiento.
 *  2. Primera descarga (estaba en borrador/aprobada) → programa como siempre.
 *  3. Reenvío por WhatsApp de una ya enviada → sí programa (es un envío real).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockAuthFn, mockCanAccessLead, mockFindFirst, mockUpdate, mockInsert, mockExecute,
  mockProgramar, mockOnPropuestaEnviada, mockSendMedia, mockUpload, mockPersist,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockCanAccessLead: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockInsert: vi.fn(),
  mockExecute: vi.fn(),
  mockProgramar: vi.fn(),
  mockOnPropuestaEnviada: vi.fn(),
  mockSendMedia: vi.fn(),
  mockUpload: vi.fn(),
  mockPersist: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/lib/authz', () => ({ canAccessLead: mockCanAccessLead, requireAdmin: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    query: {
      propuestas: { findFirst: mockFindFirst },
      conversations: { findFirst: vi.fn().mockResolvedValue({ id: 'conv-1', waContactPhone: '+5491100000000' }) },
    },
    update: mockUpdate,
    insert: mockInsert,
    execute: mockExecute,
  },
}))
vi.mock('@/lib/pdf/propuesta.service', () => ({
  generarPropuestaPdf: vi.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), filename: 'p.pdf', numero: 51 }),
}))
vi.mock('@/lib/pdf/propuesta.template', () => ({
  formatNumeroPropuesta: (n: number) => `PROP-${String(n).padStart(5, '0')}`,
}))
vi.mock('@/lib/whatsapp/client', () => ({ uploadMediaToMeta: mockUpload, sendMediaMessage: mockSendMedia }))
vi.mock('@/lib/whatsapp/media', () => ({ persistOutboundMedia: mockPersist }))
vi.mock('@/lib/followup/engine', () => ({ programarSeguimientoPropuesta: mockProgramar }))
vi.mock('@/lib/leads/propuesta-enviada', () => ({ onPropuestaEnviada: mockOnPropuestaEnviada }))

import { POST } from '@/app/api/propuestas/[id]/enviar/route'

const PROP_ID = '5a1b2c3d-0000-4000-8000-000000000051'

function propuesta(estado: string) {
  return {
    id: PROP_ID,
    numero: 51,
    leadId: 'lead-1',
    estado,
    lead: { contact: { name: 'Lautaro', email: null } },
  }
}

function req(via: 'descarga' | 'whatsapp' | 'email') {
  return new NextRequest(`http://localhost/api/propuestas/${PROP_ID}/enviar`, {
    method: 'POST',
    body: JSON.stringify({ via }),
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = { params: Promise.resolve({ id: PROP_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthFn.mockResolvedValue({ user: { id: 'vend-1', role: 'vendedor', name: 'Teo' } })
  mockCanAccessLead.mockResolvedValue(undefined)
  mockUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) })
  mockInsert.mockReturnValue({
    values: () => ({ returning: () => Promise.resolve([{ id: 'msg-1' }]) }),
  })
  mockExecute.mockResolvedValue(undefined)
  mockProgramar.mockResolvedValue(undefined)
  mockOnPropuestaEnviada.mockResolvedValue({ etapaMovida: true, stageId: 'stage-propuesta' })
  mockUpload.mockResolvedValue('meta-media-1')
  mockSendMedia.mockResolvedValue('wamid.1')
  mockPersist.mockResolvedValue(undefined)
})

describe('POST /api/propuestas/[id]/enviar — descarga de una propuesta ya enviada', () => {
  it('registra la descarga pero no mueve de etapa ni programa el seguimiento', async () => {
    mockFindFirst.mockResolvedValue(propuesta('enviada'))

    const res = await POST(req('descarga'), params)
    const json = await res.json() as { data: { etapaMovida: boolean; estado: string } }

    expect(res.status).toBe(200)
    expect(json.data.estado).toBe('enviada')
    expect(json.data.etapaMovida).toBe(false)
    expect(mockOnPropuestaEnviada).not.toHaveBeenCalled()
    expect(mockProgramar).not.toHaveBeenCalled()
    // La actividad propuesta_enviada (via descarga) sí queda registrada
    expect(mockInsert).toHaveBeenCalled()
  })

  it('la primera descarga (todavía no enviada) mueve de etapa y programa el seguimiento', async () => {
    mockFindFirst.mockResolvedValue(propuesta('aprobada'))

    const res = await POST(req('descarga'), params)
    const json = await res.json() as { data: { etapaMovida: boolean } }

    expect(res.status).toBe(200)
    expect(json.data.etapaMovida).toBe(true)
    expect(mockOnPropuestaEnviada).toHaveBeenCalledWith('lead-1', 'vend-1', PROP_ID)
    expect(mockProgramar).toHaveBeenCalledWith('lead-1')
  })

  it('reenviar por WhatsApp una ya enviada es un envío real: programa el seguimiento', async () => {
    mockFindFirst.mockResolvedValue(propuesta('enviada'))

    const res = await POST(req('whatsapp'), params)

    expect(res.status).toBe(200)
    expect(mockSendMedia).toHaveBeenCalled()
    expect(mockOnPropuestaEnviada).toHaveBeenCalled()
    expect(mockProgramar).toHaveBeenCalledWith('lead-1')
  })
})
