import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB and schema imports before importing the service
vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: { findFirst: vi.fn(), findMany: vi.fn() },
      movimientosCC: { findFirst: vi.fn(), findMany: vi.fn() },
      aplicacionesPago: { findFirst: vi.fn(), findMany: vi.fn() },
      productos: { findFirst: vi.fn() },
      leads: { findFirst: vi.fn() },
    },
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/db/schema', () => ({
  clientes: {},
  pedidos: {},
  movimientosCC: {},
  aplicacionesPago: {},
  stockMovements: {},
  productos: {},
  leads: {},
}))

vi.mock('@/lib/cuenta-corriente/pago.service', () => ({
  calcularDistribucionFIFO: vi.fn(),
}))

import { db } from '@/db'
import { deleteCliente, deletePedido, deleteProducto, deleteLead } from '@/lib/delete/delete.service'
import { ValidationError, NotFoundError, ConflictError } from '@/lib/errors'

const mockDb = db as unknown as {
  query: {
    pedidos: { findFirst: ReturnType<typeof vi.fn> }
    movimientosCC: { findFirst: ReturnType<typeof vi.fn> }
    productos: { findFirst: ReturnType<typeof vi.fn> }
    leads: { findFirst: ReturnType<typeof vi.fn> }
  }
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

function makeSelectChain(balance: string) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ balance }]),
    }),
  }
}

function makeUpdateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }
}

describe('deleteCliente', () => {
  it('lanza ValidationError si el cliente tiene pedidos activos', async () => {
    mockDb.query.pedidos.findFirst.mockResolvedValueOnce({ id: 'pedido-1' })

    await expect(deleteCliente('cliente-1', 'admin-1'))
      .rejects.toThrow('El cliente tiene pedidos activos')
  })

  it('lanza ValidationError si la cuenta corriente no está en cero', async () => {
    mockDb.query.pedidos.findFirst.mockResolvedValueOnce(null)
    mockDb.select.mockReturnValueOnce(makeSelectChain('500.00'))

    await expect(deleteCliente('cliente-1', 'admin-1'))
      .rejects.toThrow('La cuenta corriente del cliente no está en cero')
  })

  it('procede con soft-delete si no hay pedidos y CC está en cero', async () => {
    mockDb.query.pedidos.findFirst.mockResolvedValueOnce(null)
    mockDb.select.mockReturnValueOnce(makeSelectChain('0.00'))
    mockDb.update.mockReturnValueOnce(makeUpdateChain())

    await expect(deleteCliente('cliente-1', 'admin-1')).resolves.toBeUndefined()
    expect(mockDb.update).toHaveBeenCalledOnce()
  })
})

describe('deleteProducto', () => {
  it('lanza NotFoundError si el producto no existe', async () => {
    mockDb.query.productos.findFirst.mockResolvedValueOnce(null)

    await expect(deleteProducto('producto-1', 'admin-1'))
      .rejects.toThrow(NotFoundError)
  })

  it('soft-deletes si el producto existe', async () => {
    mockDb.query.productos.findFirst.mockResolvedValueOnce({ id: 'producto-1' })

    const mockUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValueOnce(undefined),
    }
    mockDb.update.mockReturnValueOnce(mockUpdateChain)

    await expect(deleteProducto('producto-1', 'admin-1')).resolves.toBeUndefined()
    expect(mockDb.update).toHaveBeenCalledOnce()
  })
})

describe('deleteLead', () => {
  it('lanza NotFoundError si el lead no existe', async () => {
    mockDb.query.leads.findFirst.mockResolvedValueOnce(null)

    await expect(deleteLead('lead-1', 'admin-1'))
      .rejects.toThrow(NotFoundError)
  })

  it('soft-deletes si el lead existe', async () => {
    mockDb.query.leads.findFirst.mockResolvedValueOnce({ id: 'lead-1' })

    const mockUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValueOnce(undefined),
    }
    mockDb.update.mockReturnValueOnce(mockUpdateChain)

    await expect(deleteLead('lead-1', 'admin-1')).resolves.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// deletePedido — bug fixes:
//   Bug 1: pagos huérfanos al borrar pedido pagado (ConflictError guard)
//   Bug 2: stock no revertido al eliminar pedido (stock reversal on delete)
// ─────────────────────────────────────────────────────────────────────────────

describe('deletePedido', () => {
  // Dedicated mock transaction object — avoids polluting the global db mock.
  const mockTx = {
    query: {
      pedidos: { findFirst: vi.fn(), findMany: vi.fn() },
      movimientosCC: { findFirst: vi.fn(), findMany: vi.fn() },
      aplicacionesPago: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    update: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
  }

  // A reusable update-chain helper (set(...).where(...) → resolves void)
  function txUpdateChain() {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    return { set, where }
  }

  // Build a select chain for queries awaited directly (.from().where() → rows)
  function selectDirect(rows: unknown[]) {
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    }
  }

  // Build a select chain for queries with .orderBy().limit() at the end
  function selectOrdered(rows: unknown[]) {
    const limit = vi.fn().mockResolvedValue(rows)
    const orderBy = vi.fn().mockReturnValue({ limit })
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ orderBy }),
      }),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction
      .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx))
    // Default insert chain
    mockTx.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
  })

  // ── Bug 1: pagos huérfanos ────────────────────────────────────────────────

  /**
   * BUG ESCENARIO (pre-fix):
   * Pedido $78.000 con pagos aplicados $30k + $48k → DELETE.
   * Sin el guard, el servicio borraba el débito pero dejaba los créditos activos,
   * generando saldo = -78.000 (a favor falso del cliente).
   *
   * AFTER FIX: el endpoint devuelve 409 ConflictError y no toca la DB.
   */
  it('lanza ConflictError (409) si el pedido tiene pagos aplicados — evita saldo huérfano', async () => {
    mockTx.query.pedidos.findFirst.mockResolvedValueOnce({
      id: 'pedido-1',
      clienteId: 'cliente-1',
      total: '78000.00',
      fecha: new Date('2025-01-15'),
    })
    mockTx.query.aplicacionesPago.findFirst.mockResolvedValueOnce({ id: 'ap-1' })

    const error = await deletePedido('pedido-1', 'admin-1').catch((e) => e)

    expect(error).toBeInstanceOf(ConflictError)
    expect(error.message).toBe(
      'No se puede eliminar un pedido con pagos aplicados. Usá Anular.',
    )
    expect(error.statusCode).toBe(409)
    expect(mockTx.update).not.toHaveBeenCalled()
    expect(mockTx.insert).not.toHaveBeenCalled()
  })

  it('lanza NotFoundError si el pedido no existe o ya fue borrado', async () => {
    mockTx.query.pedidos.findFirst.mockResolvedValueOnce(null)
    await expect(deletePedido('pedido-inexistente', 'admin-1')).rejects.toThrow(NotFoundError)
  })

  // ── Bug 2: stock no revertido ─────────────────────────────────────────────

  /**
   * (d) Test principal — stock reversal:
   * Pedido con 12 unidades de producto 'p1' confirmado (salida de 12 unidades).
   * Al eliminar, se debe crear un stock_movement de tipo 'entrada' con cantidad=12
   * y saldoResultante=185 (173 + 12).
   */
  it('(d) crea movimiento entrada para revertir stock cuando hay salidas registradas', async () => {
    const PEDIDO_ID = 'pedido-con-stock'
    const PRODUCTO_ID = 'prod-mim-001'

    // Pedido sin pagos
    mockTx.query.pedidos.findFirst.mockResolvedValueOnce({
      id: PEDIDO_ID,
      clienteId: 'cliente-1',
      total: '10000.00',
      fecha: new Date('2026-05-28'),
    })
    mockTx.query.aplicacionesPago.findFirst.mockResolvedValueOnce(null) // no payments
    mockTx.query.movimientosCC.findFirst.mockResolvedValueOnce(null)    // no debit

    // Stock movements for this pedido: 1 salida de 12 unidades
    mockTx.select
      .mockReturnValueOnce(selectDirect([
        { productoId: PRODUCTO_ID, tipo: 'salida', cantidad: 12 },
      ]))
      // Latest saldo for product (stock is at 173 after the pedido was created)
      .mockReturnValueOnce(selectOrdered([{ saldo: 173 }]))

    // FIFO: no active credits/pedidos
    mockTx.query.movimientosCC.findMany.mockResolvedValueOnce([])
    mockTx.query.pedidos.findMany.mockResolvedValueOnce([])
    mockTx.update.mockReturnValue(txUpdateChain())

    // Capture insert calls
    const insertValues = vi.fn().mockResolvedValue(undefined)
    mockTx.insert.mockReturnValue({ values: insertValues })

    await deletePedido(PEDIDO_ID, 'admin-1')

    // Verify the reversal movement was inserted
    expect(mockTx.insert).toHaveBeenCalledOnce()
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        productoId: PRODUCTO_ID,
        tipo: 'entrada',
        cantidad: 12,
        saldoResultante: 185,          // 173 + 12
        pedidoId: PEDIDO_ID,
        referencia: expect.stringContaining('Reverso por eliminación pedido'),
      }),
    )
  })

  /**
   * (e) Test de borde — doble reverso:
   * Si el pedido ya tenía una salida Y una entrada compensatoria (ej: fue revertido
   * a pendiente_aprobacion antes de eliminarse), el netDeducted = 0 → NO se crea
   * ningún movimiento adicional. Previene doble reverso.
   */
  it('(e) NO crea movimiento de reverso si el stock ya fue restaurado (idempotencia)', async () => {
    const PEDIDO_ID = 'pedido-ya-revertido'
    const PRODUCTO_ID = 'prod-mim-001'

    mockTx.query.pedidos.findFirst.mockResolvedValueOnce({
      id: PEDIDO_ID,
      clienteId: 'cliente-1',
      total: '10000.00',
      fecha: new Date('2026-05-28'),
    })
    mockTx.query.aplicacionesPago.findFirst.mockResolvedValueOnce(null)
    mockTx.query.movimientosCC.findFirst.mockResolvedValueOnce(null)

    // Stock movements: salida 12 + entrada 12 (already balanced)
    mockTx.select
      .mockReturnValueOnce(selectDirect([
        { productoId: PRODUCTO_ID, tipo: 'salida', cantidad: 12 },
        { productoId: PRODUCTO_ID, tipo: 'entrada', cantidad: 12 }, // prior reversal
      ]))

    mockTx.query.movimientosCC.findMany.mockResolvedValueOnce([])
    mockTx.query.pedidos.findMany.mockResolvedValueOnce([])
    mockTx.update.mockReturnValue(txUpdateChain())

    await deletePedido(PEDIDO_ID, 'admin-1')

    // NO insert should have been called (net = 0)
    expect(mockTx.insert).not.toHaveBeenCalled()
  })

  it('procede con soft-delete sin movimientos de stock si el pedido no tiene salidas registradas', async () => {
    mockTx.query.pedidos.findFirst.mockResolvedValueOnce({
      id: 'pedido-sin-pagos',
      clienteId: 'cliente-1',
      total: '10000.00',
      fecha: new Date('2025-01-10'),
    })
    mockTx.query.aplicacionesPago.findFirst.mockResolvedValueOnce(null)
    mockTx.query.movimientosCC.findFirst.mockResolvedValueOnce(null)

    // No stock movements for this pedido
    mockTx.select.mockReturnValueOnce(selectDirect([]))

    mockTx.query.movimientosCC.findMany.mockResolvedValueOnce([])
    mockTx.query.pedidos.findMany.mockResolvedValueOnce([])
    mockTx.update.mockReturnValue(txUpdateChain())

    await expect(deletePedido('pedido-sin-pagos', 'admin-1')).resolves.toBeUndefined()
    expect(mockTx.update).toHaveBeenCalled()
    expect(mockTx.insert).not.toHaveBeenCalled() // no stock to revert
  })
})
