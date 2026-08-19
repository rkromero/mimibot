import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { AuthzError } from '@/lib/errors'

const { mockAuthFn, mockCanAccessLead, mockCrearPropuesta, mockListarPropuestas } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockCanAccessLead: vi.fn(),
  mockCrearPropuesta: vi.fn(),
  mockListarPropuestas: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/lib/authz', () => ({ canAccessLead: mockCanAccessLead }))
vi.mock('@/lib/cotizador/propuestas.service', () => ({
  crearPropuesta: mockCrearPropuesta,
  listarPropuestas: mockListarPropuestas,
}))

const LEAD_ID = '5a1b2c3d-0000-4000-8000-000000000001'

function makeSession(role: string, id = 'u1') {
  return { user: { id, role, name: 'Test', email: 't@t.com', avatarColor: '#aaa' } }
}

function postRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/leads/${LEAD_ID}/propuestas`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const INPUT_VALIDO = { cantidad: 1000, gramaje: 60, packaging: 'cristal', descuentoManualPct: 0 }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/leads/[id]/propuestas — permisos', () => {
  it('vendedor sin el lead asignado: 403 y no se crea nada', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    // canAccessLead lanza AuthzError para leads no asignados al usuario
    mockCanAccessLead.mockRejectedValue(new AuthzError('No tenés acceso a este lead'))

    const { POST } = await import('@/app/api/leads/[id]/propuestas/route')
    const res = await POST(postRequest(INPUT_VALIDO), { params: Promise.resolve({ id: LEAD_ID }) })
    const body = await res.json() as { error: string }

    expect(res.status).toBe(403)
    expect(body.error).toBe('No tenés acceso a este lead')
    expect(mockCanAccessLead).toHaveBeenCalledWith(makeSession('vendedor').user, LEAD_ID)
    expect(mockCrearPropuesta).not.toHaveBeenCalled()
  })

  it('vendedor con el lead asignado: 201 y crea la propuesta', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    mockCanAccessLead.mockResolvedValue(undefined)
    mockCrearPropuesta.mockResolvedValue({ id: 'prop-1', numero: 1, estado: 'borrador' })

    const { POST } = await import('@/app/api/leads/[id]/propuestas/route')
    const res = await POST(postRequest(INPUT_VALIDO), { params: Promise.resolve({ id: LEAD_ID }) })
    const body = await res.json() as { data: { numero: number } }

    expect(res.status).toBe(201)
    expect(body.data.numero).toBe(1)
    expect(mockCrearPropuesta).toHaveBeenCalledWith(LEAD_ID, INPUT_VALIDO, 'u1')
  })

  it('sin sesión: 401', async () => {
    mockAuthFn.mockResolvedValue(null)

    const { POST } = await import('@/app/api/leads/[id]/propuestas/route')
    const res = await POST(postRequest(INPUT_VALIDO), { params: Promise.resolve({ id: LEAD_ID }) })

    expect(res.status).toBe(401)
    expect(mockCrearPropuesta).not.toHaveBeenCalled()
  })

  it('input inválido: 400 sin crear', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockCanAccessLead.mockResolvedValue(undefined)

    const { POST } = await import('@/app/api/leads/[id]/propuestas/route')
    const res = await POST(
      postRequest({ ...INPUT_VALIDO, cantidad: 0 }),
      { params: Promise.resolve({ id: LEAD_ID }) },
    )

    expect(res.status).toBe(400)
    expect(mockCrearPropuesta).not.toHaveBeenCalled()
  })
})

describe('GET /api/leads/[id]/propuestas — permisos', () => {
  it('aplica canAccessLead antes de listar', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    mockCanAccessLead.mockRejectedValue(new AuthzError('No tenés acceso a este lead'))

    const { GET } = await import('@/app/api/leads/[id]/propuestas/route')
    const res = await GET(
      new NextRequest(`http://localhost/api/leads/${LEAD_ID}/propuestas`),
      { params: Promise.resolve({ id: LEAD_ID }) },
    )

    expect(res.status).toBe(403)
    expect(mockListarPropuestas).not.toHaveBeenCalled()
  })
})
