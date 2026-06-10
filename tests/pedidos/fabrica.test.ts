/**
 * Tests para el rol 'fabrica' en pedidos y clientes.
 *
 * Cobertura:
 *  1. POST /api/pedidos/[id]/en-reparto — fábrica sobre 'confirmado' → 200 + estado 'en_reparto'
 *  2. POST /api/pedidos/[id]/en-reparto — fábrica sobre estado distinto → 409 sin cambios
 *  3. POST /api/pedidos/[id]/en-reparto — rol vendedor → 403
 *  4. GET  /api/pedidos — fábrica recibe 200 (alcance global, sin filtro de vendedor)
 *  5. POST /api/pedidos — fábrica recibe 403
 *  6. GET  /api/clientes — fábrica recibe 403
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockPedidosFindFirst,
  mockDbUpdate,
  mockDbSelect,
  mockGetSessionContext,
  mockValidateUuidParam,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockPedidosFindFirst: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
  mockGetSessionContext: vi.fn(),
  mockValidateUuidParam: vi.fn().mockReturnValue(null),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: { findFirst: mockPedidosFindFirst },
      clientes: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    update: mockDbUpdate,
    select: mockDbSelect,
    insert: vi.fn(),
  },
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
    AuthzError,
    NotFoundError,
    ConflictError,
    ValidationError,
    toApiError: (err: unknown) => {
      const e = err as { statusCode?: number; message?: string }
      return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
    },
  }
})

vi.mock('@/lib/territorios/context', () => ({
  getSessionContext: mockGetSessionContext,
}))

vi.mock('@/lib/api/validate-params', () => ({
  validateUuidParam: mockValidateUuidParam,
}))

vi.mock('@/lib/api/pagination', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, limit: 50, sortBy: 'fecha', sortDir: 'desc', search: '' }),
}))

vi.mock('@/lib/api/cache', () => ({
  cachedJson: vi.fn((_req: unknown, body: unknown) => {
    const { NextResponse } = require('next/server') as typeof import('next/server')
    return NextResponse.json(body)
  }),
}))

vi.mock('@/lib/pedidos/service', () => ({
  crearPedidoConItems: vi.fn(),
  confirmarPedido: vi.fn(),
  aprobarPedido: vi.fn(),
  revertirPedidoAAprobacion: vi.fn(),
}))

vi.mock('@/lib/clientes/actividad.service', () => ({ evaluarClienteNuevo: vi.fn() }))
vi.mock('@/lib/authz', () => ({
  requireAdmin: vi.fn(),
  requireAdminOrGerente: vi.fn(),
  requireNotAgent: vi.fn(),
  withAdminAuth: vi.fn(async (fn: () => unknown) => fn()),
}))

// ─── Constants ────────────────────────────────────────────────────────────────

const PEDIDO_UUID = 'aaaaaaaa-0000-0000-0000-000000000001'

function makeSession(role: 'fabrica' | 'admin' | 'vendedor' | 'agent') {
  return { user: { id: 'user-1', role, name: 'Test', email: 'test@test.com', avatarColor: '#aaa' } }
}

function makeCtx(role: 'fabrica' | 'admin' | 'vendedor' | 'agent') {
  return { userId: 'user-1', role, territoriosGestionados: [], agentesVisibles: [], territoriosActivos: [] }
}

function makeUpdateChain(returning: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(returning)
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbUpdate.mockReturnValue({ set: mockSet })
  return { mockSet, mockWhere, mockReturning }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/pedidos/[id]/en-reparto', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('1. fábrica sobre pedido confirmado → 200 + estado en_reparto', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'confirmado' })
    const updatedPedido = { id: PEDIDO_UUID, estado: 'en_reparto' }
    makeUpdateChain([updatedPedido])

    const { POST } = await import('@/app/api/pedidos/[id]/en-reparto/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/en-reparto`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })
    const body = await res.json() as { data: { estado: string } }

    expect(res.status).toBe(200)
    expect(body.data.estado).toBe('en_reparto')
  })

  it('2. fábrica sobre pedido pendiente → 409 sin modificar', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'pendiente' })

    const { POST } = await import('@/app/api/pedidos/[id]/en-reparto/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/en-reparto`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })
    const body = await res.json() as { error: string }

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/confirmado/)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('2b. fábrica sobre pedido entregado → 409 sin modificar', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'entregado' })

    const { POST } = await import('@/app/api/pedidos/[id]/en-reparto/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/en-reparto`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(409)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('3. vendedor (no fabrica ni admin) → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))

    const { POST } = await import('@/app/api/pedidos/[id]/en-reparto/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/en-reparto`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(403)
    expect(mockPedidosFindFirst).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('3b. agent → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))

    const { POST } = await import('@/app/api/pedidos/[id]/en-reparto/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/en-reparto`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(403)
  })

  it('admin puede ejecutar la transición', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'confirmado' })
    makeUpdateChain([{ id: PEDIDO_UUID, estado: 'en_reparto' }])

    const { POST } = await import('@/app/api/pedidos/[id]/en-reparto/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/en-reparto`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(200)
  })
})

describe('POST /api/pedidos/[id]/listo-para-repartir', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('camioneta (esReparto=true) en confirmado → 200 + listo_para_repartir', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'confirmado', esReparto: true, metodoEntrega: null })
    makeUpdateChain([{ id: PEDIDO_UUID, estado: 'listo_para_repartir' }])

    const { POST } = await import('@/app/api/pedidos/[id]/listo-para-repartir/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/listo-para-repartir`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })
    const body = await res.json() as { data: { estado: string } }

    expect(res.status).toBe(200)
    expect(body.data.estado).toBe('listo_para_repartir')
  })

  it('expreso (metodoEntrega=expreso) en confirmado → 200 + listo_para_repartir', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'confirmado', esReparto: false, metodoEntrega: 'expreso' })
    makeUpdateChain([{ id: PEDIDO_UUID, estado: 'listo_para_repartir' }])

    const { POST } = await import('@/app/api/pedidos/[id]/listo-para-repartir/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/listo-para-repartir`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })
    const body = await res.json() as { data: { estado: string } }

    expect(res.status).toBe(200)
    expect(body.data.estado).toBe('listo_para_repartir')
  })

  it('expreso sin foto enviado — no se registra pago (no llama a ningún servicio de pago)', async () => {
    // Este test verifica que el endpoint listo-para-repartir no toca pago en absoluto
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'confirmado', esReparto: false, metodoEntrega: 'expreso' })
    makeUpdateChain([{ id: PEDIDO_UUID, estado: 'listo_para_repartir' }])

    const { POST } = await import('@/app/api/pedidos/[id]/listo-para-repartir/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/listo-para-repartir`, { method: 'POST' })
    await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    // El update solo debe llamarse una vez (el estado), sin ningún insert de pago
    expect(mockDbUpdate).toHaveBeenCalledTimes(1)
  })

  it('retiro_fabrica (esReparto=false, metodoEntrega=retiro_fabrica) → 409', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'confirmado', esReparto: false, metodoEntrega: 'retiro_fabrica' })

    const { POST } = await import('@/app/api/pedidos/[id]/listo-para-repartir/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/listo-para-repartir`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(409)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('expreso en estado listo_para_repartir (ya procesado) → 409', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'listo_para_repartir', esReparto: false, metodoEntrega: 'expreso' })

    const { POST } = await import('@/app/api/pedidos/[id]/listo-para-repartir/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/listo-para-repartir`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(409)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('vendedor → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))

    const { POST } = await import('@/app/api/pedidos/[id]/listo-para-repartir/route')
    const req = new NextRequest(`http://localhost/api/pedidos/${PEDIDO_UUID}/listo-para-repartir`, { method: 'POST' })
    const res = await POST(req, { params: Promise.resolve({ id: PEDIDO_UUID }) })

    expect(res.status).toBe(403)
    expect(mockPedidosFindFirst).not.toHaveBeenCalled()
  })
})

describe('GET /api/pedidos — rol fábrica', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('4. fábrica recibe 200 con alcance global (sin filtro por vendedor)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockGetSessionContext.mockResolvedValue(makeCtx('fabrica'))

    // count query
    mockDbSelect.mockReturnValueOnce({
      from: () => ({ innerJoin: () => ({ innerJoin: () => ({ where: () => Promise.resolve([{ total: 0 }]) }) }) }),
    })
    // rows query
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({ limit: () => ({ offset: () => Promise.resolve([]) }) }),
            }),
          }),
        }),
      }),
    })

    const { GET } = await import('@/app/api/pedidos/route')
    const req = new NextRequest('http://localhost/api/pedidos?estado=confirmado')
    const res = await GET(req)
    const body = await res.json() as { data: unknown[] }

    expect(res.status).toBe(200)
    expect(body.data).toEqual([])
  })
})

describe('POST /api/pedidos — rol fábrica', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('5. fábrica no puede crear pedidos → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockGetSessionContext.mockResolvedValue(makeCtx('fabrica'))

    const { POST } = await import('@/app/api/pedidos/route')
    const req = new NextRequest('http://localhost/api/pedidos', {
      method: 'POST',
      body: JSON.stringify({ clienteId: PEDIDO_UUID, items: [] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    expect(res.status).toBe(403)
  })
})

describe('GET /api/clientes — rol fábrica', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('6. fábrica recibe 403 en listado de clientes', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))
    mockGetSessionContext.mockResolvedValue(makeCtx('fabrica'))

    const { GET } = await import('@/app/api/clientes/route')
    const req = new NextRequest('http://localhost/api/clientes')
    const res = await GET(req)

    expect(res.status).toBe(403)
  })
})
