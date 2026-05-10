import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockDbQueryTerritoriosFindFirst,
  mockDbUpdate,
  mockDbSelect,
} = vi.hoisted(() => ({
  mockDbQueryTerritoriosFindFirst: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
}))

vi.mock('@/db', () => ({
  db: {
    query: {
      territorios: { findFirst: mockDbQueryTerritoriosFindFirst },
      territorioAgente: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      territorioGerente: { findMany: vi.fn().mockResolvedValue([]) },
      users: { findFirst: vi.fn().mockResolvedValue(null) },
      clientes: { findMany: vi.fn().mockResolvedValue([]) },
    },
    update: mockDbUpdate,
    select: mockDbSelect,
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue([]) }) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  },
}))

vi.mock('@/db/schema', () => ({
  territorios: { id: 't.id', nombre: 't.nombre', deletedAt: 't.deletedAt', esLegacy: 't.esLegacy', activo: 't.activo' },
  territorioAgente: { territorioId: 'ta.territorioId', agenteId: 'ta.agenteId', fechaDesasignacion: 'ta.fd' },
  territorioGerente: { territorioId: 'tg.territorioId', gerenteId: 'tg.gerenteId' },
  clientes: { territorioId: 'c.territorioId', deletedAt: 'c.deletedAt' },
  users: { id: 'u.id', role: 'u.role' },
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

import { getTerritorio, darDeBajaTerritorio } from '@/lib/territorios/territorios.service'
import { requireAdmin } from '@/lib/authz'
import type { SessionContext } from '@/lib/territorios/context'

function makeCtx(overrides: Partial<SessionContext>): SessionContext {
  return {
    userId: 'u-1',
    role: 'admin',
    territoriosGestionados: [],
    agentesVisibles: [],
    territoriosActivos: [],
    ...overrides,
  }
}

function makeUpdateChain() {
  const mockWhere = vi.fn().mockResolvedValue([])
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  mockDbUpdate.mockReturnValue({ set: mockSet })
  return { mockSet, mockWhere }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: getTerritorio — gerente no ve fuera de su zona
// ─────────────────────────────────────────────────────────────────────────────

describe('getTerritorio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('admin puede acceder a cualquier territorio', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-1', nombre: 'Norte' })
    const result = await getTerritorio('t-1', makeCtx({ role: 'admin' }))
    expect(result).toMatchObject({ id: 't-1' })
  })

  it('gerente accede a un territorio bajo su gestión', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-1', nombre: 'Norte' })
    const ctx = makeCtx({ role: 'gerente', territoriosGestionados: ['t-1'] })
    const result = await getTerritorio('t-1', ctx)
    expect(result).toMatchObject({ id: 't-1' })
  })

  it('gerente lanza AuthzError al acceder a territorio fuera de su zona', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-1', nombre: 'Norte' })
    const ctx = makeCtx({ role: 'gerente', territoriosGestionados: ['t-2'] })
    await expect(getTerritorio('t-1', ctx)).rejects.toMatchObject({ name: 'AuthzError' })
  })

  it('agente lanza AuthzError al acceder a territorio donde no es activo', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-1', nombre: 'Norte' })
    const ctx = makeCtx({ role: 'agent', territoriosActivos: ['t-2'] })
    await expect(getTerritorio('t-1', ctx)).rejects.toMatchObject({ name: 'AuthzError' })
  })

  it('lanza NotFoundError si el territorio no existe o fue dado de baja', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue(null)
    await expect(getTerritorio('t-nope', makeCtx())).rejects.toMatchObject({ name: 'NotFoundError' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: bloqueo de edición de metas para gerente
// El PUT /api/metas/[id] está protegido por requireAdmin que bloquea gerente
// ─────────────────────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('lanza para role gerente (no puede editar metas guardadas)', () => {
    expect(() => requireAdmin({ id: 'g-1', role: 'gerente' } as never)).toThrow()
  })

  it('lanza para role agent', () => {
    expect(() => requireAdmin({ id: 'a-1', role: 'agent' } as never)).toThrow()
  })

  it('no lanza para role admin', () => {
    expect(() => requireAdmin({ id: 'adm-1', role: 'admin' } as never)).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: no se puede eliminar territorio con clientes asignados
// Scenario 7: territorio legacy "Sin asignar" no puede ser eliminado
// ─────────────────────────────────────────────────────────────────────────────

describe('darDeBajaTerritorio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeUpdateChain()
  })

  it('(scenario 7) lanza ValidationError al intentar eliminar el territorio legacy "Sin asignar"', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-sin-asignar', esLegacy: true })

    await expect(darDeBajaTerritorio('t-sin-asignar')).rejects.toMatchObject({ name: 'ValidationError' })
    expect(mockDbSelect).not.toHaveBeenCalled()
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('(scenario 6) lanza ValidationError cuando el territorio tiene clientes asignados', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-1', esLegacy: false })
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 3 }]),
      }),
    })

    await expect(darDeBajaTerritorio('t-1')).rejects.toMatchObject({ name: 'ValidationError' })
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('el mensaje de error incluye la cantidad de clientes afectados', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-1', esLegacy: false })
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 5 }]),
      }),
    })

    await expect(darDeBajaTerritorio('t-1')).rejects.toMatchObject({
      name: 'ValidationError',
      message: expect.stringContaining('5'),
    })
  })

  it('soft-deletes el territorio cuando no tiene clientes', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue({ id: 't-1', esLegacy: false })
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ value: 0 }]),
      }),
    })
    const { mockSet } = makeUpdateChain()

    await expect(darDeBajaTerritorio('t-1')).resolves.toBeUndefined()
    expect(mockDbUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false, deletedAt: expect.any(Date) }),
    )
  })

  it('lanza NotFoundError si el territorio no existe', async () => {
    mockDbQueryTerritoriosFindFirst.mockResolvedValue(null)

    await expect(darDeBajaTerritorio('t-nope')).rejects.toMatchObject({ name: 'NotFoundError' })
  })
})
