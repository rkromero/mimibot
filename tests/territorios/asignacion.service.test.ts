import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockDbQueryTerritoriosFindFirst,
  mockDbQueryClientesFindFirst,
  mockDbQueryClientesFindMany,
  mockDbTransaction,
  mockGetAgenteActivo,
} = vi.hoisted(() => ({
  mockDbQueryTerritoriosFindFirst: vi.fn(),
  mockDbQueryClientesFindFirst: vi.fn(),
  mockDbQueryClientesFindMany: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockGetAgenteActivo: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    transaction: mockDbTransaction,
    query: {
      territorios: { findFirst: mockDbQueryTerritoriosFindFirst },
      clientes: {
        findFirst: mockDbQueryClientesFindFirst,
        findMany: mockDbQueryClientesFindMany,
      },
    },
  },
}))

vi.mock('@/db/schema', () => ({
  territorios: { id: 'territorios.id', deletedAt: 'territorios.deletedAt' },
  clientes: { id: 'c.id', territorioId: 'c.territorioId', asignadoA: 'c.asignadoA', deletedAt: 'c.deletedAt' },
  territorioAgente: {},
  historialTeritorioCliente: { clienteId: 'h.clienteId' },
}))

vi.mock('@/lib/errors', () => ({
  AuthzError: class AuthzError extends Error {
    constructor(msg: string) { super(msg); this.name = 'AuthzError' }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(r: string) { super(`${r} not found`); this.name = 'NotFoundError' }
  },
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ValidationError' }
  },
}))

vi.mock('@/lib/territorios/territorios.service', () => ({
  getAgenteActivo: mockGetAgenteActivo,
}))

import {
  resolverTerritorioPorRol,
  moverClienteATerritorio,
  getClienteIdsVisibles,
} from '@/lib/territorios/asignacion.service'
import type { SessionContext } from '@/lib/territorios/context'

function makeCtx(overrides: Partial<SessionContext>): SessionContext {
  return {
    userId: 'u-1',
    role: 'agent',
    territoriosGestionados: [],
    agentesVisibles: [],
    territoriosActivos: [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: auto-asignación de territorio al crear cliente según rol
// Scenario 4: gerente "en nombre de" → agenteId imputa al agente, no al gerente
// ─────────────────────────────────────────────────────────────────────────────

describe('resolverTerritorioPorRol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAgenteActivo.mockResolvedValue(null)
  })

  describe('agent', () => {
    it('auto-asigna el único territorio activo del agente', async () => {
      const ctx = makeCtx({ role: 'agent', userId: 'agent-1', territoriosActivos: ['t-1'] })
      const result = await resolverTerritorioPorRol(ctx)
      expect(result).toEqual({ territorioId: 't-1', agenteId: 'agent-1' })
    })

    it('lanza ValidationError si el agente tiene varios territorios y no especifica uno', async () => {
      const ctx = makeCtx({ role: 'agent', territoriosActivos: ['t-1', 't-2'] })
      await expect(resolverTerritorioPorRol(ctx)).rejects.toMatchObject({ name: 'ValidationError' })
    })

    it('lanza AuthzError si el territorio especificado no pertenece al agente', async () => {
      const ctx = makeCtx({ role: 'agent', territoriosActivos: ['t-1'] })
      await expect(resolverTerritorioPorRol(ctx, 't-ajeno')).rejects.toMatchObject({ name: 'AuthzError' })
    })

    it('respeta el territorio especificado cuando el agente es activo en él', async () => {
      const ctx = makeCtx({ role: 'agent', userId: 'agent-1', territoriosActivos: ['t-1', 't-2'] })
      const result = await resolverTerritorioPorRol(ctx, 't-2')
      expect(result).toEqual({ territorioId: 't-2', agenteId: 'agent-1' })
    })

    it('retorna territorioId null cuando el agente no tiene territorios asignados', async () => {
      const ctx = makeCtx({ role: 'agent', userId: 'agent-1', territoriosActivos: [] })
      const result = await resolverTerritorioPorRol(ctx)
      expect(result).toEqual({ territorioId: null, agenteId: 'agent-1' })
    })
  })

  describe('gerente — "en nombre de" (scenario 4)', () => {
    it('retorna null,null cuando no especifica territorio', async () => {
      const ctx = makeCtx({ role: 'gerente', userId: 'g-1', territoriosGestionados: ['t-1'] })
      const result = await resolverTerritorioPorRol(ctx)
      expect(result).toEqual({ territorioId: null, agenteId: null })
    })

    it('lanza AuthzError si el territorio no está bajo su gestión', async () => {
      const ctx = makeCtx({ role: 'gerente', territoriosGestionados: ['t-1'] })
      await expect(resolverTerritorioPorRol(ctx, 't-otro')).rejects.toMatchObject({ name: 'AuthzError' })
    })

    it('imputa al agente activo del territorio, no al gerente (scenario 4)', async () => {
      const ctx = makeCtx({ role: 'gerente', userId: 'gerente-1', territoriosGestionados: ['t-1'] })
      mockGetAgenteActivo.mockResolvedValue({ agenteId: 'agent-1' })

      const result = await resolverTerritorioPorRol(ctx, 't-1')

      expect(result.territorioId).toBe('t-1')
      expect(result.agenteId).toBe('agent-1')
      expect(result.agenteId).not.toBe('gerente-1')
    })

    it('retorna agenteId null si el territorio no tiene agente activo', async () => {
      const ctx = makeCtx({ role: 'gerente', territoriosGestionados: ['t-1'] })
      mockGetAgenteActivo.mockResolvedValue(null)

      const result = await resolverTerritorioPorRol(ctx, 't-1')
      expect(result).toEqual({ territorioId: 't-1', agenteId: null })
    })
  })

  describe('admin', () => {
    it('retorna null,null cuando no especifica territorio', async () => {
      const ctx = makeCtx({ role: 'admin' })
      const result = await resolverTerritorioPorRol(ctx)
      expect(result).toEqual({ territorioId: null, agenteId: null })
    })

    it('lanza NotFoundError si el territorio especificado no existe', async () => {
      const ctx = makeCtx({ role: 'admin' })
      mockDbQueryTerritoriosFindFirst.mockResolvedValue(null)

      await expect(resolverTerritorioPorRol(ctx, 't-nope')).rejects.toMatchObject({ name: 'NotFoundError' })
    })

    it('retorna el territorio con el agente activo', async () => {
      const ctx = makeCtx({ role: 'admin' })
      mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-1' })
      mockGetAgenteActivo.mockResolvedValue({ agenteId: 'agent-1' })

      const result = await resolverTerritorioPorRol(ctx, 't-1')
      expect(result).toEqual({ territorioId: 't-1', agenteId: 'agent-1' })
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: moverClienteATerritorio — mueve cliente y preserva historial
// ─────────────────────────────────────────────────────────────────────────────

describe('moverClienteATerritorio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAgenteActivo.mockResolvedValue(null)
  })

  it('actualiza el cliente y registra historial en una sola transacción', async () => {
    mockDbQueryClientesFindFirst.mockResolvedValue({ id: 'c-1', territorioId: 't-old' })
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-new' })
    mockGetAgenteActivo.mockResolvedValue({ agenteId: 'agent-1' })

    const txInsertValues = vi.fn().mockResolvedValue([])
    const txInsert = vi.fn().mockReturnValue({ values: txInsertValues })
    const txUpdateWhere = vi.fn().mockResolvedValue([])
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere })
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet })

    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      return fn({ update: txUpdate, insert: txInsert })
    })

    const result = await moverClienteATerritorio('c-1', 't-new', 'admin-1')

    expect(result).toEqual({ clienteId: 'c-1', nuevoTerritorioId: 't-new', nuevoAgenteId: 'agent-1' })
    expect(txInsert).toHaveBeenCalled()
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 'c-1',
        territorioAnteriorId: 't-old',
        territorioNuevoId: 't-new',
        cambiadoPor: 'admin-1',
      }),
    )
  })

  it('el historial registra territorioAnteriorId null si el cliente no tenía territorio', async () => {
    mockDbQueryClientesFindFirst.mockResolvedValue({ id: 'c-1', territorioId: null })
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-new' })

    const txInsertValues = vi.fn().mockResolvedValue([])
    const txInsert = vi.fn().mockReturnValue({ values: txInsertValues })
    const txUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) })
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet })

    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      return fn({ update: txUpdate, insert: txInsert })
    })

    await moverClienteATerritorio('c-1', 't-new', 'admin-1')

    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ territorioAnteriorId: null }),
    )
  })

  it('lanza NotFoundError si el cliente no existe', async () => {
    mockDbQueryClientesFindFirst.mockResolvedValue(null)

    await expect(moverClienteATerritorio('c-nope', 't-1', 'admin-1'))
      .rejects.toMatchObject({ name: 'NotFoundError' })
  })

  it('lanza NotFoundError si el territorio destino no existe', async () => {
    mockDbQueryClientesFindFirst.mockResolvedValue({ id: 'c-1', territorioId: 't-old' })
    mockDbQueryTerritoriosFindFirst.mockResolvedValue(null)

    await expect(moverClienteATerritorio('c-1', 't-nope', 'admin-1'))
      .rejects.toMatchObject({ name: 'NotFoundError' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: getClienteIdsVisibles — visibilidad estricta por rol
// ─────────────────────────────────────────────────────────────────────────────

describe('getClienteIdsVisibles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('admin retorna "all" sin consultar la base de datos', async () => {
    const ctx = makeCtx({ role: 'admin' })
    const result = await getClienteIdsVisibles(ctx)
    expect(result).toBe('all')
    expect(mockDbQueryClientesFindMany).not.toHaveBeenCalled()
  })

  it('agente retorna solo sus propios clientes', async () => {
    const ctx = makeCtx({ role: 'agent', userId: 'agent-1' })
    mockDbQueryClientesFindMany.mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }])

    const result = await getClienteIdsVisibles(ctx)
    expect(result).toEqual(['c-1', 'c-2'])
  })

  it('gerente sin territorios gestionados retorna [] sin consultar la base', async () => {
    const ctx = makeCtx({ role: 'gerente', territoriosGestionados: [] })
    const result = await getClienteIdsVisibles(ctx)
    expect(result).toEqual([])
    expect(mockDbQueryClientesFindMany).not.toHaveBeenCalled()
  })

  it('gerente solo ve clientes de sus territorios gestionados', async () => {
    const ctx = makeCtx({ role: 'gerente', territoriosGestionados: ['t-1', 't-2'] })
    mockDbQueryClientesFindMany.mockResolvedValue([{ id: 'c-3' }, { id: 'c-4' }])

    const result = await getClienteIdsVisibles(ctx)
    expect(result).toEqual(['c-3', 'c-4'])
  })
})
