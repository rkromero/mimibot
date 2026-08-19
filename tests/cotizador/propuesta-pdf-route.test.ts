import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ConflictError } from '@/lib/errors'

const { mockAuthFn, mockCanAccessLead, mockFindFirst, mockGenerar } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockCanAccessLead: vi.fn(),
  mockFindFirst: vi.fn(),
  mockGenerar: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))
vi.mock('@/lib/authz', () => ({ canAccessLead: mockCanAccessLead }))
vi.mock('@/db', () => ({ db: { query: { propuestas: { findFirst: mockFindFirst } } } }))
vi.mock('@/lib/pdf/propuesta.service', () => ({ generarPropuestaPdf: mockGenerar }))

const PROP_ID = '5a1b2c3d-0000-4000-8000-000000000009'

function makeReq() {
  return new NextRequest(`http://localhost/api/propuestas/${PROP_ID}/pdf`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', name: 'Admin', email: 'a@a.com', avatarColor: '#aaa' } })
  mockCanAccessLead.mockResolvedValue(undefined)
  mockFindFirst.mockResolvedValue({ id: PROP_ID, leadId: 'lead-1' })
})

describe('GET /api/propuestas/[id]/pdf', () => {
  it('propuesta pendiente_aprobacion → 409 con mensaje claro', async () => {
    mockGenerar.mockRejectedValue(
      new ConflictError('La propuesta está pendiente de aprobación del descuento: un administrador debe aprobarla antes de generar el PDF.'),
    )

    const { GET } = await import('@/app/api/propuestas/[id]/pdf/route')
    const res = await GET(makeReq(), { params: Promise.resolve({ id: PROP_ID }) })
    const body = await res.json() as { error: string }

    expect(res.status).toBe(409)
    expect(body.error).toContain('pendiente de aprobación')
  })

  it('propuesta aprobada → 200 application/pdf', async () => {
    mockGenerar.mockResolvedValue({
      buffer: Buffer.from('%PDF-fake'),
      numero: 42,
      filename: 'PROP-00042.pdf',
      leadId: 'lead-1',
      estado: 'aprobada',
    })

    const { GET } = await import('@/app/api/propuestas/[id]/pdf/route')
    const res = await GET(makeReq(), { params: Promise.resolve({ id: PROP_ID }) })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('PROP-00042.pdf')
  })

  it('propuesta inexistente → 404 sin generar nada', async () => {
    mockFindFirst.mockResolvedValue(undefined)

    const { GET } = await import('@/app/api/propuestas/[id]/pdf/route')
    const res = await GET(makeReq(), { params: Promise.resolve({ id: PROP_ID }) })

    expect(res.status).toBe(404)
    expect(mockGenerar).not.toHaveBeenCalled()
  })

  it('sin acceso al lead de la propuesta → 403', async () => {
    const { AuthzError } = await import('@/lib/errors')
    mockCanAccessLead.mockRejectedValue(new AuthzError('No tenés acceso a este lead'))

    const { GET } = await import('@/app/api/propuestas/[id]/pdf/route')
    const res = await GET(makeReq(), { params: Promise.resolve({ id: PROP_ID }) })

    expect(res.status).toBe(403)
    expect(mockGenerar).not.toHaveBeenCalled()
  })
})
