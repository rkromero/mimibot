/**
 * GET / POST / DELETE /api/leads/[id]/ultimo-seguimiento — botón "Último seguimiento".
 *  1. Sin sesión → 401. id que no es UUID → 400.
 *  2. GET devuelve la vista previa (disponible o el motivo).
 *  3. POST manda y devuelve cuándo cierra; si el motor dice que no se puede → 400.
 *  4. DELETE cancela el cierre pendiente con el usuario que lo hizo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ValidationError } from '@/lib/errors'

const { mockAuth, mockCanAccess, mockPreparar, mockEnviar, mockCancelar } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCanAccess: vi.fn(),
  mockPreparar: vi.fn(),
  mockEnviar: vi.fn(),
  mockCancelar: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/authz', () => ({ canAccessLead: mockCanAccess }))
vi.mock('@/lib/followup/engine', () => ({
  prepararUltimoSeguimiento: mockPreparar,
  enviarUltimoSeguimiento: mockEnviar,
  cancelarUltimoSeguimiento: mockCancelar,
}))

import { GET, POST, DELETE } from '@/app/api/leads/[id]/ultimo-seguimiento/route'

const LEAD_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const CIERRA = new Date('2026-09-03T19:00:00.000Z')

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (id: string, method: string) =>
  new NextRequest(`http://localhost/api/leads/${id}/ultimo-seguimiento`, { method })

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { id: USER_ID, role: 'vendedor', name: 'Teo' } })
  mockCanAccess.mockResolvedValue(undefined)
})

describe('GET (vista previa)', () => {
  it('sin sesión → 401', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(req(LEAD_ID, 'GET'), ctx(LEAD_ID))
    expect(res.status).toBe(401)
  })

  it('id que no es UUID → 400', async () => {
    const res = await GET(req('x', 'GET'), ctx('x'))
    expect(res.status).toBe(400)
    expect(mockPreparar).not.toHaveBeenCalled()
  })

  it('disponible: devuelve el texto armado y cuándo cierra', async () => {
    mockPreparar.mockResolvedValue({ ok: true, body: 'Hola Juan, ...', cierraEl: CIERRA, templateName: 'ultimo_seguimiento' })
    const res = await GET(req(LEAD_ID, 'GET'), ctx(LEAD_ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { disponible: true, motivo: null, body: 'Hola Juan, ...', cierraEl: CIERRA.toISOString(), templateName: 'ultimo_seguimiento' },
    })
    expect(mockPreparar).toHaveBeenCalledWith(LEAD_ID, 'Teo')
  })

  it('no disponible: devuelve el motivo', async () => {
    mockPreparar.mockResolvedValue({ ok: false, motivo: 'La plantilla no está aprobada', cierraEl: CIERRA, templateName: 'ultimo_seguimiento' })
    const res = await GET(req(LEAD_ID, 'GET'), ctx(LEAD_ID))
    const json = await res.json() as { data: { disponible: boolean; motivo: string; body: string | null } }
    expect(json.data.disponible).toBe(false)
    expect(json.data.motivo).toBe('La plantilla no está aprobada')
    expect(json.data.body).toBeNull()
  })
})

describe('POST (enviar)', () => {
  it('manda con el usuario de la sesión y devuelve cuándo cierra', async () => {
    mockEnviar.mockResolvedValue({ body: 'Hola Juan, ...', cierraEl: CIERRA })
    const res = await POST(req(LEAD_ID, 'POST'), ctx(LEAD_ID))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { body: 'Hola Juan, ...', cierraEl: CIERRA.toISOString() } })
    expect(mockEnviar).toHaveBeenCalledWith(LEAD_ID, { id: USER_ID, name: 'Teo' })
  })

  it('si el motor no puede mandar → 400 con el motivo', async () => {
    mockEnviar.mockRejectedValue(new ValidationError('El lead no tiene conversación de WhatsApp'))
    const res = await POST(req(LEAD_ID, 'POST'), ctx(LEAD_ID))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'El lead no tiene conversación de WhatsApp' })
  })
})

describe('DELETE (cancelar el cierre)', () => {
  it('cancela y dice si había algo que cancelar', async () => {
    mockCancelar.mockResolvedValue(true)
    const res = await DELETE(req(LEAD_ID, 'DELETE'), ctx(LEAD_ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { cancelado: true } })
    expect(mockCancelar).toHaveBeenCalledWith(LEAD_ID, expect.any(String), USER_ID)
  })

  it('sin cierre pendiente → cancelado false', async () => {
    mockCancelar.mockResolvedValue(false)
    const res = await DELETE(req(LEAD_ID, 'DELETE'), ctx(LEAD_ID))
    expect(await res.json()).toEqual({ data: { cancelado: false } })
  })
})
