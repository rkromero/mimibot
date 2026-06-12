/**
 * Tests de los endpoints de ruta de reparto.
 *
 * Cobertura:
 *  (e) POST /api/repartidor/optimizar-ruta:
 *       - 400 con coordenadas inválidas
 *       - 403 con rol no autorizado
 *       - los pedidos sin coordenadas quedan últimos en orden_ruta
 *       - un repartidor solo optimiza sus propios pedidos (filtro por repartidorId)
 *  (f) GET /api/repartidor/pedidos: orderBy por orden_ruta asc con NULLs al final.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockPedidosFindMany,
  mockTransaction,
  mockOptimizarRuta,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockPedidosFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockOptimizarRuta: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    query: { pedidos: { findMany: mockPedidosFindMany } },
    transaction: mockTransaction,
  },
}))

vi.mock('@/lib/geo/route-optimizer.service', () => ({
  optimizarRuta: mockOptimizarRuta,
}))

vi.mock('@/lib/errors', () => {
  class AuthzError extends Error {
    statusCode = 403
    constructor(m = 'No autorizado') { super(m); this.name = 'AuthzError' }
  }
  return {
    AuthzError,
    toApiError: (err: unknown) => {
      const e = err as { statusCode?: number; message?: string }
      return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
    },
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dialect = new PgDialect()
const REPARTIDOR_ID = 'repartidor-1'

function makeSession(role: 'repartidor' | 'admin' | 'gerente' | 'fabrica' | 'vendedor', id = REPARTIDOR_ID) {
  return { user: { id, role, name: 'Test', email: 'test@test.com', avatarColor: '#aaa' } }
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/repartidor/optimizar-ruta', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Mock de tx que captura cada update con su orden_ruta y el id apuntado por el where. */
function makeTxMock() {
  const updates: Array<{ id: string; ordenRuta: number }> = []
  const tx = {
    update: vi.fn(() => {
      let vals: { ordenRuta?: number } = {}
      return {
        set: vi.fn((v: { ordenRuta?: number }) => {
          vals = v
          return {
            where: vi.fn((cond: SQL) => {
              const { params } = dialect.sqlToQuery(cond)
              updates.push({ id: String(params[0]), ordenRuta: Number(vals.ordenRuta) })
              return Promise.resolve(undefined)
            }),
          }
        }),
      }
    }),
  }
  mockTransaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx))
  return { tx, updates }
}

// ─── (e) POST /api/repartidor/optimizar-ruta ───────────────────────────────────

describe('POST /api/repartidor/optimizar-ruta', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('(e) 400 con coordenadas inválidas (lat fuera de rango)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    const { POST } = await import('@/app/api/repartidor/optimizar-ruta/route')
    const res = await POST(makeReq({ lat: 200, lng: 0 }))
    expect(res.status).toBe(400)
    expect(mockPedidosFindMany).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('(e) 400 con lat/lng no numéricos', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    const { POST } = await import('@/app/api/repartidor/optimizar-ruta/route')
    const res = await POST(makeReq({ lat: 'abc', lng: null }))
    expect(res.status).toBe(400)
  })

  it('(e) 403 con rol no autorizado (vendedor)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))
    const { POST } = await import('@/app/api/repartidor/optimizar-ruta/route')
    const res = await POST(makeReq({ lat: 0, lng: 0 }))
    expect(res.status).toBe(403)
    expect(mockPedidosFindMany).not.toHaveBeenCalled()
  })

  it('(e) los pedidos sin coordenadas quedan últimos en orden_ruta', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockPedidosFindMany.mockResolvedValue([
      { id: 'with1', cliente: { lat: 0, lng: 1 } },
      { id: 'with2', cliente: { lat: 0, lng: 2 } },
      { id: 'no1', cliente: { lat: null, lng: null } },
    ])
    // El optimizador reordena los geolocalizados (with2 antes que with1).
    mockOptimizarRuta.mockResolvedValue(['with2', 'with1'])
    const { updates } = makeTxMock()

    const { POST } = await import('@/app/api/repartidor/optimizar-ruta/route')
    const res = await POST(makeReq({ lat: 0, lng: 0 }))
    const body = await res.json() as { data: { ordenados: number; sinUbicacion: number } }

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ ordenados: 2, sinUbicacion: 1 })

    // Persistencia 1-based; el sin-coordenadas continúa la numeración al final.
    expect(updates).toEqual([
      { id: 'with2', ordenRuta: 1 },
      { id: 'with1', ordenRuta: 2 },
      { id: 'no1', ordenRuta: 3 },
    ])

    // El optimizador recibe solo las paradas con coordenadas.
    expect(mockOptimizarRuta).toHaveBeenCalledWith(
      { lat: 0, lng: 0 },
      [
        { pedidoId: 'with1', lat: 0, lng: 1 },
        { pedidoId: 'with2', lat: 0, lng: 2 },
      ],
    )
  })

  it('(e) un repartidor solo optimiza sus propios pedidos (filtro por repartidorId)', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor', 'repartidor-1'))
    mockPedidosFindMany.mockResolvedValue([])
    mockOptimizarRuta.mockResolvedValue([])
    makeTxMock()

    const { POST } = await import('@/app/api/repartidor/optimizar-ruta/route')
    const res = await POST(makeReq({ lat: -34.6, lng: -58.4 }))

    expect(res.status).toBe(200)
    const call = mockPedidosFindMany.mock.calls[0]?.[0] as { where: SQL }
    const { params } = dialect.sqlToQuery(call.where)
    // El where filtra por el repartidorId de la sesión → aislamiento entre repartidores.
    expect(params).toContain('repartidor-1')
  })

  it('(e) admin no filtra por repartidorId', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin', 'admin-1'))
    mockPedidosFindMany.mockResolvedValue([])
    mockOptimizarRuta.mockResolvedValue([])
    makeTxMock()

    const { POST } = await import('@/app/api/repartidor/optimizar-ruta/route')
    await POST(makeReq({ lat: -34.6, lng: -58.4 }))

    const call = mockPedidosFindMany.mock.calls[0]?.[0] as { where: SQL }
    const { params } = dialect.sqlToQuery(call.where)
    expect(params).not.toContain('admin-1')
  })
})

// ─── (f) GET /api/repartidor/pedidos: orden por orden_ruta ─────────────────────

describe('GET /api/repartidor/pedidos', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('(f) ordena por orden_ruta asc con NULLs al final, luego fecha desc', async () => {
    mockAuthFn.mockResolvedValue(makeSession('repartidor'))
    mockPedidosFindMany.mockResolvedValue([])

    const { GET } = await import('@/app/api/repartidor/pedidos/route')
    const res = await GET()
    expect(res.status).toBe(200)

    const call = mockPedidosFindMany.mock.calls[0]?.[0] as { orderBy: SQL[] }
    expect(call.orderBy).toHaveLength(2)
    const rendered = call.orderBy.map((o) => dialect.sqlToQuery(o).sql.toLowerCase())
    expect(rendered[0]).toMatch(/orden_ruta.*asc nulls last/)
    expect(rendered[1]).toMatch(/fecha.*desc/)
  })
})
