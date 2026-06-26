/**
 * Tests para POST /api/admin/pedidos/[id]/liberar-reparto
 *
 * Saca un pedido de un repartidor y lo devuelve al pool (listo_para_repartir).
 *
 * Cobertura:
 *  1. pedido en_reparto → 200, queda listo_para_repartir y limpia repartidorId/aceptadoAt/ordenRuta
 *  2. pedido con estado inválido (no en_reparto) → 409, no actualiza DB
 *  3. pedido no encontrado → 404
 *  4. rol vendedor → 403 (ni siquiera consulta la DB)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockPedidosFindFirst,
  mockDbUpdate,
  mockValidateUuidParam,
} = vi.hoisted(() => ({
  mockAuthFn: vi.fn(),
  mockPedidosFindFirst: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockValidateUuidParam: vi.fn().mockReturnValue(null),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    query: { pedidos: { findFirst: mockPedidosFindFirst } },
    update: mockDbUpdate,
  },
}))

vi.mock('@/lib/authz', () => ({
  requireAdminOrGerente: (user: { role: string }) => {
    if (user.role !== 'admin' && user.role !== 'gerente') {
      const e = new Error('Acción no permitida para tu rol') as Error & { statusCode: number }
      e.statusCode = 403
      throw e
    }
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

vi.mock('@/lib/api/validate-params', () => ({
  validateUuidParam: mockValidateUuidParam,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PEDIDO_UUID = 'aaaaaaaa-0000-0000-0000-000000000001'

function makeSession(role: 'admin' | 'gerente' | 'vendedor' | 'repartidor') {
  return { user: { id: 'user-1', role, name: 'Test', email: 'test@test.com', avatarColor: '#aaa' } }
}

function makeUpdateChain(returning: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(returning)
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbUpdate.mockReturnValue({ set: mockSet })
  return { mockSet, mockWhere, mockReturning }
}

function callRoute(id = PEDIDO_UUID) {
  return import('@/app/api/admin/pedidos/[id]/liberar-reparto/route').then(({ POST }) =>
    POST(
      new NextRequest(`http://localhost/api/admin/pedidos/${id}/liberar-reparto`, { method: 'POST' }),
      { params: Promise.resolve({ id }) },
    ),
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/admin/pedidos/[id]/liberar-reparto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateUuidParam.mockReturnValue(null)
  })

  it('1. pedido en_reparto → 200, vuelve al pool y limpia la asignación', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'en_reparto' })
    const { mockSet } = makeUpdateChain([
      { id: PEDIDO_UUID, estado: 'listo_para_repartir', repartidorId: null, aceptadoAt: null, ordenRuta: null },
    ])

    const res = await callRoute()
    const body = await res.json() as { data: { estado: string; repartidorId: null } }

    expect(res.status).toBe(200)
    expect(body.data.estado).toBe('listo_para_repartir')
    expect(body.data.repartidorId).toBeNull()
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'listo_para_repartir',
      repartidorId: null,
      aceptadoAt: null,
      ordenRuta: null,
    }))
  })

  it('2. estado inválido (no en_reparto) → 409, no actualiza DB', async () => {
    mockAuthFn.mockResolvedValue(makeSession('gerente'))
    mockPedidosFindFirst.mockResolvedValue({ id: PEDIDO_UUID, estado: 'entregado' })

    const res = await callRoute()
    const body = await res.json() as { error: string }

    expect(res.status).toBe(409)
    expect(body.error).toMatch(/en reparto/i)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('3. pedido no encontrado → 404', async () => {
    mockAuthFn.mockResolvedValue(makeSession('admin'))
    mockPedidosFindFirst.mockResolvedValue(undefined)

    const res = await callRoute()

    expect(res.status).toBe(404)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('4. rol vendedor → 403, ni consulta la DB', async () => {
    mockAuthFn.mockResolvedValue(makeSession('vendedor'))

    const res = await callRoute()

    expect(res.status).toBe(403)
    expect(mockPedidosFindFirst).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })
})
