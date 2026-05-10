import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockTransaction,
  mockTxQueryMetasFindFirst,
  mockTxQueryMetasFindMany,
  mockTxInsert,
  mockTxUpdate,
  mockDbQueryMetasFindFirst,
  mockDbUpdate,
  mockDbInsert,
} = vi.hoisted(() => {
  return {
    mockTransaction: vi.fn(),
    mockTxQueryMetasFindFirst: vi.fn(),
    mockTxQueryMetasFindMany: vi.fn(),
    mockTxInsert: vi.fn(),
    mockTxUpdate: vi.fn(),
    mockDbQueryMetasFindFirst: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbInsert: vi.fn(),
  }
})

vi.mock('@/db', () => ({
  db: {
    transaction: mockTransaction,
    query: {
      metas: { findFirst: mockDbQueryMetasFindFirst },
    },
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}))

vi.mock('@/db/schema', () => ({
  metas: {
    id: 'metas.id',
    vendedorId: 'metas.vendedorId',
    periodoAnio: 'metas.periodoAnio',
    periodoMes: 'metas.periodoMes',
    $inferSelect: {},
    $inferInsert: {},
  },
  auditLogMetas: {
    metaId: 'auditLogMetas.metaId',
    $inferInsert: {},
  },
  users: {
    id: 'users.id',
    name: 'users.name',
    $inferSelect: {},
  },
}))

vi.mock('@/lib/errors', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(resource: string) {
      super(`${resource} no encontrado`)
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

import {
  isMesBloqueable,
  createMeta,
  updateMetaVigente,
  duplicarMetasMesAnterior,
} from '@/lib/metas/metas.service'
import { ValidationError } from '@/lib/errors'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTx() {
  return {
    query: {
      metas: {
        findFirst: mockTxQueryMetasFindFirst,
        findMany: mockTxQueryMetasFindMany,
      },
    },
    insert: mockTxInsert,
    update: mockTxUpdate,
  }
}

const ADMIN_ID = 'admin-1'

const BASE_META_INPUT = {
  vendedorId: 'vendedor-1',
  periodoAnio: 2026,
  periodoMes: 6,
  clientesNuevosObjetivo: 5,
  pedidosObjetivo: 20,
  montoCobradoObjetivo: '100000.00',
  conversionLeadsObjetivo: '30.00',
}

function makeFakeMeta(overrides: Partial<{
  id: string
  vendedorId: string
  periodoAnio: number
  periodoMes: number
  clientesNuevosObjetivo: number
  pedidosObjetivo: number
  montoCobradoObjetivo: string
  conversionLeadsObjetivo: string
  creadoPor: string
  fechaCreacion: Date
  fechaActualizacion: Date
}> = {}) {
  return {
    id: 'meta-1',
    vendedorId: 'vendedor-1',
    periodoAnio: 2026,
    periodoMes: 5,
    clientesNuevosObjetivo: 5,
    pedidosObjetivo: 20,
    montoCobradoObjetivo: '100000.00',
    conversionLeadsObjetivo: '30.00',
    creadoPor: ADMIN_ID,
    fechaCreacion: new Date('2026-05-01'),
    fechaActualizacion: new Date('2026-05-01'),
    ...overrides,
  }
}

// ─── Tests: isMesBloqueable (exported helper) ─────────────────────────────────
//
// Today is mocked to May 2026 via vi.useFakeTimers so period comparisons are
// deterministic regardless of when the tests run.

describe('isMesBloqueable', () => {
  beforeEach(() => {
    // Fix "now" to 10 May 2026
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna "bloqueado_pasado" para un período anterior al actual (marzo 2026)', () => {
    expect(isMesBloqueable(2026, 3)).toBe('bloqueado_pasado')
  })

  it('retorna "bloqueado_pasado" para un año anterior completo (diciembre 2025)', () => {
    expect(isMesBloqueable(2025, 12)).toBe('bloqueado_pasado')
  })

  it('retorna "vigente" para el período actual (mayo 2026)', () => {
    expect(isMesBloqueable(2026, 5)).toBe('vigente')
  })

  it('retorna "futuro" para un período posterior al actual (junio 2026)', () => {
    expect(isMesBloqueable(2026, 6)).toBe('futuro')
  })

  it('retorna "futuro" para un año posterior completo (enero 2027)', () => {
    expect(isMesBloqueable(2027, 1)).toBe('futuro')
  })
})

// ─── Tests: createMeta ────────────────────────────────────────────────────────

describe('createMeta', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    vi.clearAllMocks()
    mockTransaction.mockImplementation(
      (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('crea una meta exitosamente para un período futuro (junio 2026)', async () => {
    const newMeta = makeFakeMeta({ periodoAnio: 2026, periodoMes: 6 })

    const returningMeta = vi.fn().mockResolvedValue([newMeta])
    const valuesMeta = vi.fn().mockReturnValue({ returning: returningMeta })

    const returningAudit = vi.fn().mockResolvedValue([{ id: 'audit-1' }])
    const valuesAudit = vi.fn().mockReturnValue({ returning: returningAudit })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesMeta })
      .mockReturnValueOnce({ values: valuesAudit })

    const result = await createMeta({ ...BASE_META_INPUT, periodoMes: 6 }, ADMIN_ID)

    expect(result).toMatchObject({ id: 'meta-1', periodoMes: 6 })
  })

  it('inserta la meta con creadoPor = adminId', async () => {
    const newMeta = makeFakeMeta({ periodoAnio: 2026, periodoMes: 6 })

    const returningMeta = vi.fn().mockResolvedValue([newMeta])
    const valuesMeta = vi.fn().mockReturnValue({ returning: returningMeta })
    const returningAudit = vi.fn().mockResolvedValue([{ id: 'audit-1' }])
    const valuesAudit = vi.fn().mockReturnValue({ returning: returningAudit })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesMeta })
      .mockReturnValueOnce({ values: valuesAudit })

    await createMeta({ ...BASE_META_INPUT, periodoMes: 6 }, ADMIN_ID)

    const insertArg = valuesMeta.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertArg.creadoPor).toBe(ADMIN_ID)
  })

  it('crea un registro de auditoría con accion="creacion"', async () => {
    const newMeta = makeFakeMeta({ periodoAnio: 2026, periodoMes: 6 })

    const returningMeta = vi.fn().mockResolvedValue([newMeta])
    const valuesMeta = vi.fn().mockReturnValue({ returning: returningMeta })
    const returningAudit = vi.fn().mockResolvedValue([{ id: 'audit-1' }])
    const valuesAudit = vi.fn().mockReturnValue({ returning: returningAudit })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesMeta })
      .mockReturnValueOnce({ values: valuesAudit })

    await createMeta({ ...BASE_META_INPUT, periodoMes: 6 }, ADMIN_ID)

    const auditArg = valuesAudit.mock.calls[0]?.[0] as Record<string, unknown>
    expect(auditArg.accion).toBe('creacion')
    expect(auditArg.cambiadoPor).toBe(ADMIN_ID)
  })
})

// ─── Tests: updateMetaVigente ─────────────────────────────────────────────────

describe('updateMetaVigente', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    vi.clearAllMocks()
    mockTransaction.mockImplementation(
      (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('actualiza los valores y crea entrada de auditoría con accion="correccion_vigente"', async () => {
    const existingMeta = makeFakeMeta({ periodoAnio: 2026, periodoMes: 5 })
    const updatedMeta = { ...existingMeta, pedidosObjetivo: 25 }

    mockTxQueryMetasFindFirst.mockResolvedValue(existingMeta)

    const returningUpdate = vi.fn().mockResolvedValue([updatedMeta])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const returningAudit = vi.fn().mockResolvedValue([{ id: 'audit-2' }])
    const valuesAudit = vi.fn().mockReturnValue({ returning: returningAudit })
    mockTxInsert.mockReturnValue({ values: valuesAudit })

    await updateMetaVigente('meta-1', { pedidosObjetivo: 25 }, 'Corrección de proyección', ADMIN_ID)

    const setArg = setUpdate.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.pedidosObjetivo).toBe(25)

    const auditArg = valuesAudit.mock.calls[0]?.[0] as Record<string, unknown>
    expect(auditArg.accion).toBe('correccion_vigente')
    expect(auditArg.motivo).toBe('Corrección de proyección')
    expect(auditArg.cambiadoPor).toBe(ADMIN_ID)
  })

  it('incluye oldValues y newValues en el log de auditoría', async () => {
    const existingMeta = makeFakeMeta({ periodoAnio: 2026, periodoMes: 5, pedidosObjetivo: 20 })
    const updatedMeta = { ...existingMeta, pedidosObjetivo: 30 }

    mockTxQueryMetasFindFirst.mockResolvedValue(existingMeta)

    const returningUpdate = vi.fn().mockResolvedValue([updatedMeta])
    const whereUpdate = vi.fn().mockReturnValue({ returning: returningUpdate })
    const setUpdate = vi.fn().mockReturnValue({ where: whereUpdate })
    mockTxUpdate.mockReturnValue({ set: setUpdate })

    const returningAudit = vi.fn().mockResolvedValue([{ id: 'audit-2' }])
    const valuesAudit = vi.fn().mockReturnValue({ returning: returningAudit })
    mockTxInsert.mockReturnValue({ values: valuesAudit })

    await updateMetaVigente('meta-1', { pedidosObjetivo: 30 }, 'Ajuste Q2', ADMIN_ID)

    const auditArg = valuesAudit.mock.calls[0]?.[0] as Record<string, unknown>
    const oldValues = auditArg.oldValues as Record<string, unknown>
    const newValues = auditArg.newValues as Record<string, unknown>

    expect(oldValues.pedidosObjetivo).toBe(20)
    expect(newValues.pedidosObjetivo).toBe(30)
  })

  it('lanza ValidationError cuando se intenta actualizar una meta de período pasado (marzo 2026)', async () => {
    const pastMeta = makeFakeMeta({ periodoAnio: 2026, periodoMes: 3 })
    mockTxQueryMetasFindFirst.mockResolvedValue(pastMeta)

    await expect(
      updateMetaVigente('meta-past', { pedidosObjetivo: 10 }, 'motivo', ADMIN_ID),
    ).rejects.toThrow(ValidationError)
  })

  it('lanza ValidationError cuando se intenta actualizar una meta futura con updateMetaVigente', async () => {
    const futureMeta = makeFakeMeta({ periodoAnio: 2026, periodoMes: 7 })
    mockTxQueryMetasFindFirst.mockResolvedValue(futureMeta)

    await expect(
      updateMetaVigente('meta-future', { pedidosObjetivo: 10 }, 'motivo', ADMIN_ID),
    ).rejects.toThrow(ValidationError)
  })

  it('lanza NotFoundError si la meta no existe', async () => {
    mockTxQueryMetasFindFirst.mockResolvedValue(undefined)

    await expect(
      updateMetaVigente('meta-inexistente', { pedidosObjetivo: 10 }, 'motivo', ADMIN_ID),
    ).rejects.toThrow('Meta')
  })
})

// ─── Tests: duplicarMetasMesAnterior ─────────────────────────────────────────

describe('duplicarMetasMesAnterior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z'))
    vi.clearAllMocks()
    mockTransaction.mockImplementation(
      (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('copia todas las metas del mes anterior para el mes objetivo', async () => {
    const aprilMetas = [
      makeFakeMeta({ id: 'meta-v1', vendedorId: 'vendedor-1', periodoAnio: 2026, periodoMes: 4 }),
      makeFakeMeta({ id: 'meta-v2', vendedorId: 'vendedor-2', periodoAnio: 2026, periodoMes: 4 }),
    ]

    // Source metas (April)
    mockTxQueryMetasFindMany
      .mockResolvedValueOnce(aprilMetas)
      // Existing metas for May → none
      .mockResolvedValueOnce([])

    const newMetas = [
      { ...aprilMetas[0]!, id: 'meta-new-v1', periodoMes: 5 },
      { ...aprilMetas[1]!, id: 'meta-new-v2', periodoMes: 5 },
    ]
    const returningInsertMetas = vi.fn().mockResolvedValue(newMetas)
    const valuesInsertMetas = vi.fn().mockReturnValue({ returning: returningInsertMetas })

    const returningInsertAudit = vi.fn().mockResolvedValue([])
    const valuesInsertAudit = vi.fn().mockReturnValue({ returning: returningInsertAudit })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesInsertMetas })
      .mockReturnValueOnce({ values: valuesInsertAudit })

    const result = await duplicarMetasMesAnterior(2026, 5, ADMIN_ID)

    expect(result.created).toBe(2)
  })

  it('omite vendedores que ya tienen meta para el mes objetivo', async () => {
    const aprilMetas = [
      makeFakeMeta({ id: 'meta-v1', vendedorId: 'vendedor-1', periodoAnio: 2026, periodoMes: 4 }),
      makeFakeMeta({ id: 'meta-v2', vendedorId: 'vendedor-2', periodoAnio: 2026, periodoMes: 4 }),
    ]

    // Source metas (April)
    mockTxQueryMetasFindMany
      .mockResolvedValueOnce(aprilMetas)
      // vendedor-1 already has a May meta
      .mockResolvedValueOnce([{ vendedorId: 'vendedor-1' }])

    const newMeta = { ...aprilMetas[1]!, id: 'meta-new-v2', periodoMes: 5 }
    const returningInsertMetas = vi.fn().mockResolvedValue([newMeta])
    const valuesInsertMetas = vi.fn().mockReturnValue({ returning: returningInsertMetas })

    const returningInsertAudit = vi.fn().mockResolvedValue([])
    const valuesInsertAudit = vi.fn().mockReturnValue({ returning: returningInsertAudit })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesInsertMetas })
      .mockReturnValueOnce({ values: valuesInsertAudit })

    const result = await duplicarMetasMesAnterior(2026, 5, ADMIN_ID)

    expect(result.created).toBe(1)

    // Verify vendedor-1 was excluded from the insert payload
    const insertedValues = valuesInsertMetas.mock.calls[0]?.[0] as Array<Record<string, unknown>>
    const vendedorIds = insertedValues.map((v) => v.vendedorId)
    expect(vendedorIds).not.toContain('vendedor-1')
    expect(vendedorIds).toContain('vendedor-2')
  })

  it('retorna { created: 0 } cuando no existen metas en el mes fuente', async () => {
    // No metas found for source period
    mockTxQueryMetasFindMany.mockResolvedValueOnce([])

    const result = await duplicarMetasMesAnterior(2026, 5, ADMIN_ID)

    expect(result.created).toBe(0)
    expect(mockTxInsert).not.toHaveBeenCalled()
  })

  it('retorna { created: 0 } cuando todos los vendedores ya tienen meta para el mes objetivo', async () => {
    const aprilMetas = [
      makeFakeMeta({ id: 'meta-v1', vendedorId: 'vendedor-1', periodoAnio: 2026, periodoMes: 4 }),
    ]

    mockTxQueryMetasFindMany
      .mockResolvedValueOnce(aprilMetas)
      .mockResolvedValueOnce([{ vendedorId: 'vendedor-1' }])

    const result = await duplicarMetasMesAnterior(2026, 5, ADMIN_ID)

    expect(result.created).toBe(0)
    expect(mockTxInsert).not.toHaveBeenCalled()
  })

  it('calcula correctamente el mes fuente al cruzar año (enero → fuente = diciembre del año anterior)', async () => {
    // Target: January 2027 → source: December 2026
    const decMetas = [
      makeFakeMeta({ id: 'meta-dec', vendedorId: 'vendedor-1', periodoAnio: 2026, periodoMes: 12 }),
    ]

    mockTxQueryMetasFindMany
      .mockResolvedValueOnce(decMetas)
      .mockResolvedValueOnce([])

    const newMeta = { ...decMetas[0]!, id: 'meta-jan', periodoAnio: 2027, periodoMes: 1 }
    const returningInsertMetas = vi.fn().mockResolvedValue([newMeta])
    const valuesInsertMetas = vi.fn().mockReturnValue({ returning: returningInsertMetas })
    const returningInsertAudit = vi.fn().mockResolvedValue([])
    const valuesInsertAudit = vi.fn().mockReturnValue({ returning: returningInsertAudit })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesInsertMetas })
      .mockReturnValueOnce({ values: valuesInsertAudit })

    const result = await duplicarMetasMesAnterior(2027, 1, ADMIN_ID)

    expect(result.created).toBe(1)

    const insertedValues = valuesInsertMetas.mock.calls[0]?.[0] as Array<Record<string, unknown>>
    expect(insertedValues[0]?.periodoAnio).toBe(2027)
    expect(insertedValues[0]?.periodoMes).toBe(1)
  })

  it('propaga los valores objetivo del mes fuente al mes destino', async () => {
    const sourceMeta = makeFakeMeta({
      id: 'meta-src',
      vendedorId: 'vendedor-1',
      periodoAnio: 2026,
      periodoMes: 4,
      clientesNuevosObjetivo: 8,
      pedidosObjetivo: 30,
      montoCobradoObjetivo: '200000.00',
      conversionLeadsObjetivo: '45.00',
    })

    mockTxQueryMetasFindMany
      .mockResolvedValueOnce([sourceMeta])
      .mockResolvedValueOnce([])

    const returningInsertMetas = vi.fn().mockResolvedValue([{
      ...sourceMeta,
      id: 'meta-new',
      periodoMes: 5,
    }])
    const valuesInsertMetas = vi.fn().mockReturnValue({ returning: returningInsertMetas })
    const returningInsertAudit = vi.fn().mockResolvedValue([])
    const valuesInsertAudit = vi.fn().mockReturnValue({ returning: returningInsertAudit })

    mockTxInsert
      .mockReturnValueOnce({ values: valuesInsertMetas })
      .mockReturnValueOnce({ values: valuesInsertAudit })

    await duplicarMetasMesAnterior(2026, 5, ADMIN_ID)

    const insertedValues = valuesInsertMetas.mock.calls[0]?.[0] as Array<Record<string, unknown>>
    expect(insertedValues[0]?.clientesNuevosObjetivo).toBe(8)
    expect(insertedValues[0]?.pedidosObjetivo).toBe(30)
    expect(insertedValues[0]?.montoCobradoObjetivo).toBe('200000.00')
    expect(insertedValues[0]?.conversionLeadsObjetivo).toBe('45.00')
  })
})
