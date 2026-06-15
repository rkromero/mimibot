/**
 * Tests para GET /api/fabrica/pedidos
 *
 * Cobertura:
 *  - fabrica ve pedidos de TODAS las marcas, con la marca etiquetada por ítem.
 *  - admin también puede acceder.
 *  - un rol de ventas (vendedor) recibe 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuthFn, mockFindManyPedidos } = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockFindManyPedidos: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: { findMany: mockFindManyPedidos },
    },
  },
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

function makeSession(role: string) {
  return { user: { id: 'u1', role, name: 'Test', email: 't@t.com', avatarColor: '#aaa' } }
}

function makeReq() {
  return new NextRequest('http://localhost/api/fabrica/pedidos?estado=confirmado')
}

// Pedido que MEZCLA dos marcas (Mimi + Otra), para verificar el etiquetado por ítem.
const PEDIDO_MULTIMARCA = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  estado: 'confirmado',
  cliente: { id: 'c1', nombre: 'Juan', apellido: 'Pérez' },
  items: [
    { id: 'i1', cantidad: 2, subtotal: '100.00', producto: { id: 'p1', nombre: 'Alfajor', sku: 'MIM-001', marca: { id: 'm-mimi', nombre: 'Mimi' } } },
    { id: 'i2', cantidad: 1, subtotal: '50.00', producto: { id: 'p2', nombre: 'Galleta', sku: 'OTR-001', marca: { id: 'm-otra', nombre: 'Otra' } } },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindManyPedidos.mockResolvedValue([PEDIDO_MULTIMARCA])
})

describe('GET /api/fabrica/pedidos', () => {
  it('fabrica ve pedidos de todas las marcas con la marca etiquetada por ítem', async () => {
    mockAuthFn.mockResolvedValue(makeSession('fabrica'))

    const { GET } = await import('@/app/api/fabrica/pedidos/route')
    const res = await GET(makeReq())
    const body = await res.json() as { data: typeof PEDIDO_MULTIMARCA[] }

    expect(res.status).toBe(200)
    // Fabrica no filtra por marca: ve el pedido completo (todas las marcas).
    expect(mockFindManyPedidos).toHaveBeenCalledTimes(1)
    const marcas = body.data[0]!.items.map((i) => i.producto.marca?.nombre)
    expect(marcas).toEqual(['Mimi', 'Otra'])
  })

  it('admin también puede acceder → 200', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))

    const { GET } = await import('@/app/api/fabrica/pedidos/route')
    const res = await GET(makeReq())

    expect(res.status).toBe(200)
  })

  it('un rol de ventas (vendedor) recibe 403 y no consulta pedidos', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))

    const { GET } = await import('@/app/api/fabrica/pedidos/route')
    const res = await GET(makeReq())

    expect(res.status).toBe(403)
    expect(mockFindManyPedidos).not.toHaveBeenCalled()
  })
})
