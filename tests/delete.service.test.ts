import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB and schema imports before importing the service
vi.mock('@/db', () => ({
  db: {
    query: {
      pedidos: { findFirst: vi.fn(), findMany: vi.fn() },
      movimientosCC: { findFirst: vi.fn(), findMany: vi.fn() },
      aplicacionesPago: { findMany: vi.fn() },
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
  productos: {},
  leads: {},
}))

vi.mock('@/lib/cuenta-corriente/pago.service', () => ({
  calcularDistribucionFIFO: vi.fn(),
}))

import { db } from '@/db'
import { deleteCliente, deleteProducto, deleteLead } from '@/lib/delete/delete.service'
import { ValidationError, NotFoundError } from '@/lib/errors'

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
