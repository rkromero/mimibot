/**
 * Tests para GET /api/pedidos/[id]/comprobante
 *
 * Cobertura:
 *  1. Agente dueño del pedido (expreso) → 200 con url firmada tipo='remito'
 *  2. Agente dueño del pedido (camioneta) → 200 con url firmada tipo='firma'
 *  3. Agente NO dueño del pedido → 403
 *  4. Admin → 200 para cualquier pedido
 *  5. Pedido entregado sin comprobante → 200 + missingComprobante=true
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockFindPedido,
  mockFindCliente,
  mockGetSignedUrl,
  mockValidateUuidParam,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockFindPedido: vi.fn(),
  mockFindCliente: vi.fn(),
  mockGetSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/signed-url'),
  mockValidateUuidParam: vi.fn().mockReturnValue(null),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: { findFirst: mockFindPedido },
      clientes: { findFirst: mockFindCliente },
    },
  },
}))

vi.mock('@/lib/r2/signed-url', () => ({ getSignedUrl: mockGetSignedUrl }))

vi.mock('@/lib/territorios/context', () => ({
  getSessionContext: vi.fn((user: { id: string; role: string }) => {
    return Promise.resolve({
      userId: user.id,
      role: user.role,
      territoriosGestionados: [],
      agentesVisibles: [],
    })
  }),
}))

vi.mock('@/lib/errors', () => {
  class AuthzError extends Error {
    statusCode = 403
    constructor(m = 'No autorizado') { super(m); this.name = 'AuthzError' }
  }
  class NotFoundError extends Error {
    statusCode = 404
    constructor(r: string) { super(`${r} no encontrado`); this.name = 'NotFoundError' }
  }
  return {
    AuthzError, NotFoundError,
    toApiError: (err: unknown) => {
      const e = err as { statusCode?: number; message?: string }
      return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
    },
  }
})

vi.mock('@/lib/api/validate-params', () => ({
  validateUuidParam: mockValidateUuidParam,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PEDIDO_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const CLIENTE_ID = 'cccccccc-0000-0000-0000-000000000001'
const AGENT_ID = 'user-agent-1'
const OTHER_AGENT_ID = 'user-agent-2'
const ADMIN_ID = 'user-admin-1'

function makeRequest(id = PEDIDO_ID) {
  return new NextRequest(`http://localhost/api/pedidos/${id}/comprobante`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
}

function makeAgentSession(id = AGENT_ID) {
  return { user: { id, role: 'agent', name: 'Agente', email: 'agent@test.com', avatarColor: '#aaa' } }
}

function makeAdminSession() {
  return { user: { id: ADMIN_ID, role: 'admin', name: 'Admin', email: 'admin@test.com', avatarColor: '#bbb' } }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/pedidos/[id]/comprobante', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('1. agente dueño — pedido expreso → 200 con url y tipo=remito', async () => {
    mockAuthFn.mockResolvedValue(makeAgentSession())
    mockFindPedido.mockResolvedValue({
      id: PEDIDO_ID, clienteId: CLIENTE_ID, vendedorId: AGENT_ID,
      estado: 'entregado', metodoEntrega: 'expreso', esReparto: false,
      firmaUrl: null, remitoFotoUrl: 'r2/remito-firmado.jpg',
    })
    mockFindCliente.mockResolvedValue({ id: CLIENTE_ID })

    const { GET } = await import('@/app/api/pedidos/[id]/comprobante/route')
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.tipo).toBe('remito')
    expect(body.missingComprobante).toBe(false)
    expect(typeof body.url).toBe('string')
    expect(mockGetSignedUrl).toHaveBeenCalledWith('r2/remito-firmado.jpg')
  })

  it('2. agente dueño — pedido camioneta (esReparto) → 200 con url y tipo=firma', async () => {
    mockAuthFn.mockResolvedValue(makeAgentSession())
    mockFindPedido.mockResolvedValue({
      id: PEDIDO_ID, clienteId: CLIENTE_ID, vendedorId: AGENT_ID,
      estado: 'entregado', metodoEntrega: null, esReparto: true,
      firmaUrl: 'r2/firma-cliente.png', remitoFotoUrl: null,
    })
    mockFindCliente.mockResolvedValue({ id: CLIENTE_ID })

    const { GET } = await import('@/app/api/pedidos/[id]/comprobante/route')
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.tipo).toBe('firma')
    expect(body.missingComprobante).toBe(false)
    expect(mockGetSignedUrl).toHaveBeenCalledWith('r2/firma-cliente.png')
  })

  it('3. agente NO dueño del pedido → 403', async () => {
    mockAuthFn.mockResolvedValue(makeAgentSession(OTHER_AGENT_ID))
    mockFindPedido.mockResolvedValue({
      id: PEDIDO_ID, clienteId: CLIENTE_ID, vendedorId: AGENT_ID,
      estado: 'entregado', metodoEntrega: 'expreso', esReparto: false,
      firmaUrl: null, remitoFotoUrl: 'r2/remito.jpg',
    })
    // cliente no retorna nada porque asignadoA !== OTHER_AGENT_ID
    mockFindCliente.mockResolvedValue(null)

    const { GET } = await import('@/app/api/pedidos/[id]/comprobante/route')
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })

    expect(res.status).toBe(403)
    expect(mockGetSignedUrl).not.toHaveBeenCalled()
  })

  it('4. admin → 200 para cualquier pedido', async () => {
    mockAuthFn.mockResolvedValue(makeAdminSession())
    mockFindPedido.mockResolvedValue({
      id: PEDIDO_ID, clienteId: CLIENTE_ID, vendedorId: AGENT_ID,
      estado: 'entregado', metodoEntrega: 'expreso', esReparto: false,
      firmaUrl: null, remitoFotoUrl: 'r2/remito-firmado.jpg',
    })

    const { GET } = await import('@/app/api/pedidos/[id]/comprobante/route')
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.tipo).toBe('remito')
    // admin no necesita verificar cliente
    expect(mockFindCliente).not.toHaveBeenCalled()
  })

  it('5. pedido entregado sin comprobante → 200 + missingComprobante=true', async () => {
    mockAuthFn.mockResolvedValue(makeAgentSession())
    mockFindPedido.mockResolvedValue({
      id: PEDIDO_ID, clienteId: CLIENTE_ID, vendedorId: AGENT_ID,
      estado: 'entregado', metodoEntrega: 'expreso', esReparto: false,
      firmaUrl: null, remitoFotoUrl: null,
    })
    mockFindCliente.mockResolvedValue({ id: CLIENTE_ID })

    const { GET } = await import('@/app/api/pedidos/[id]/comprobante/route')
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.missingComprobante).toBe(true)
    expect(body.url).toBeNull()
    expect(mockGetSignedUrl).not.toHaveBeenCalled()
  })
})
