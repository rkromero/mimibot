import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockTransaction,
  mockDbQueryPedidosFindFirst,
  mockTxQueryPedidosFindFirst,
  mockTxQueryProductosFindMany,
  mockTxInsert,
  mockTxUpdate,
  mockTxSelect,
} = vi.hoisted(() => {
  return {
    mockTransaction: vi.fn(),
    mockDbQueryPedidosFindFirst: vi.fn(),
    mockTxQueryPedidosFindFirst: vi.fn(),
    mockTxQueryProductosFindMany: vi.fn(),
    mockTxInsert: vi.fn(),
    mockTxUpdate: vi.fn(),
    mockTxSelect: vi.fn(),
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

vi.mock('@/lib/cuenta-corriente/pago.service', () => ({
  aplicarSaldoAFavorAPedido: vi.fn().mockResolvedValue(undefined),
  calcularDistribucionFIFO: vi.fn(),
}))

import { crearPedidoConItems, confirmarPedido, aprobarPedido, revertirPedidoAAprobacion } from '@/lib/pedidos/service'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTx() {
  return {
    query: {
      pedidos: { findFirst: mockTxQueryPedidosFindFirst },
      productos: { findMany: mockTxQueryProductosFindMany },
    },
    insert: mockTxInsert,
    update: mockTxUpdate,
    select: mockTxSelect,
  }
}

function makeSelectChain(resolvedValue: unknown[] = []) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn().mockResolvedValue(resolvedValue),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.orderBy.mockReturnValue(chain)
  return chain
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
    mockTxSelect.mockReturnValue(makeSelectChain([]))
    mockTxInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
    mockTxUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })
    mockTransaction.mockImplementation(
      (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    )
  })

  it('calcula subtotales correctamente a partir del precio del producto × cantidad', async () => {
    mockTxQueryProductosFindMany.mockResolvedValue([fakeProductoA, fakeProductoB])

    const returningPedido = vi.fn().mockResolvedValue([{ ...fakePedido }])
    const valuesPedido = vi.fn().mockReturnValue({ returning: returningPedido })

    const fakeItems = [
      { id: 'item-1', pedidoId: 'pedido-new', productoId: 'prod-a', cantidad: 3, precioUnitario: '100.00', subtotal: '300.00' },
      { id: 'item-2', pedidoId: 'pedido-new', productoId: 'prod-b', cantidad: 2, precioUnitario: '50.00', subtotal: '100.00' },
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

    expect(itemA?.subtotal).toBe('300.00')
    expect(itemB?.subtotal).toBe('100.00')
    expect(result.items).toHaveLength(2)
  })

  it('lanza NotFoundError si un producto no existe', async () => {
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

  it('inserta el pedido con estado confirmado y el total calculado (flujo normal)', async () => {
    mockTxQueryProductosFindMany.mockResolvedValue([fakeProductoA])

    const returningPedido = vi.fn().mockResolvedValue([{ ...fakePedido, estado: 'confirmado', total: '100.00' }])
    const valuesPedido = vi.fn().mockReturnValue({ returning: returningPedido })

    const returningItems = vi.fn().mockResolvedValue([
      { id: 'item-1', pedidoId: 'pedido-new', productoId: 'prod-a', cantidad: 1, precioUnitario: '100.00', subtotal: '100.00' },
    ])
    const valuesItems = vi.fn().mockReturnValue({ returning: returningItems })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesPedido })
      .mockReturnValueOnce({ values: valuesItems })

    await crearPedidoConItems(CLIENTE_ID, VENDEDOR_ID, null, null, [
      { productoId: 'prod-a', cantidad: 1 },
    ])

    const pedidoInsertArg = valuesPedido.mock.calls[0]?.[0] as { estado: string; total: string }
    expect(pedidoInsertArg.estado).toBe('confirmado')
    expect(pedidoInsertArg.total).toBe('100.00')
  })

  it('crea el pedido en estado pendiente_aprobacion cuando crearComoPendienteAprobacion=true', async () => {
    mockTxQueryProductosFindMany.mockResolvedValue([fakeProductoA])

    const returningPedido = vi.fn().mockResolvedValue([{ ...fakePedido, estado: 'pendiente_aprobacion', total: '100.00' }])
    const valuesPedido = vi.fn().mockReturnValue({ returning: returningPedido })

    const returningItems = vi.fn().mockResolvedValue([
      { id: 'item-1', pedidoId: 'pedido-new', productoId: 'prod-a', cantidad: 1, precioUnitario: '100.00', subtotal: '100.00' },
    ])
    const valuesItems = vi.fn().mockReturnValue({ returning: returningItems })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesPedido })
      .mockReturnValueOnce({ values: valuesItems })

    await crearPedidoConItems(CLIENTE_ID, VENDEDOR_ID, null, null, [
      { productoId: 'prod-a', cantidad: 1 },
    ], undefined, { crearComoPendienteAprobacion: true })

    const pedidoInsertArg = valuesPedido.mock.calls[0]?.[0] as { estado: string; total: string }
    expect(pedidoInsertArg.estado).toBe('pendiente_aprobacion')
    expect(pedidoInsertArg.total).toBe('100.00')
  })

  it('NO inserta movimiento CC ni stock cuando crearComoPendienteAprobacion=true', async () => {
    mockTxQueryProductosFindMany.mockResolvedValue([fakeProductoA])

    const returningPedido = vi.fn().mockResolvedValue([{ ...fakePedido, estado: 'pendiente_aprobacion', total: '100.00' }])
    const valuesPedido = vi.fn().mockReturnValue({ returning: returningPedido })

    const returningItems = vi.fn().mockResolvedValue([
      { id: 'item-1', pedidoId: 'pedido-new', productoId: 'prod-a', cantidad: 1, precioUnitario: '100.00', subtotal: '100.00' },
    ])
    const valuesItems = vi.fn().mockReturnValue({ returning: returningItems })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesPedido })
      .mockReturnValueOnce({ values: valuesItems })

    await crearPedidoConItems(CLIENTE_ID, VENDEDOR_ID, null, null, [
      { productoId: 'prod-a', cantidad: 1 },
    ], undefined, { crearComoPendienteAprobacion: true })

    // Solo se llamó insert para pedido + items (2 veces), NO para CC ni stock
    expect(mockTxInsert).toHaveBeenCalledTimes(2)
  })
})

// ─── Tests: confirmarPedido ───────────────────────────────────────────────────

describe('confirmarPedido', () => {
  const PEDIDO_ID = 'pedido-001'
  const USER_ID = 'user-xyz'

  const fakeItems = [
    { id: 'item-1', pedidoId: PEDIDO_ID, productoId: 'prod-a', cantidad: 2, precioUnitario: '100.00', subtotal: '200.00' },
    { id: 'item-2', pedidoId: PEDIDO_ID, productoId: 'prod-b', cantidad: 3, precioUnitario: '50.00', subtotal: '150.00' },
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
    mockTxSelect.mockReturnValue(makeSelectChain([]))
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

    const valuesInsertCC = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'mov-1' }]) })
    mockTxInsert.mockReturnValue({ values: valuesInsertCC })
    mockDbQueryPedidosFindFirst.mockResolvedValue(fakeConfirmedPedido)

    await confirmarPedido(PEDIDO_ID, USER_ID)

    const setArg = setUpdate.mock.calls[0]?.[0] as { total: string; estado: string }
    expect(setArg.total).toBe('350.00')
  })

  it('pone estado=confirmado al pedido', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(fakePendingPedido)

    const returningUpdate = vi.fn().mockResolvedValue([fakeConfirmedPedido])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const valuesInsertCC = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'mov-1' }]) })
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

    const valuesInsertCC = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'mov-1' }]) })
    mockTxInsert.mockReturnValue({ values: valuesInsertCC })
    mockDbQueryPedidosFindFirst.mockResolvedValue(fakeConfirmedPedido)

    await confirmarPedido(PEDIDO_ID, USER_ID)

    const insertArg = valuesInsertCC.mock.calls[0]?.[0] as { tipo: string; monto: string; pedidoId: string }
    expect(insertArg.tipo).toBe('debito')
    expect(insertArg.monto).toBe('350.00')
    expect(insertArg.pedidoId).toBe(PEDIDO_ID)
  })

  it('lanza NotFoundError si el pedido no existe', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(undefined)
    await expect(confirmarPedido(PEDIDO_ID, USER_ID)).rejects.toThrow('Pedido')
  })

  it('lanza ValidationError si el pedido no está en estado pendiente', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue({ ...fakePendingPedido, estado: 'confirmado' })
    await expect(confirmarPedido(PEDIDO_ID, USER_ID)).rejects.toThrow('pendiente')
  })
})

// ─── Tests: aprobarPedido ─────────────────────────────────────────────────────

describe('aprobarPedido', () => {
  const PEDIDO_ID = 'pedido-aprobacion'
  const USER_ID = 'gerente-001'

  const fakeItems = [
    { id: 'item-1', pedidoId: PEDIDO_ID, productoId: 'prod-a', cantidad: 2, precioUnitario: '100.00', subtotal: '200.00' },
  ]

  const fakePendienteAprobacion = {
    id: PEDIDO_ID,
    clienteId: 'cliente-1',
    vendedorId: 'agente-1',
    estado: 'pendiente_aprobacion' as const,
    total: '200.00',
    montoPagado: '0',
    saldoPendiente: '200.00',
    estadoPago: 'impago' as const,
    fecha: new Date('2024-01-15'),
    observaciones: null,
    updatedAt: new Date(),
    createdAt: new Date(),
    items: fakeItems,
  }

  const fakeConfirmedPedido = { ...fakePendienteAprobacion, estado: 'confirmado' as const }

  beforeEach(() => {
    vi.clearAllMocks()
    mockTxSelect.mockReturnValue(makeSelectChain([]))
    mockTransaction.mockImplementation(
      (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    )
  })

  it('transiciona de pendiente_aprobacion a confirmado', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(fakePendienteAprobacion)

    const returningUpdate = vi.fn().mockResolvedValue([fakeConfirmedPedido])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const valuesInsert = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'mov-1' }]) })
    mockTxInsert.mockReturnValue({ values: valuesInsert })
    mockDbQueryPedidosFindFirst.mockResolvedValue(fakeConfirmedPedido)

    await aprobarPedido(PEDIDO_ID, USER_ID)

    const setArg = setUpdate.mock.calls[0]?.[0] as { estado: string; total: string }
    expect(setArg.estado).toBe('confirmado')
    expect(setArg.total).toBe('200.00')
  })

  it('crea movimiento CC de débito al aprobar', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(fakePendienteAprobacion)

    const returningUpdate = vi.fn().mockResolvedValue([fakeConfirmedPedido])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const valuesInsert = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'mov-1' }]) })
    mockTxInsert.mockReturnValue({ values: valuesInsert })
    mockDbQueryPedidosFindFirst.mockResolvedValue(fakeConfirmedPedido)

    await aprobarPedido(PEDIDO_ID, USER_ID)

    const ccInsertArg = valuesInsert.mock.calls[0]?.[0] as { tipo: string; monto: string }
    expect(ccInsertArg.tipo).toBe('debito')
    expect(ccInsertArg.monto).toBe('200.00')
  })

  it('lanza ValidationError si el pedido no está en pendiente_aprobacion', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue({ ...fakePendienteAprobacion, estado: 'confirmado' })
    await expect(aprobarPedido(PEDIDO_ID, USER_ID)).rejects.toThrow('pendiente de aprobación')
  })

  it('lanza NotFoundError si el pedido no existe', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(undefined)
    await expect(aprobarPedido(PEDIDO_ID, USER_ID)).rejects.toThrow('Pedido')
  })
})

// ─── Tests: revertirPedidoAAprobacion ─────────────────────────────────────────

describe('revertirPedidoAAprobacion', () => {
  const PEDIDO_ID = 'pedido-revert'
  const USER_ID = 'gerente-001'

  const fakeItems = [
    { id: 'item-1', pedidoId: PEDIDO_ID, productoId: 'prod-a', cantidad: 2, precioUnitario: '100.00', subtotal: '200.00' },
  ]

  const fakeConfirmedPedido = {
    id: PEDIDO_ID,
    clienteId: 'cliente-1',
    vendedorId: 'agente-1',
    estado: 'confirmado' as const,
    total: '200.00',
    montoPagado: '0',
    saldoPendiente: '200.00',
    estadoPago: 'impago' as const,
    fecha: new Date('2024-01-15'),
    observaciones: null,
    updatedAt: new Date(),
    createdAt: new Date(),
    items: fakeItems,
  }

  const fakeRevertedPedido = { ...fakeConfirmedPedido, estado: 'pendiente_aprobacion' as const }

  beforeEach(() => {
    vi.clearAllMocks()
    mockTxSelect.mockReturnValue(makeSelectChain([]))
    mockTransaction.mockImplementation(
      (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    )
  })

  it('transiciona de confirmado a pendiente_aprobacion', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(fakeConfirmedPedido)

    const returningUpdate = vi.fn().mockResolvedValue([fakeRevertedPedido])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    // tx.update es llamado múltiples veces (CC, aplicaciones, pedido)
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const valuesInsert = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) })
    mockTxInsert.mockReturnValue({ values: valuesInsert })

    const result = await revertirPedidoAAprobacion(PEDIDO_ID, USER_ID)

    // El último set del pedido debe tener estado=pendiente_aprobacion
    const lastSetCall = setUpdate.mock.calls[setUpdate.mock.calls.length - 1]?.[0] as { estado: string }
    expect(lastSetCall.estado).toBe('pendiente_aprobacion')
    expect(result.estado).toBe('pendiente_aprobacion')
  })

  it('lanza ValidationError si el pedido no está en estado confirmado', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue({ ...fakeConfirmedPedido, estado: 'pendiente_aprobacion' })
    await expect(revertirPedidoAAprobacion(PEDIDO_ID, USER_ID)).rejects.toThrow('confirmado')
  })

  it('lanza NotFoundError si el pedido no existe', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(undefined)
    await expect(revertirPedidoAAprobacion(PEDIDO_ID, USER_ID)).rejects.toThrow('Pedido')
  })

  it('crea movimientos de stock de tipo entrada para compensar las salidas', async () => {
    mockTxQueryPedidosFindFirst.mockResolvedValue(fakeConfirmedPedido)

    const returningUpdate = vi.fn().mockResolvedValue([fakeRevertedPedido])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const valuesInsert = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) })
    mockTxInsert.mockReturnValue({ values: valuesInsert })

    await revertirPedidoAAprobacion(PEDIDO_ID, USER_ID)

    // El insert de stock debe ser de tipo 'entrada'
    const stockInsertArg = valuesInsert.mock.calls[0]?.[0] as { tipo: string; cantidad: number }
    expect(stockInsertArg.tipo).toBe('entrada')
    expect(stockInsertArg.cantidad).toBe(2)
  })
})
