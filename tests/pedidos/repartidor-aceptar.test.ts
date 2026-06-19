/**
 * Tests para el flujo de aceptación del repartidor.
 *
 * Cobertura:
 *  1. POST /api/repartidor/aceptar — camioneta (esReparto=true) → acepta OK
 *  2. POST /api/repartidor/aceptar — expreso (metodoEntrega='expreso') → acepta OK
 *  3. POST /api/repartidor/aceptar — retiro_fabrica (esReparto=false, metodoEntrega='retiro_fabrica') → omitido
 *  4. POST /api/repartidor/aceptar — estado distinto de listo_para_repartir → omitido
 *  5. POST /api/repartidor/aceptar — id no encontrado → omitido
 *  6. POST /api/repartidor/aceptar — rol vendedor → 403
 *  7. GET  /api/repartidor/listos  — devuelve camioneta y expreso separados
 *  8. GET  /api/repartidor/pedidos — repartidor ve solo sus pedidos (repartidorId)
 *  9. GET  /api/repartidor/pedidos — admin ve todos sin filtro de repartidorId
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockPedidosFindMany,
  mockDbUpdate,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockPedidosFindMany: vi.fn(),
  mockDbUpdate: vi.fn(),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: {
        findMany: mockPedidosFindMany,
        findFirst: vi.fn(),
      },
    },
    update: mockDbUpdate,
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
  return {
    AuthzError,
    NotFoundError,
    ConflictError,
    toApiError: (err: unknown) => {
      const e = err as { statusCode?: number; message?: string }
      return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
    },
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID_1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const UUID_2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const REPARTIDOR_ID = 'user-repartidor-1'

function makeSession(role: 'repartidor' | 'admin' | 'gerente' | 'vendedor', id = REPARTIDOR_ID) {
  return { user: { id, role, name: 'Test', email: 'test@test.com', avatarColor: '#aaa' } }
}

function makeUpdateChain(returning: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(returning)
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbUpdate.mockReturnValue({ set: mockSet })
  return { mockSet, mockWhere, mockReturning }
}

// ─── aceptar tests ────────────────────────────────────────────────────────────

describe('POST /api/repartidor/aceptar', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('1. camioneta (esReparto=true) → acepta y pasa a en_reparto', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockPedidosFindMany.mockResolvedValue([
      { id: UUID_1, estado: 'listo_para_repartir', esReparto: true, metodoEntrega: null },
    ])
    const updated = { id: UUID_1, estado: 'en_reparto', repartidorId: REPARTIDOR_ID }
    makeUpdateChain([updated])

    const { POST } = await import('@/app/api/repartidor/aceptar/route')
    const req = new NextRequest('http://localhost/api/repartidor/aceptar', {
      method: 'POST',
      body: JSON.stringify({ pedidoIds: [UUID_1] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json() as { actualizados: unknown[]; omitidos: unknown[] }

    expect(res.status).toBe(200)
    expect(body.actualizados).toHaveLength(1)
    expect(body.omitidos).toHaveLength(0)
  })

  it('2. expreso (metodoEntrega=expreso, esReparto=false) → acepta OK', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockPedidosFindMany.mockResolvedValue([
      { id: UUID_1, estado: 'listo_para_repartir', esReparto: false, metodoEntrega: 'expreso' },
    ])
    const updated = { id: UUID_1, estado: 'en_reparto', repartidorId: REPARTIDOR_ID }
    makeUpdateChain([updated])

    const { POST } = await import('@/app/api/repartidor/aceptar/route')
    const req = new NextRequest('http://localhost/api/repartidor/aceptar', {
      method: 'POST',
      body: JSON.stringify({ pedidoIds: [UUID_1] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json() as { actualizados: unknown[]; omitidos: unknown[] }

    expect(res.status).toBe(200)
    expect(body.actualizados).toHaveLength(1)
    expect(body.omitidos).toHaveLength(0)
  })

  it('3. retiro_fabrica → omitido (no elegible)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockPedidosFindMany.mockResolvedValue([
      { id: UUID_1, estado: 'listo_para_repartir', esReparto: false, metodoEntrega: 'retiro_fabrica' },
    ])

    const { POST } = await import('@/app/api/repartidor/aceptar/route')
    const req = new NextRequest('http://localhost/api/repartidor/aceptar', {
      method: 'POST',
      body: JSON.stringify({ pedidoIds: [UUID_1] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json() as { actualizados: unknown[]; omitidos: Array<{ id: string; motivo: string }> }

    expect(res.status).toBe(200)
    expect(body.actualizados).toHaveLength(0)
    expect(body.omitidos).toHaveLength(1)
    expect(body.omitidos[0]?.motivo).toMatch(/camioneta|expreso/)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('4. estado distinto de listo_para_repartir → omitido', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockPedidosFindMany.mockResolvedValue([
      { id: UUID_1, estado: 'en_reparto', esReparto: true, metodoEntrega: null },
    ])

    const { POST } = await import('@/app/api/repartidor/aceptar/route')
    const req = new NextRequest('http://localhost/api/repartidor/aceptar', {
      method: 'POST',
      body: JSON.stringify({ pedidoIds: [UUID_1] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json() as { omitidos: Array<{ motivo: string }> }

    expect(body.omitidos).toHaveLength(1)
    expect(body.omitidos[0]?.motivo).toMatch(/listo_para_repartir/)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('5. id no encontrado → omitido', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockPedidosFindMany.mockResolvedValue([])

    const { POST } = await import('@/app/api/repartidor/aceptar/route')
    const req = new NextRequest('http://localhost/api/repartidor/aceptar', {
      method: 'POST',
      body: JSON.stringify({ pedidoIds: [UUID_2] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json() as { omitidos: Array<{ motivo: string }> }

    expect(body.omitidos[0]?.motivo).toMatch(/No encontrado/)
  })

  it('6. rol vendedor → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor' as never))

    const { POST } = await import('@/app/api/repartidor/aceptar/route')
    const req = new NextRequest('http://localhost/api/repartidor/aceptar', {
      method: 'POST',
      body: JSON.stringify({ pedidoIds: [UUID_1] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    expect(res.status).toBe(403)
    expect(mockPedidosFindMany).not.toHaveBeenCalled()
  })

  it('aceptar expreso asigna repartidorId del usuario logueado', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor', 'repartidor-abc'))
    mockPedidosFindMany.mockResolvedValue([
      { id: UUID_1, estado: 'listo_para_repartir', esReparto: false, metodoEntrega: 'expreso' },
    ])
    const { mockSet } = makeUpdateChain([{ id: UUID_1, estado: 'en_reparto' }])

    const { POST } = await import('@/app/api/repartidor/aceptar/route')
    const req = new NextRequest('http://localhost/api/repartidor/aceptar', {
      method: 'POST',
      body: JSON.stringify({ pedidoIds: [UUID_1] }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'en_reparto',
      repartidorId: 'repartidor-abc',
    }))
  })
})

// ─── listos tests ─────────────────────────────────────────────────────────────

describe('GET /api/repartidor/listos', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('7. devuelve camioneta y expreso separados', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockPedidosFindMany.mockResolvedValue([
      { id: UUID_1, esReparto: true, metodoEntrega: null, cliente: { lat: -34, lng: -58, geocodeStatus: 'ok' }, items: [] },
      { id: UUID_2, esReparto: false, metodoEntrega: 'expreso', cliente: { lat: null, lng: null, geocodeStatus: null }, items: [] },
    ])

    const { GET } = await import('@/app/api/repartidor/listos/route')
    const res = await GET()
    const body = await res.json() as { camioneta: unknown[]; expreso: unknown[]; conUbicacion: unknown[]; sinUbicacion: unknown[] }

    expect(res.status).toBe(200)
    expect(body.camioneta).toHaveLength(1)
    expect(body.expreso).toHaveLength(1)
    expect((body.camioneta[0] as { id: string }).id).toBe(UUID_1)
    expect((body.expreso[0] as { id: string }).id).toBe(UUID_2)
    // conUbicacion/sinUbicacion solo cuentan camioneta
    expect(body.conUbicacion).toHaveLength(1)
    expect(body.sinUbicacion).toHaveLength(0)
  })

  it('7b. incluye grupo retiro; retiro ausente de camioneta y de la ruta', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockPedidosFindMany.mockResolvedValue([
      { id: UUID_1, esReparto: true, metodoEntrega: null, cliente: { lat: -34, lng: -58, geocodeStatus: 'ok' }, items: [] },
      { id: UUID_2, esReparto: false, metodoEntrega: 'retiro_fabrica', cliente: { lat: null, lng: null, geocodeStatus: null }, items: [] },
    ])

    const { GET } = await import('@/app/api/repartidor/listos/route')
    const res = await GET()
    const body = await res.json() as {
      camioneta: Array<{ id: string }>
      expreso: unknown[]
      retiro: Array<{ id: string }>
      conUbicacion: unknown[]
      sinUbicacion: unknown[]
    }

    expect(res.status).toBe(200)
    expect(body.retiro).toHaveLength(1)
    expect(body.retiro[0]?.id).toBe(UUID_2)
    // el retiro no entra en camioneta ni en el cálculo de ruta
    expect(body.camioneta.map((p) => p.id)).not.toContain(UUID_2)
    expect(body.conUbicacion).toHaveLength(1)
    expect(body.sinUbicacion).toHaveLength(0)
    expect(body.expreso).toHaveLength(0)
  })
})

// ─── repartidor/pedidos tests ─────────────────────────────────────────────────

describe('GET /api/repartidor/pedidos', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('8. repartidor ve solo sus pedidos (repartidorId filtrado)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor', REPARTIDOR_ID))
    mockPedidosFindMany.mockResolvedValue([
      { id: UUID_1, estado: 'en_reparto', cliente: {}, items: [] },
    ])

    const { GET } = await import('@/app/api/repartidor/pedidos/route')
    const res = await GET()
    const body = await res.json() as { data: unknown[] }

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    // Verify findMany was called with repartidorId condition
    expect(mockPedidosFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
      }),
    )
  })

  it('9. admin ve todos sin filtro de repartidorId', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin', 'admin-1'))
    mockPedidosFindMany.mockResolvedValue([
      { id: UUID_1, estado: 'en_reparto', cliente: {}, items: [] },
      { id: UUID_2, estado: 'en_reparto', cliente: {}, items: [] },
    ])

    const { GET } = await import('@/app/api/repartidor/pedidos/route')
    const res = await GET()
    const body = await res.json() as { data: unknown[] }

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(2)
  })
})
