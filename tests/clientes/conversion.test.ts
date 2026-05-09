import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks — must be declared with vi.hoisted so they are available
// when vi.mock factories run (vi.mock is hoisted to top by Vitest). ─────────

const { mockTransaction, mockTxQueryLeadsFindFirst, mockTxQueryClientesFindFirst,
  mockTxInsert, mockTxUpdate } = vi.hoisted(() => {
  const mockTxQueryLeadsFindFirst = vi.fn()
  const mockTxQueryClientesFindFirst = vi.fn()
  const mockTxInsert = vi.fn()
  const mockTxUpdate = vi.fn()
  const mockTransaction = vi.fn()
  return {
    mockTransaction,
    mockTxQueryLeadsFindFirst,
    mockTxQueryClientesFindFirst,
    mockTxInsert,
    mockTxUpdate,
  }
})

vi.mock('@/db', () => ({
  db: {
    transaction: mockTransaction,
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

import { convertirLeadACliente } from '@/lib/clientes/conversion'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fresh tx object whose methods delegate to the hoisted mock fns. */
function makeTx() {
  return {
    query: {
      leads: { findFirst: mockTxQueryLeadsFindFirst },
      clientes: { findFirst: mockTxQueryClientesFindFirst },
    },
    insert: mockTxInsert,
    update: mockTxUpdate,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('convertirLeadACliente', () => {
  const USER_ID = 'user-abc'
  const LEAD_ID = 'lead-001'

  const fakeLead = {
    id: LEAD_ID,
    isOpen: true,
    assignedTo: 'vendedor-1',
    contact: {
      name: 'Ana García',
      email: 'ana@example.com',
      phone: '+5491199999999',
    },
  }

  const fakeNuevoCliente = {
    id: 'cliente-new',
    nombre: 'Ana',
    apellido: 'García',
    email: 'ana@example.com',
    telefono: '+5491199999999',
    origen: 'convertido_de_lead',
    leadId: LEAD_ID,
    asignadoA: 'vendedor-1',
    creadoPor: USER_ID,
    updatedAt: new Date(),
    createdAt: new Date(),
  }

  const fakeExistingCliente = {
    id: 'cliente-existing',
    nombre: 'Ana',
    apellido: 'García',
    email: 'ana@example.com',
    leadId: null,
    updatedAt: new Date(),
    createdAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: mockTransaction runs the callback with a fresh tx
    mockTransaction.mockImplementation((fn: (tx: ReturnType<typeof makeTx>) => unknown) =>
      fn(makeTx()),
    )
  })

  // ── No cliente with same email → create new ──────────────────────────────

  describe('cuando no existe cliente con el mismo email', () => {
    it('crea un nuevo cliente y cierra el lead (isOpen=false)', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(undefined)

      const returningInsert = vi.fn().mockResolvedValue([fakeNuevoCliente])
      const valuesInsert = vi.fn().mockReturnValue({ returning: returningInsert })
      mockTxInsert.mockReturnValue({ values: valuesInsert })

      const whereUpdate = vi.fn().mockResolvedValue(undefined)
      const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
      mockTxUpdate.mockReturnValue({ set: setUpdate })

      const result = await convertirLeadACliente(LEAD_ID, USER_ID)

      expect(result.wasNew).toBe(true)
      expect(result.cliente.id).toBe('cliente-new')
      expect(mockTxInsert).toHaveBeenCalled()
    })

    it('pone isOpen=false en el lead al cerrar', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(undefined)

      const returningInsert = vi.fn().mockResolvedValue([fakeNuevoCliente])
      const valuesInsert = vi.fn().mockReturnValue({ returning: returningInsert })
      mockTxInsert.mockReturnValue({ values: valuesInsert })

      const whereUpdate = vi.fn().mockResolvedValue(undefined)
      const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
      mockTxUpdate.mockReturnValue({ set: setUpdate })

      await convertirLeadACliente(LEAD_ID, USER_ID)

      const closeCall = setUpdate.mock.calls.find((call) => call[0]?.isOpen === false)
      expect(closeCall).toBeDefined()
    })

    it('asigna creadoPor al userId recibido', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(undefined)

      const returningInsert = vi.fn().mockResolvedValue([fakeNuevoCliente])
      const valuesInsert = vi.fn().mockReturnValue({ returning: returningInsert })
      mockTxInsert.mockReturnValue({ values: valuesInsert })

      const whereUpdate = vi.fn().mockResolvedValue(undefined)
      const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
      mockTxUpdate.mockReturnValue({ set: setUpdate })

      await convertirLeadACliente(LEAD_ID, USER_ID)

      const valuesArg = valuesInsert.mock.calls[0]?.[0] as Record<string, unknown>
      expect(valuesArg).toMatchObject({ creadoPor: USER_ID })
    })
  })

  // ── Cliente with same email exists → link without duplicating ───────────

  describe('cuando ya existe un cliente con el mismo email', () => {
    it('actualiza el cliente existente con leadId (no crea uno nuevo)', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(fakeExistingCliente)

      const returningClienteUpdate = vi.fn().mockResolvedValue([
        { ...fakeExistingCliente, leadId: LEAD_ID },
      ])
      const whereClienteUpdate = vi.fn().mockReturnValue({ returning: returningClienteUpdate })
      const setClienteUpdate = vi.fn().mockReturnValue({ where: whereClienteUpdate })

      const whereLeadUpdate = vi.fn().mockResolvedValue(undefined)
      const setLeadUpdate = vi.fn().mockReturnValue({ where: whereLeadUpdate })

      mockTxUpdate
        .mockReturnValueOnce({ set: setClienteUpdate })
        .mockReturnValueOnce({ set: setLeadUpdate })

      const result = await convertirLeadACliente(LEAD_ID, USER_ID)

      expect(result.wasNew).toBe(false)
      expect(mockTxInsert).not.toHaveBeenCalled()
    })

    it('linkea el leadId en el cliente existente', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(fakeExistingCliente)

      const returningClienteUpdate = vi.fn().mockResolvedValue([
        { ...fakeExistingCliente, leadId: LEAD_ID },
      ])
      const whereClienteUpdate = vi.fn().mockReturnValue({ returning: returningClienteUpdate })
      const setClienteUpdate = vi.fn().mockReturnValue({ where: whereClienteUpdate })

      const whereLeadUpdate = vi.fn().mockResolvedValue(undefined)
      const setLeadUpdate = vi.fn().mockReturnValue({ where: whereLeadUpdate })

      mockTxUpdate
        .mockReturnValueOnce({ set: setClienteUpdate })
        .mockReturnValueOnce({ set: setLeadUpdate })

      await convertirLeadACliente(LEAD_ID, USER_ID)

      const setArg = setClienteUpdate.mock.calls[0]?.[0] as Record<string, unknown>
      expect(setArg).toMatchObject({ leadId: LEAD_ID })
    })

    it('sigue cerrando el lead aun cuando el cliente ya existía', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(fakeLead)
      mockTxQueryClientesFindFirst.mockResolvedValue(fakeExistingCliente)

      const returningClienteUpdate = vi.fn().mockResolvedValue([
        { ...fakeExistingCliente, leadId: LEAD_ID },
      ])
      const whereClienteUpdate = vi.fn().mockReturnValue({ returning: returningClienteUpdate })
      const setClienteUpdate = vi.fn().mockReturnValue({ where: whereClienteUpdate })

      const whereLeadUpdate = vi.fn().mockResolvedValue(undefined)
      const setLeadUpdate = vi.fn().mockReturnValue({ where: whereLeadUpdate })

      mockTxUpdate
        .mockReturnValueOnce({ set: setClienteUpdate })
        .mockReturnValueOnce({ set: setLeadUpdate })

      await convertirLeadACliente(LEAD_ID, USER_ID)

      const closeCall = setLeadUpdate.mock.calls.find((call) => call[0]?.isOpen === false)
      expect(closeCall).toBeDefined()
    })
  })

  // ── Error cases ──────────────────────────────────────────────────────────

  describe('errores', () => {
    it('lanza NotFoundError si el lead no existe', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue(undefined)

      await expect(convertirLeadACliente(LEAD_ID, USER_ID)).rejects.toThrow('Lead')
    })

    it('lanza NotFoundError si el lead no tiene contacto', async () => {
      mockTxQueryLeadsFindFirst.mockResolvedValue({ ...fakeLead, contact: null })

      await expect(convertirLeadACliente(LEAD_ID, USER_ID)).rejects.toThrow(
        'Contacto del lead',
      )
    })
  })
})
