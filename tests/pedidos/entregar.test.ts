/**
 * Tests para PATCH /api/repartidor/pedidos/[id]/entregar
 *
 * Cobertura:
 *  1. Expreso con remitoFotoUrl → 200, estado='entregado', sin llamar a registrarPagoPedido
 *  2. Expreso sin remitoFotoUrl → 400, queda en_reparto
 *  3. Expreso con settlement ignorado — igual acepta con solo foto (body mixto)
 *  4. Camioneta con firmaUrl + settlement efectivo → 200
 *  5. Camioneta sin settlement → 400
 *  6. Pedido no en estado en_reparto → 409
 *  7. Rol vendedor → 403
 *  8. Retiro en fábrica (listo_para_repartir): efectivo cobra, a_cuenta deja saldo, exige firma, rechaza fuera de listo_para_repartir
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockDbSelect,
  mockDbUpdate,
  mockRegistrarPago,
  mockValidateUuidParam,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockRegistrarPago: vi.fn().mockResolvedValue(undefined),
  mockValidateUuidParam: vi.fn().mockReturnValue(null),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    query: { pedidos: { findFirst: vi.fn() } },
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
  validateUuidParam: mockValidateUuidParam,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PEDIDO_UUID = 'aaaaaaaa-0000-0000-0000-000000000001'
const USER_ID = 'user-repartidor-1'

function makeSession(role: 'repartidor' | 'admin' | 'vendedor') {
  return { user: { id: USER_ID, role, name: 'Test', email: 'test@test.com', avatarColor: '#aaa' } }
}

function makeSelectChain(rows: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(rows)
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbSelect.mockReturnValue({ from: mockFrom })
  return { mockFrom, mockWhere, mockLimit }
}

function makeUpdateChain(returning: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(returning)
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbUpdate.mockReturnValue({ set: mockSet })
  return { mockSet, mockWhere, mockReturning }
}

function makeRequest(body: unknown, id = PEDIDO_UUID) {
  return new NextRequest(`http://localhost/api/repartidor/pedidos/${id}/entregar`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PATCH /api/repartidor/pedidos/[id]/entregar — expreso', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('1. expreso con remitoFotoUrl → 200 + estado entregado', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '5000.00', metodoEntrega: 'expreso' }])
    const updated = { id: PEDIDO_UUID, estado: 'entregado', remitoFotoUrl: 'r2/foto.jpg' }
    makeUpdateChain([updated])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ remitoFotoUrl: 'r2/foto.jpg' }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )
    const body = await res.json() as { data: { estado: string } }

    expect(res.status).toBe(200)
    expect(body.data.estado).toBe('entregado')
    expect(mockRegistrarPago).not.toHaveBeenCalled()
  })

  it('2. expreso sin remitoFotoUrl → 400, no actualiza DB', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '5000.00', metodoEntrega: 'expreso' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ remitoFotoUrl: '' }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(400)
    expect(mockDbUpdate).not.toHaveBeenCalled()
    expect(mockRegistrarPago).not.toHaveBeenCalled()
  })

  it('2b. expreso sin body remitoFotoUrl (campo ausente) → 400', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '5000.00', metodoEntrega: 'expreso' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ lat: -34.6 }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(400)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('3. expreso + settlement en body → igual acepta (settlement ignorado)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '5000.00', metodoEntrega: 'expreso' }])
    makeUpdateChain([{ id: PEDIDO_UUID, estado: 'entregado' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ remitoFotoUrl: 'r2/foto.jpg', settlement: { tipo: 'efectivo', monto: 1000 } }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(200)
    // expreso nunca llama a registrarPagoPedido aunque venga settlement
    expect(mockRegistrarPago).not.toHaveBeenCalled()
  })

  it('expreso: el update incluye remitoFotoUrl en los campos seteados', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '0.00', metodoEntrega: 'expreso' }])
    const { mockSet } = makeUpdateChain([{ id: PEDIDO_UUID, estado: 'entregado' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    await PATCH(
      makeRequest({ remitoFotoUrl: 'r2/remito-firmado.jpg' }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'entregado',
      remitoFotoUrl: 'r2/remito-firmado.jpg',
      entregadoPor: USER_ID,
    }))
  })
})

describe('PATCH /api/repartidor/pedidos/[id]/entregar — camioneta', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('4. camioneta con firmaUrl + settlement efectivo → 200', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '5000.00', metodoEntrega: null }])
    makeUpdateChain([{ id: PEDIDO_UUID, estado: 'entregado' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ firmaUrl: 'r2/firma.png', settlement: { tipo: 'efectivo', monto: 5000 } }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(200)
    expect(mockRegistrarPago).toHaveBeenCalledOnce()
  })

  it('5. camioneta sin settlement → 400', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'en_reparto', saldoPendiente: '5000.00', metodoEntrega: null }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ firmaUrl: 'r2/firma.png' }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(400)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/repartidor/pedidos/[id]/entregar — retiro_fabrica', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('retiro en listo_para_repartir + settlement efectivo → 200 + entregado + pago registrado', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'listo_para_repartir', saldoPendiente: '5000.00', metodoEntrega: 'retiro_fabrica' }])
    makeUpdateChain([{ id: PEDIDO_UUID, estado: 'entregado' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ firmaUrl: 'r2/firma.png', settlement: { tipo: 'efectivo', monto: 5000 } }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )
    const body = await res.json() as { data: { estado: string } }

    expect(res.status).toBe(200)
    expect(body.data.estado).toBe('entregado')
    expect(mockRegistrarPago).toHaveBeenCalledOnce()
  })

  it('retiro en listo_para_repartir + settlement a_cuenta → 200 + entregado, sin registrar pago (saldo intacto)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'listo_para_repartir', saldoPendiente: '5000.00', metodoEntrega: 'retiro_fabrica' }])
    const { mockSet } = makeUpdateChain([{ id: PEDIDO_UUID, estado: 'entregado' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ firmaUrl: 'r2/firma.png', settlement: { tipo: 'a_cuenta' } }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(200)
    // a_cuenta no registra pago: el saldoPendiente queda intacto (impago/parcial)
    expect(mockRegistrarPago).not.toHaveBeenCalled()
    // firma siempre, sin tocar remitoFotoUrl
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'entregado',
      firmaUrl: 'r2/firma.png',
      entregadoPor: USER_ID,
    }))
  })

  it('retiro NO en listo_para_repartir (confirmado) → 409, no actualiza DB', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'confirmado', saldoPendiente: '5000.00', metodoEntrega: 'retiro_fabrica' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ firmaUrl: 'r2/firma.png', settlement: { tipo: 'efectivo', monto: 5000 } }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(409)
    expect(mockDbUpdate).not.toHaveBeenCalled()
    expect(mockRegistrarPago).not.toHaveBeenCalled()
  })

  it('retiro sin firmaUrl → 400 (firma siempre requerida)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'listo_para_repartir', saldoPendiente: '5000.00', metodoEntrega: 'retiro_fabrica' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ settlement: { tipo: 'efectivo', monto: 5000 } }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(400)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/repartidor/pedidos/[id]/entregar — estado y auth', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('6. pedido no en en_reparto → 409', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    makeSelectChain([{ id: PEDIDO_UUID, estado: 'entregado', saldoPendiente: '0.00', metodoEntrega: 'expreso' }])

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ remitoFotoUrl: 'r2/foto.jpg' }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(409)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('7. rol vendedor → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))

    const { PATCH } = await import('@/app/api/repartidor/pedidos/[id]/entregar/route')
    const res = await PATCH(
      makeRequest({ remitoFotoUrl: 'r2/foto.jpg' }),
      { params: Promise.resolve({ id: PEDIDO_UUID }) },
    )

    expect(res.status).toBe(403)
    expect(mockDbSelect).not.toHaveBeenCalled()
  })
})
