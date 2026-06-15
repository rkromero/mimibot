/**
 * Tests para PATCH /api/pedidos/[id]
 *
 * Cobertura de permisos por estado y rol:
 *  1. agent/vendedor puede editar pedido en 'pendiente' → 200
 *  2. agent/vendedor puede editar pedido en 'pendiente_aprobacion' → 200
 *  3. agent/vendedor NO puede editar pedido en 'confirmado' → 403
 *  4. agent/vendedor NO puede editar pedido en 'listo_para_repartir' → 403
 *  5. agent/vendedor NO puede editar pedido en 'en_reparto' → 403
 *  6. agent/vendedor NO puede editar pedido en 'entregado' → 403
 *  7. El error 403 incluye mensaje descriptivo ("administrador")
 *  8. admin puede editar pedido en cualquier estado → 200
 *  9. El bloqueo aplica también a edición de solo observaciones (sin items)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockFindPedido,
  mockFindCliente,
  mockDbUpdate,
  mockActualizarItemsPedido,
  mockValidateUuidParam,
} = vi.hoisted(() => {
  const dbUpdateChain = {
    set: vi.fn(),
    where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{}]) }),
  }
  dbUpdateChain.set.mockReturnValue(dbUpdateChain)

  return {
    mockAuthFn: vi.fn(),
    mockFindPedido: vi.fn(),
    mockFindCliente: vi.fn(),
    mockDbUpdate: vi.fn().mockReturnValue(dbUpdateChain),
    mockActualizarItemsPedido: vi.fn(),
    mockValidateUuidParam: vi.fn().mockReturnValue(null),
  }
})

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: { findFirst: mockFindPedido },
      clientes: { findFirst: mockFindCliente },
    },
    update: mockDbUpdate,
  },
}))

vi.mock('@/lib/pedidos/service', () => ({
  actualizarItemsPedido: mockActualizarItemsPedido,
  confirmarPedido: vi.fn(),
  aprobarPedido: vi.fn(),
  revertirPedidoAAprobacion: vi.fn(),
}))

vi.mock('@/lib/territorios/context', () => ({
  getSessionContext: vi.fn((user: { id: string; role: string }) =>
    Promise.resolve({
      userId: user.id,
      role: user.role,
      territoriosGestionados: [],
      agentesVisibles: [],
    })
  ),
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
  class ValidationError extends Error {
    statusCode = 400
    constructor(m: string) { super(m); this.name = 'ValidationError' }
  }
  return {
    AuthzError, NotFoundError, ValidationError,
    toApiError: (err: unknown) => {
      const e = err as { statusCode?: number; message?: string }
      return { message: e?.message ?? 'Error', status: e?.statusCode ?? 500 }
    },
  }
})

vi.mock('@/lib/clientes/actividad.service', () => ({
  evaluarClienteNuevo: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/authz', () => ({
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/authz/marcas', () => ({
  assertPuedeCargarProductos: vi.fn(),
}))

vi.mock('@/lib/delete/delete.service', () => ({
  deletePedido: vi.fn(),
}))

vi.mock('@/lib/api/validate-params', () => ({
  validateUuidParam: mockValidateUuidParam,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PEDIDO_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const CLIENTE_ID = 'cccccccc-0000-0000-0000-000000000001'
const USER_ID    = 'bbbbbbbb-0000-0000-0000-000000000001'

function makeSession(role: string, id = USER_ID) {
  return { user: { id, role, name: 'Test', email: 'test@test.com', avatarColor: '#aaa' } }
}

function makePedido(estado: string) {
  return {
    id: PEDIDO_ID,
    vendedorId: USER_ID,
    clienteId: CLIENTE_ID,
    estado,
    total: '1000.00',
    descuento: '0',
    montoPagado: '0',
    saldoPendiente: '1000.00',
    estadoPago: 'impago',
    observaciones: null,
    deletedAt: null,
    updatedAt: new Date(),
  }
}

function makeRequest(body: unknown = { items: [{ productoId: '11111111-1111-1111-1111-111111111111', cantidad: 1 }] }) {
  return new NextRequest(`http://localhost/api/pedidos/${PEDIDO_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PATCH /api/pedidos/[id] — permisos por estado y rol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockValidateUuidParam.mockReturnValue(null)
    // Ownership check: cliente asignado al usuario
    mockFindCliente.mockResolvedValue({ id: CLIENTE_ID })
    // actualizarItemsPedido retorna pedido actualizado
    mockActualizarItemsPedido.mockResolvedValue(makePedido('pendiente'))
  })

  // ── Agent/vendedor: estados editables ────────────────────────────────────

  it.each(['pendiente', 'pendiente_aprobacion'])(
    'agent puede editar pedido en estado %s → 200',
    async (estado) => {
      mockAuthFn.mockResolvedValue(makeSession('agent'))
      mockFindPedido.mockResolvedValue(makePedido(estado))

      const { PATCH } = await import('@/app/api/pedidos/[id]/route')
      const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })

      expect(res.status).toBe(200)
      expect(mockActualizarItemsPedido).toHaveBeenCalledWith(
        PEDIDO_ID,
        [{ productoId: '11111111-1111-1111-1111-111111111111', cantidad: 1 }],
        expect.any(Object),
        USER_ID,
      )
    },
  )

  it.each(['pendiente', 'pendiente_aprobacion'])(
    'vendedor puede editar pedido en estado %s → 200',
    async (estado) => {
      mockAuthFn.mockResolvedValue(makeSession('vendedor'))
      mockFindPedido.mockResolvedValue(makePedido(estado))

      const { PATCH } = await import('@/app/api/pedidos/[id]/route')
      const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })

      expect(res.status).toBe(200)
    },
  )

  // ── Agent/vendedor: estados bloqueados ───────────────────────────────────

  it.each(['confirmado', 'listo_para_repartir', 'en_reparto', 'entregado'])(
    'agent NO puede editar pedido en estado %s → 403',
    async (estado) => {
      mockAuthFn.mockResolvedValue(makeSession('agent'))
      mockFindPedido.mockResolvedValue(makePedido(estado))

      const { PATCH } = await import('@/app/api/pedidos/[id]/route')
      const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })

      expect(res.status).toBe(403)
      expect(mockActualizarItemsPedido).not.toHaveBeenCalled()
    },
  )

  it.each(['confirmado', 'listo_para_repartir', 'en_reparto', 'entregado'])(
    'vendedor NO puede editar pedido en estado %s → 403',
    async (estado) => {
      mockAuthFn.mockResolvedValue(makeSession('vendedor'))
      mockFindPedido.mockResolvedValue(makePedido(estado))

      const { PATCH } = await import('@/app/api/pedidos/[id]/route')
      const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })

      expect(res.status).toBe(403)
      expect(mockActualizarItemsPedido).not.toHaveBeenCalled()
    },
  )

  // ── Mensaje de error descriptivo ─────────────────────────────────────────

  it('error 403 incluye "administrador" en el mensaje', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('confirmado'))

    const { PATCH } = await import('@/app/api/pedidos/[id]/route')
    const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })
    const body = await res.json() as { error: string }

    expect(res.status).toBe(403)
    expect(body.error).toMatch(/administrador/i)
  })

  // ── Bloqueo también sin items (solo observaciones) ───────────────────────

  it('agent NO puede editar observaciones de pedido confirmado → 403', async () => {
    mockAuthFn.mockResolvedValue(makeSession('agent'))
    mockFindPedido.mockResolvedValue(makePedido('confirmado'))

    const { PATCH } = await import('@/app/api/pedidos/[id]/route')
    const res = await PATCH(
      makeRequest({ observaciones: 'Nuevo comentario' }),
      { params: Promise.resolve({ id: PEDIDO_ID }) },
    )

    expect(res.status).toBe(403)
  })

  // ── Admin: puede editar en cualquier estado ──────────────────────────────

  it.each(['pendiente', 'pendiente_aprobacion', 'confirmado', 'listo_para_repartir', 'en_reparto', 'entregado'])(
    'admin puede editar pedido en estado %s → 200',
    async (estado) => {
      mockAuthFn.mockResolvedValue(makeSession('admin'))
      mockFindPedido.mockResolvedValue(makePedido(estado))
      mockActualizarItemsPedido.mockResolvedValue(makePedido(estado))

      const { PATCH } = await import('@/app/api/pedidos/[id]/route')
      const res = await PATCH(makeRequest(), { params: Promise.resolve({ id: PEDIDO_ID }) })

      expect(res.status).toBe(200)
      expect(mockActualizarItemsPedido).toHaveBeenCalledWith(
        PEDIDO_ID,
        [{ productoId: '11111111-1111-1111-1111-111111111111', cantidad: 1 }],
        expect.any(Object),
        USER_ID,
      )
    },
  )
})
