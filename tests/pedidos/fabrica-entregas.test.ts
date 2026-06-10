/**
 * Tests de permisos y flujo expreso para el rol 'fabrica' en los endpoints
 * de repartidor reutilizados por la pantalla "Entregas" de fábrica.
 *
 * Endpoints cubiertos:
 *  - GET  /api/repartidor/listos
 *  - POST /api/repartidor/aceptar
 *  - GET  /api/repartidor/pedidos
 *  - PATCH /api/repartidor/pedidos/[id]/entregar
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockDbSelect,
  mockDbUpdate,
  mockDbQuery,
  mockRegistrarPago,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbQuery: {
    pedidos: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
  mockRegistrarPago: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    query: mockDbQuery,
  },
}))

vi.mock('@/lib/cuenta-corriente/pago.service', () => ({
  registrarPagoPedido: mockRegistrarPago,
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
  class ConflictError extends Error {
    statusCode = 409
    constructor(m: string) { super(m); this.name = 'ConflictError' }
  }
  class ValidationError extends Error {
    statusCode = 400
    constructor(m: string) { super(m); this.name = 'ValidationError' }
  }
  return {
    AuthzError, NotFoundError, ConflictError, ValidationError,
    toApiError: (err: unknown) => {
      const e = err as { statusCode?: number; message?: string }
      return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
    },
  }
})

vi.mock('@/lib/api/validate-params', () => ({
  validateUuidParam: vi.fn().mockReturnValue(null),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PEDIDO_UUID = 'bbbbbbbb-0000-0000-0000-000000000002'
const FABRICA_USER_ID = 'user-fabrica-1'
const VENDEDOR_USER_ID = 'user-vendedor-1'

function makeSession(role: string, id = FABRICA_USER_ID) {
  return { user: { id, role, name: 'Test', email: 'test@test.com', avatarColor: '#aaa' } }
}

function makeSelectChain(rows: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(rows)
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbSelect.mockReturnValue({ from: mockFrom })
}

function makeUpdateChain(returning: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(returning)
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbUpdate.mockReturnValue({ set: mockSet })
}

// ─── Tests: GET /api/repartidor/listos ────────────────────────────────────────

describe('GET /api/repartidor/listos — rol fabrica', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('fabrica puede acceder → 200 con camioneta y expreso', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockDbQuery.pedidos.findMany.mockResolvedValue([
      { id: '1', esReparto: true, metodoEntrega: null, fecha: '2025-01-01', total: '1000', cliente: {}, items: [] },
      { id: '2', esReparto: false, metodoEntrega: 'expreso', fecha: '2025-01-01', total: '2000', cliente: {}, items: [] },
    ])

    const { GET } = await import('@/app/api/repartidor/listos/route')
    const req = new NextRequest('http://localhost/api/repartidor/listos')
    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json() as { camioneta: unknown[]; expreso: unknown[] }
    expect(body.camioneta).toHaveLength(1)
    expect(body.expreso).toHaveLength(1)
  })

  it('vendedor → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor', VENDEDOR_USER_ID))

    const { GET } = await import('@/app/api/repartidor/listos/route')
    const res = await GET()

    expect(res.status).toBe(403)
    expect(mockDbQuery.pedidos.findMany).not.toHaveBeenCalled()
  })
})

// ─── Tests: POST /api/repartidor/aceptar ─────────────────────────────────────

describe('POST /api/repartidor/aceptar — rol fabrica', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('fabrica puede aceptar un expreso → 200, repartidorId=session.user.id', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockDbQuery.pedidos.findMany.mockResolvedValue([
      { id: PEDIDO_UUID, estado: 'listo_para_repartir', esReparto: false, metodoEntrega: 'expreso' },
    ])
    const updated = { id: PEDIDO_UUID, estado: 'en_reparto', repartidorId: FABRICA_USER_ID }
    makeUpdateChain([updated])

    const { POST } = await import('@/app/api/repartidor/aceptar/route')
    const req = new NextRequest('http://localhost/api/repartidor/aceptar', {
      method: 'POST',
      body: JSON.stringify({ pedidoIds: [PEDIDO_UUID] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json() as { actualizados: { repartidorId: string }[]; omitidos: unknown[] }
    expect(body.omitidos).toHaveLength(0)
    expect(body.actualizados[0]?.repartidorId).toBe(FABRICA_USER_ID)
  })

  it('vendedor → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor', VENDEDOR_USER_ID))

    const { POST } = await import('@/app/api/repartidor/aceptar/route')
    const req = new NextRequest('http://localhost/api/repartidor/aceptar', {
      method: 'POST',
      body: JSON.stringify({ pedidoIds: [PEDIDO_UUID] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    expect(res.status).toBe(403)
    expect(mockDbQuery.pedidos.findMany).not.toHaveBeenCalled()
  })
})

// ─── Tests: GET /api/repartidor/pedidos ──────────────────────────────────────

describe('GET /api/repartidor/pedidos — rol fabrica', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('fabrica solo ve sus pedidos (filtra por repartidorId)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    const expresoPropio = { id: PEDIDO_UUID, metodoEntrega: 'expreso', repartidorId: FABRICA_USER_ID, estado: 'en_reparto', cliente: {}, items: [] }
    mockDbQuery.pedidos.findMany.mockResolvedValue([expresoPropio])

    const { GET } = await import('@/app/api/repartidor/pedidos/route')
    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { id: string }[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.id).toBe(PEDIDO_UUID)
  })

  it('vendedor → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor', VENDEDOR_USER_ID))

    const { GET } = await import('@/app/api/repartidor/pedidos/route')
    const res = await GET()

    expect(res.status).toBe(403)
    expect(mockDbQuery.pedidos.findMany).not.toHaveBeenCalled()
  })
})

// ─── Tests: PATCH /api/repartidor/pedidos/[id]/entregar ──────────────────────

describe('PATCH /api/repartidor/pedidos/[id]/entregar — rol fabrica', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('fabrica puede entregar expreso con foto → 200, sin registrarPago', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '3000.00', metodoEntrega: 'expreso' }])
    makeUpdateChain([{ id: PEDIDO_UUID, estado: 'entregado', remitoFotoUrl: 'r2/fabrica-foto.jpg' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const req = new NextRequest(`http://localhost/api/repartidor/pedidos/${PEDIDO_UUID}/entregar`, {
      method: 'PATCH',
      body: JSON.stringify({ remitoFotoUrl: 'r2/fabrica-foto.jpg' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(200)
    const body = await res.json() as { data: { estado: string } }
    expect(body.data.estado).toBe('entregado')
    expect(mockRegistrarPago).not.toHaveBeenCalled()
  })

  it('fabrica NO puede entregar camioneta con settlement (settlement ignorado por expreso, o 400 si camioneta)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    // Si el pedido es camioneta (esReparto=true, metodoEntrega=null), fábrica solo tiene el endpoint
    // pero la validación de camioneta requiere firmaUrl+settlement. Sin firmaUrl → 400.
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '3000.00', metodoEntrega: null }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const req = new NextRequest(`http://localhost/api/repartidor/pedidos/${PEDIDO_UUID}/entregar`, {
      method: 'PATCH',
      body: JSON.stringify({ remitoFotoUrl: 'r2/foto.jpg' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    // camioneta schema: requiere firmaUrl, no remitoFotoUrl → 400
    expect(res.status).toBe(400)
    expect(mockRegistrarPago).not.toHaveBeenCalled()
  })

  it('fabrica sin foto en expreso → 400', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '3000.00', metodoEntrega: 'expreso' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const req = new NextRequest(`http://localhost/api/repartidor/pedidos/${PEDIDO_UUID}/entregar`, {
      method: 'PATCH',
      body: JSON.stringify({ remitoFotoUrl: '' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(400)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('vendedor → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor', VENDEDOR_USER_ID))

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const req = new NextRequest(`http://localhost/api/repartidor/pedidos/${PEDIDO_UUID}/entregar`, {
      method: 'PATCH',
      body: JSON.stringify({ remitoFotoUrl: 'r2/foto.jpg' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(403)
    expect(mockDbSelect).not.toHaveBeenCalled()
  })
})
