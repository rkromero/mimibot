/**
 * POST /api/leads/[id]/cliente — "Cargar pedido" desde el chat de un lead.
 *
 *  1. Sin sesión → 401.
 *  2. Fábrica y reparto → 403.
 *  3. Lead inexistente → 404.
 *  4. Devuelve el cliente vinculado/creado (clienteId + wasNew) y no cambia
 *     la etapa del lead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockLeadsFindFirst, mockTransaction, mockObtener, mockCanAccessLead } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockLeadsFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockObtener: vi.fn(),
  mockCanAccessLead: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/db', () => ({
  db: {
    query: { leads: { findFirst: mockLeadsFindFirst } },
    transaction: mockTransaction,
  },
}))
vi.mock('@/lib/authz', () => ({ canAccessLead: mockCanAccessLead }))
vi.mock('@/lib/clientes/conversion', () => ({ obtenerOCrearClienteParaLead: mockObtener }))

const LEAD_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const params = Promise.resolve({ id: LEAD_ID })
const req = () => new NextRequest(`http://localhost/api/leads/${LEAD_ID}/cliente`, { method: 'POST' })
const load = () => import('@/app/api/leads/[id]/cliente/route')

const admin = { user: { id: 'u-admin', role: 'admin' } }

beforeEach(() => {
  vi.clearAllMocks()
  mockCanAccessLead.mockResolvedValue(undefined)
  mockTransaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({}))
})

describe('POST /api/leads/[id]/cliente', () => {
  it('sin sesión → 401', async () => {
    mockAuth.mockResolvedValue(null)
    const { POST } = await load()
    const res = await POST(req(), { params })
    expect(res.status).toBe(401)
  })

  it.each(['fabrica', 'repartidor', 'distribucion'])('rol %s → 403', async (role) => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role } })
    const { POST } = await load()
    const res = await POST(req(), { params })
    expect(res.status).toBe(403)
    expect(mockObtener).not.toHaveBeenCalled()
  })

  it('lead inexistente → 404', async () => {
    mockAuth.mockResolvedValue(admin)
    mockLeadsFindFirst.mockResolvedValue(undefined)
    const { POST } = await load()
    const res = await POST(req(), { params })
    expect(res.status).toBe(404)
  })

  it('devuelve el cliente del lead (creado o vinculado) sin tocar la etapa', async () => {
    mockAuth.mockResolvedValue(admin)
    const lead = { id: LEAD_ID, contact: { name: 'Ana', email: null, phone: '+549' } }
    mockLeadsFindFirst.mockResolvedValue(lead)
    mockObtener.mockResolvedValue({ cliente: { id: 'cli-1' }, wasNew: true })

    const { POST } = await load()
    const res = await POST(req(), { params })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { clienteId: 'cli-1', wasNew: true } })
    expect(mockCanAccessLead).toHaveBeenCalledWith(admin.user, LEAD_ID)
    expect(mockObtener).toHaveBeenCalledWith({}, lead, 'u-admin')
  })

  it('un agente que no es dueño del lead no puede', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-agent', role: 'agent' } })
    const { AuthzError } = await import('@/lib/errors')
    mockCanAccessLead.mockRejectedValue(new AuthzError('No tenés acceso a este lead'))
    const { POST } = await load()
    const res = await POST(req(), { params })
    expect(res.status).toBe(403)
  })
})
