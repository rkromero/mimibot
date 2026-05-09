import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file by Vitest, so any
// variables they reference must also be hoisted via vi.hoisted.

const {
  mockTransaction,
  mockDbQueryPedidosFindFirst,
  mockTxQueryPedidosFindFirst,
  mockTxQueryProductosFindMany,
  mockTxInsert,
  mockTxUpdate,
} = vi.hoisted(() => {
  return {
    mockTransaction: vi.fn(),
    mockDbQueryPedidosFindFirst: vi.fn(),
    mockTxQueryPedidosFindFirst: vi.fn(),
    mockTxQueryProductosFindMany: vi.fn(),
    mockTxInsert: vi.fn(),
    mockTxUpdate: vi.fn(),
  }
})

vi.mock('@/db', () => ({
  db: {
    transaction: mockTransaction,
    query: {
      pedidos: { findFirst: mockDbQueryPedidosFindFirst },
    },
  },
}))

vi.mock('@/lib/errors', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(resource: string) {
      super(`${resource} not found`)
      this.name = 'NotFoundError'
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ValidationError'
    }
  },
}))

// aplicarSaldoAFavorAPedido is invoked inside confirmarPedido after the main
// transaction commits. Mock it to a no-op so tests focus on core logic.
vi.mock('@/lib/cuenta-corriente/pago.service', () => ({
  aplicarSaldoAFavorAPedido: vi.fn().mockResolvedValue(undefined),
  calcularDistribucionFIFO: vi.fn(),
}))

import { crearPedidoConItems, confirmarPedido } from '@/lib/pedidos/service'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTx() {
  return {
    query: {
      pedidos: { findFirst: mockTxQueryPedidosFindFirst },
      productos: { findMany: mockTxQueryProductosFindMany },
    },
    insert: mockTxInsert,
    update: mockTxUpdate,
  }
}

// ─── Tests: crearPedidoConItems ───────────────────────────────────────────────

describe('crearPedidoConItems', () => {
  const CLIENTE_ID = 'cliente-1'
  const VENDEDOR_ID = 'vendedor-1'

  const fakeProductoA = { id: 'prod-a', precio: '100.00', activo: true, nombre: 'Producto A' }
  const fakeProductoB = { id: 'prod-b', precio: '50.00', activo: true, nombre: 'Producto B' }

  const fakePedido = {
    id: 'pedido-new',
    clienteId: CLIENTE_ID,
    vendedorId: VENDEDOR_ID,
    estado: 'pendiente' as const,
    total: '0',
    montoPagado: '0',
    saldoPendiente: '0',
    estadoPago: 'impago' as const,
    fecha: new Date('2024-01-15'),
    observaciones: null,
    updatedAt: new Date(),
    createdAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(
      (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    )
  })

  it('calcula subtotales correctamente a partir del precio del producto × cantidad', async () => {
    mockTxQueryProductosFindMany.mockResolvedValue([fakeProductoA, fakeProductoB])

    const returningPedido = vi.fn().mockResolvedValue([{ ...fakePedido }])
    const valuesPedido = vi.fn().mockReturnValue({ returning: returningPedido })

    const fakeItems = [
      {
        id: 'item-1',
        pedidoId: 'pedido-new',
        productoId: 'prod-a',
        cantidad: 3,
        precioUnitario: '100.00',
        subtotal: '300.00',
      },
      {
        id: 'item-2',
        pedidoId: 'pedido-new',
        productoId: 'prod-b',
        cantidad: 2,
        precioUnitario: '50.00',
        subtotal: '100.00',
      },
    ]
    const returningItems = vi.fn().mockResolvedValue(fakeItems)
    const valuesItems = vi.fn().mockReturnValue({ returning: returningItems })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesPedido })
      .mockReturnValueOnce({ values: valuesItems })

    const result = await crearPedidoConItems(
      CLIENTE_ID,
      VENDEDOR_ID,
      '2024-01-15',
      null,
      [
        { productoId: 'prod-a', cantidad: 3 },
        { productoId: 'prod-b', cantidad: 2 },
      ],
    )

    const insertedItemsArg = valuesItems.mock.calls[0]?.[0] as Array<{
      subtotal: string
      precioUnitario: string
      cantidad: number
    }>

    const itemA = insertedItemsArg.find((i) => i.precioUnitario === '100.00')
    const itemB = insertedItemsArg.find((i) => i.precioUnitario === '50.00')

    expect(itemA?.subtotal).toBe('300.00') // 100 × 3
    expect(itemB?.subtotal).toBe('100.00') // 50 × 2
    expect(result.items).toHaveLength(2)
  })

  it('lanza NotFoundError si un producto no existe', async () => {
    // Only product A returned — product B is missing
    mockTxQueryProductosFindMany.mockResolvedValue([fakeProductoA])

    await expect(
      crearPedidoConItems(CLIENTE_ID, VENDEDOR_ID, null, null, [
        { productoId: 'prod-a', cantidad: 1 },
        { productoId: 'prod-b', cantidad: 1 },
      ]),
    ).rejects.toThrow('prod-b')
  })

  it('lanza ValidationError si un producto no está activo', async () => {
    mockTxQueryProductosFindMany.mockResolvedValue([
      { ...fakeProductoA, activo: false },
    ])

    await expect(
      crearPedidoConItems(CLIENTE_ID, VENDEDOR_ID, null, null, [
        { productoId: 'prod-a', cantidad: 1 },
      ]),
    ).rejects.toThrow('no está activo')
  })

  it('inserta el pedido con estado pendiente y total 0', async () => {
    mockTxQueryProductosFindMany.mockResolvedValue([fakeProductoA])

    const returningPedido = vi.fn().mockResolvedValue([{ ...fakePedido }])
    const valuesPedido = vi.fn().mockReturnValue({ returning: returningPedido })

    const returningItems = vi.fn().mockResolvedValue([
      {
        id: 'item-1',
        pedidoId: 'pedido-new',
        productoId: 'prod-a',
        cantidad: 1,
        precioUnitario: '100.00',
        subtotal: '100.00',
      },
    ])
    const valuesItems = vi.fn().mockReturnValue({ returning: returningItems })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesPedido })
      .mockReturnValueOnce({ values: valuesItems })

    await crearPedidoConItems(CLIENTE_ID, VENDEDOR_ID, null, null, [
      { productoId: 'prod-a', cantidad: 1 },
    ])

    const pedidoInsertArg = valuesPedido.mock.calls[0]?.[0] as {
      estado: string
      total: string
    }
    expect(pedidoInsertArg.estado).toBe('pendiente')
    expect(pedidoInsertArg.total).toBe('0')
  })
})

// ─── Tests: confirmarPedido ───────────────────────────────────────────────────

describe('confirmarPedido', () => {
  const PEDIDO_ID = 'pedido-001'
  const USER_ID = 'user-xyz'

  const fakeItems = [
    {
      id: 'item-1',
      pedidoId: PEDIDO_ID,
      productoId: 'prod-a',
      cantidad: 2,
      precioUnitario: '100.00',
      subtotal: '200.00',
    },
    {
      id: 'item-2',
      pedidoId: PEDIDO_ID,
      productoId: 'prod-b',
      cantidad: 3,
      precioUnitario: '50.00',
      subtotal: '150.00',
    },
  ]

  const fakePendingPedido = {
    id: PEDIDO_ID,
    clienteId: 'cliente-1',
    vendedorId: 'vendedor-1',
    estado: 'pendiente' as const,
    total: '0',
    montoPagado: '0',
    saldoPendiente: '0',
    estadoPago: 'impago' as const,
    fecha: new Date('2024-01-15'),
    observaciones: null,
    updatedAt: new Date(),
    createdAt: new Date(),
    items: fakeItems,
  }

  const fakeConfirmedPedido = {
    ...fakePendingPedido,
    estado: 'confirmado' as const,
    total: '350.00',
    saldoPendiente: '350.00',
    estadoPago: 'impago' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(
      (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    )
  })

  it('calcula el total como la suma de los subtotales de los ítems', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(fakePendingPedido)

    const returningUpdate = vi.fn().mockResolvedValue([fakeConfirmedPedido])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const valuesInsertCC = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'mov-1' }]),
    })
    mockTxInsert.mockReturnValue({ values: valuesInsertCC })

    // confirmarPedido re-fetches the pedido after aplicarSaldoAFavor
    mockDbQueryPedidosFindFirst.mockResolvedValue(fakeConfirmedPedido)

    await confirmarPedido(PEDIDO_ID, USER_ID)

    const setArg = setUpdate.mock.calls[0]?.[0] as { total: string; estado: string }
    expect(setArg.total).toBe('350.00') // 200 + 150
  })

  it('pone estado=confirmado al pedido', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(fakePendingPedido)

    const returningUpdate = vi.fn().mockResolvedValue([fakeConfirmedPedido])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const valuesInsertCC = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'mov-1' }]),
    })
    mockTxInsert.mockReturnValue({ values: valuesInsertCC })

    mockDbQueryPedidosFindFirst.mockResolvedValue(fakeConfirmedPedido)

    await confirmarPedido(PEDIDO_ID, USER_ID)

    const setArg = setUpdate.mock.calls[0]?.[0] as { estado: string }
    expect(setArg.estado).toBe('confirmado')
  })

  it('crea un movimientoCC de tipo débito con el total correcto', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(fakePendingPedido)

    const returningUpdate = vi.fn().mockResolvedValue([fakeConfirmedPedido])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const valuesInsertCC = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'mov-1' }]),
    })
    mockTxInsert.mockReturnValue({ values: valuesInsertCC })

    mockDbQueryPedidosFindFirst.mockResolvedValue(fakeConfirmedPedido)

    await confirmarPedido(PEDIDO_ID, USER_ID)

    const insertArg = valuesInsertCC.mock.calls[0]?.[0] as {
      tipo: string
      monto: string
      pedidoId: string
    }
    expect(insertArg.tipo).toBe('debito')
    expect(insertArg.monto).toBe('350.00')
    expect(insertArg.pedidoId).toBe(PEDIDO_ID)
  })

  it('lanza NotFoundError si el pedido no existe', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(undefined)

    await expect(confirmarPedido(PEDIDO_ID, USER_ID)).rejects.toThrow('Pedido')
  })

  it('lanza ValidationError si el pedido no está en estado pendiente', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue({
      ...fakePendingPedido,
      estado: 'confirmado',
    })

    await expect(confirmarPedido(PEDIDO_ID, USER_ID)).rejects.toThrow('pendiente')
  })
})
