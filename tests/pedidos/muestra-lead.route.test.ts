/**
 * Tests para /api/leads/[id]/muestra
 *
 *  1. Admin carga muestra con retiro en fábrica → 201 y el pedido nace en
 *     pendiente de aprobación (crearComoPendienteAprobacion: true) con
 *     metodoEntrega = retiro_fabrica.
 *  2. Sin método de entrega → 400 y no se crea el pedido.
 *  3. Expreso nuevo → se guarda en la ficha del cliente y viaja al pedido.
 *  4. Expreso sin datos y cliente sin expreso guardado → 400.
 *  5. Expreso sin datos y cliente con expreso guardado → usa el de la ficha.
 *  6. El activity log registra el método de entrega.
 *  7. GET devuelve el expreso guardado del cliente vinculado al lead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthFn,
  mockFindLead,
  mockFindMarca,
  mockFindProducto,
  mockFindCliente,
  mockTxFindCliente,
  mockTxUpdateSet,
  mockTxUpdateWhere,
  mockDbInsertValues,
  mockCrearPedidoConItems,
  mockObtenerOCrearCliente,
  mockRegistrarPagoPedido,
} = vi.hoisted(() => ({
  mockRegistrarPagoPedido: vi.fn(),
  mockAuthFn: vi.fn(),
  mockFindLead: vi.fn(),
  mockFindMarca: vi.fn(),
  mockFindProducto: vi.fn(),
  mockFindCliente: vi.fn(),
  mockTxFindCliente: vi.fn(),
  mockTxUpdateSet: vi.fn(),
  mockTxUpdateWhere: vi.fn(),
  mockDbInsertValues: vi.fn().mockResolvedValue(undefined),
  mockCrearPedidoConItems: vi.fn(),
  mockObtenerOCrearCliente: vi.fn(),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }))

vi.mock('@/db', () => {
  const tx = {
    query: { clientes: { findFirst: mockTxFindCliente } },
    update: () => ({
      set: (values: unknown) => {
        mockTxUpdateSet(values)
        return {
          where: (cond: unknown) => {
            mockTxUpdateWhere(cond)
            return { returning: () => Promise.resolve([]) }
          },
        }
      },
    }),
  }
  return {
    db: {
      query: {
        leads: { findFirst: mockFindLead },
        marcas: { findFirst: mockFindMarca },
        productos: { findFirst: mockFindProducto },
        clientes: { findFirst: mockFindCliente },
      },
      transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      insert: () => ({ values: mockDbInsertValues }),
    },
  }
})

vi.mock('@/lib/authz', () => ({ canAccessLead: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/authz/marcas', () => ({ assertPuedeCargarProductos: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/api/validate-params', () => ({ validateUuidParam: vi.fn().mockReturnValue(null) }))
vi.mock('@/lib/clientes/conversion', () => ({ obtenerOCrearClienteDesdeLead: mockObtenerOCrearCliente }))
vi.mock('@/lib/pedidos/service', () => ({ crearPedidoConItems: mockCrearPedidoConItems }))
vi.mock('@/lib/cuenta-corriente/pago.service', () => ({ registrarPagoPedido: mockRegistrarPagoPedido }))

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LEAD_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const CLIENTE_ID = 'bbbbbbbb-0000-0000-0000-000000000001'
const PRODUCTO_ID = 'cccccccc-0000-0000-0000-000000000001'
const ADMIN_ID = 'dddddddd-0000-0000-0000-000000000001'
const AGENTE_ID = 'eeeeeeee-0000-0000-0000-000000000001'

const params = Promise.resolve({ id: LEAD_ID })

function postReq(body?: unknown) {
  return new NextRequest(`http://localhost/api/leads/${LEAD_ID}/muestra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function clienteBase(extra: Record<string, unknown> = {}) {
  return {
    id: CLIENTE_ID,
    territorioId: null,
    expresoNombre: null,
    expresoDireccion: null,
    ...extra,
  }
}

async function loadRoute() {
  return import('@/app/api/leads/[id]/muestra/route')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthFn.mockResolvedValue({ user: { id: ADMIN_ID, role: 'admin', name: 'Admin' } })
  mockFindLead.mockResolvedValue({
    id: LEAD_ID,
    assignedTo: AGENTE_ID,
    contact: { name: 'Juan Pérez' },
    tags: [{ tag: { name: 'landing-cda' } }],
  })
  mockFindMarca.mockResolvedValue({ id: 'marca-cda', slug: 'cda' })
  mockFindProducto.mockResolvedValue({ id: PRODUCTO_ID, nombre: 'Muestras' })
  mockTxFindCliente.mockResolvedValue(clienteBase())
  mockCrearPedidoConItems.mockResolvedValue({ id: 'pedido-1', estado: 'pendiente_aprobacion', total: '1.00' })
  mockRegistrarPagoPedido.mockResolvedValue({
    movimiento: { id: 'mov-1', monto: '1.00' },
    pedidoActualizado: { id: 'pedido-1', montoPagado: '1.00', saldoPendiente: '0.00', estadoPago: 'pagado' },
    sobrante: '0.00',
  })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/leads/[id]/muestra', () => {
  it('admin con retiro en fábrica → 201 y pedido pendiente de aprobación', async () => {
    const { POST } = await loadRoute()
    const res = await POST(postReq({ metodoEntrega: 'retiro_fabrica' }), { params })
    expect(res.status).toBe(201)

    const json = await res.json()
    expect(json.data.pedidoId).toBe('pedido-1')
    expect(json.data.metodoEntrega).toBe('retiro_fabrica')

    expect(mockCrearPedidoConItems).toHaveBeenCalledTimes(1)
    const [clienteId, vendedorId, , , items, , extra] = mockCrearPedidoConItems.mock.calls[0]!
    expect(clienteId).toBe(CLIENTE_ID)
    expect(vendedorId).toBe(AGENTE_ID)
    expect(items).toEqual([{ productoId: PRODUCTO_ID, cantidad: 1 }])
    expect(extra).toMatchObject({
      crearComoPendienteAprobacion: true,
      metodoEntrega: 'retiro_fabrica',
      expresoNombre: null,
      expresoDireccion: null,
      creadoPor: ADMIN_ID,
      // Marcado como muestra con el lead de origen: es lo que dispara el paso
      // a "Muestra enviada" cuando el pedido se entrega.
      tipo: 'muestra',
      leadId: LEAD_ID,
    })
    // No se tocó la ficha del cliente
    expect(mockTxUpdateSet).not.toHaveBeenCalled()
  })

  it('al crear la muestra NO cambia la etapa del lead (eso pasa al entregarse el pedido)', async () => {
    const { POST } = await loadRoute()
    const res = await POST(postReq({ metodoEntrega: 'retiro_fabrica' }), { params })
    expect(res.status).toBe(201)
    // Solo se inserta la actividad muestra_creada; ningún stage_changed ni update de leads
    const acciones = mockDbInsertValues.mock.calls.map((c) => (c[0] as { action?: string }).action)
    expect(acciones).toEqual(['muestra_creada'])
  })

  it('sin método de entrega → 400 y no se crea el pedido', async () => {
    const { POST } = await loadRoute()
    const res = await POST(postReq({}), { params })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/retiro en fábrica|expreso/i)
    expect(mockCrearPedidoConItems).not.toHaveBeenCalled()
  })

  it('sin body → 400', async () => {
    const { POST } = await loadRoute()
    const res = await POST(postReq(), { params })
    expect(res.status).toBe(400)
    expect(mockCrearPedidoConItems).not.toHaveBeenCalled()
  })

  it('expreso nuevo → se guarda en la ficha del cliente y viaja al pedido', async () => {
    const { POST } = await loadRoute()
    const res = await POST(
      postReq({ metodoEntrega: 'expreso', expresoNombre: 'Andreani', expresoDireccion: 'Av. Siempreviva 123' }),
      { params },
    )
    expect(res.status).toBe(201)

    expect(mockTxUpdateSet).toHaveBeenCalledTimes(1)
    expect(mockTxUpdateSet.mock.calls[0]![0]).toMatchObject({
      expresoNombre: 'Andreani',
      expresoDireccion: 'Av. Siempreviva 123',
    })

    const extra = mockCrearPedidoConItems.mock.calls[0]![6]
    expect(extra).toMatchObject({
      crearComoPendienteAprobacion: true,
      metodoEntrega: 'expreso',
      expresoNombre: 'Andreani',
      expresoDireccion: 'Av. Siempreviva 123',
    })
  })

  it('expreso sin datos y cliente sin expreso guardado → 400', async () => {
    const { POST } = await loadRoute()
    const res = await POST(postReq({ metodoEntrega: 'expreso' }), { params })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/expreso/i)
    expect(mockCrearPedidoConItems).not.toHaveBeenCalled()
  })

  it('expreso sin datos y cliente con expreso guardado → usa el de la ficha', async () => {
    mockTxFindCliente.mockResolvedValue(clienteBase({ expresoNombre: 'OCA', expresoDireccion: 'Calle 1' }))
    const { POST } = await loadRoute()
    const res = await POST(postReq({ metodoEntrega: 'expreso' }), { params })
    expect(res.status).toBe(201)

    expect(mockTxUpdateSet).not.toHaveBeenCalled()
    const extra = mockCrearPedidoConItems.mock.calls[0]![6]
    expect(extra).toMatchObject({ metodoEntrega: 'expreso', expresoNombre: 'OCA', expresoDireccion: 'Calle 1' })
  })

  it('agente (rol ventas) también crea en pendiente de aprobación', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: AGENTE_ID, role: 'agent', name: 'Agente' } })
    const { POST } = await loadRoute()
    const res = await POST(postReq({ metodoEntrega: 'retiro_fabrica' }), { params })
    expect(res.status).toBe(201)
    expect(mockCrearPedidoConItems.mock.calls[0]![6]).toMatchObject({ crearComoPendienteAprobacion: true })
  })

  it('el activity log registra el método de entrega', async () => {
    const { POST } = await loadRoute()
    await POST(
      postReq({ metodoEntrega: 'expreso', expresoNombre: 'Andreani', expresoDireccion: 'Av. 1' }),
      { params },
    )
    expect(mockDbInsertValues).toHaveBeenCalledTimes(1)
    expect(mockDbInsertValues.mock.calls[0]![0]).toMatchObject({
      leadId: LEAD_ID,
      action: 'muestra_creada',
      metadata: { pedidoId: 'pedido-1', metodoEntrega: 'expreso', expresoNombre: 'Andreani' },
    })
  })

  it('si falla la validación no registra pagos', async () => {
    const { POST } = await loadRoute()
    await POST(postReq({ metodoEntrega: 'expreso' }), { params })
    expect(mockRegistrarPagoPedido).not.toHaveBeenCalled()
  })

  it('registra un pago simbólico por el total del pedido, imputado a la muestra', async () => {
    const { POST } = await loadRoute()
    const res = await POST(postReq({ metodoEntrega: 'retiro_fabrica' }), { params })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data.pagoSimbolico).toBe('1.00')

    expect(mockRegistrarPagoPedido).toHaveBeenCalledTimes(1)
    expect(mockRegistrarPagoPedido.mock.calls[0]![0]).toMatchObject({
      pedidoId: 'pedido-1',
      monto: '1.00',
      metodoPago: null,
      registradoPor: ADMIN_ID,
    })
    expect(mockRegistrarPagoPedido.mock.calls[0]![0].descripcion).toMatch(/muestra/i)
    // El pago se registra después de crear el pedido
    expect(mockCrearPedidoConItems.mock.invocationCallOrder[0]!).toBeLessThan(mockRegistrarPagoPedido.mock.invocationCallOrder[0]!)

    // Queda registrado en la actividad del lead
    expect(mockDbInsertValues.mock.calls[0]![0]).toMatchObject({
      action: 'muestra_creada',
      metadata: { pagoSimbolico: '1.00' },
    })
  })

  it('si la muestra vale $0 no registra ningún pago', async () => {
    mockCrearPedidoConItems.mockResolvedValue({ id: 'pedido-1', estado: 'pendiente_aprobacion', total: '0.00' })
    const { POST } = await loadRoute()
    const res = await POST(postReq({ metodoEntrega: 'retiro_fabrica' }), { params })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data.pagoSimbolico).toBeNull()
    expect(mockRegistrarPagoPedido).not.toHaveBeenCalled()
  })

  it('crea el cliente desde el lead si no había uno vinculado', async () => {
    mockTxFindCliente.mockResolvedValue(undefined)
    mockObtenerOCrearCliente.mockResolvedValue({ cliente: clienteBase({ id: 'nuevo' }), wasNew: true })
    const { POST } = await loadRoute()
    const res = await POST(postReq({ metodoEntrega: 'retiro_fabrica' }), { params })
    expect(res.status).toBe(201)
    expect(mockObtenerOCrearCliente).toHaveBeenCalledTimes(1)
    expect(mockCrearPedidoConItems.mock.calls[0]![0]).toBe('nuevo')
  })

  it('lead sin tag habilitado → 400', async () => {
    mockFindLead.mockResolvedValue({
      id: LEAD_ID, assignedTo: null, contact: { name: 'X' }, tags: [{ tag: { name: 'otro' } }],
    })
    const { POST } = await loadRoute()
    const res = await POST(postReq({ metodoEntrega: 'retiro_fabrica' }), { params })
    expect(res.status).toBe(400)
    expect(mockCrearPedidoConItems).not.toHaveBeenCalled()
  })
})

describe('GET /api/leads/[id]/muestra', () => {
  it('devuelve el expreso guardado del cliente vinculado', async () => {
    mockFindCliente.mockResolvedValue({ id: CLIENTE_ID, expresoNombre: 'OCA', expresoDireccion: 'Calle 1' })
    const { GET } = await loadRoute()
    const res = await GET(new NextRequest(`http://localhost/api/leads/${LEAD_ID}/muestra`), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.cliente).toEqual({ id: CLIENTE_ID, expresoNombre: 'OCA', expresoDireccion: 'Calle 1' })
  })

  it('sin cliente vinculado devuelve null', async () => {
    mockFindCliente.mockResolvedValue(undefined)
    const { GET } = await loadRoute()
    const res = await GET(new NextRequest(`http://localhost/api/leads/${LEAD_ID}/muestra`), { params })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.cliente).toBeNull()
  })
})
