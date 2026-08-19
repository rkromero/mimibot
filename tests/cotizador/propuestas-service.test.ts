import { describe, it, expect, vi, beforeEach } from 'vitest'
import { documentCounters, propuestas } from '@/db/schema'
import type { CotizadorSnapshot } from '@/lib/cotizador/calculo'

const { mockTransaction, mockArmarSnapshot } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockArmarSnapshot: vi.fn(),
}))

vi.mock('@/db', () => ({ db: { transaction: mockTransaction } }))
vi.mock('@/lib/cotizador/snapshot', () => ({ armarSnapshotCotizador: mockArmarSnapshot }))

import { crearPropuesta } from '@/lib/cotizador/propuestas.service'

const SNAPSHOT: CotizadorSnapshot = {
  margenPct: 50,
  cargoSetupPersonalizado: 50_000,
  alfajoresPorCaja: 12,
  topeDescuentoPct: 10,
  validezDias: 7,
  precioBobinaUnit: 50,
  precioCajaUnit: 600,
  recetas: { 60: [{ gramos: 60, precioPorKg: 10_000 }] },
  escalones: [{ cantidadMin: 1000, cantidadMax: null, descuentoPct: 5 }],
}

type InsertValues = Record<string, unknown>

// tx mock: distingue las tablas por identidad (schema real, sin mockear)
function makeTx(capturas: { propuesta: InsertValues | null }) {
  return {
    execute: vi.fn().mockResolvedValue([]),
    insert: vi.fn((table: unknown) => {
      if (table === documentCounters) {
        return {
          values: () => ({
            onConflictDoUpdate: () => ({
              returning: () => Promise.resolve([{ tipo: 'propuesta', lastNumber: 3 }]),
            }),
          }),
        }
      }
      if (table === propuestas) {
        return {
          values: (v: InsertValues) => {
            capturas.propuesta = v
            return { returning: () => Promise.resolve([{ id: 'prop-1', ...v }]) }
          },
        }
      }
      throw new Error('tabla inesperada en insert')
    }),
    update: vi.fn(() => ({
      set: () => ({ where: () => Promise.resolve() }),
    })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockArmarSnapshot.mockResolvedValue(SNAPSHOT)
})

describe('crearPropuesta', () => {
  it('descuento sobre el tope → nace en pendiente_aprobacion', async () => {
    const capturas: { propuesta: InsertValues | null } = { propuesta: null }
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx(capturas)))

    await crearPropuesta(
      'lead-1',
      { cantidad: 1000, gramaje: 60, packaging: 'cristal', descuentoManualPct: 15 },
      'user-1',
    )

    expect(capturas.propuesta?.estado).toBe('pendiente_aprobacion')
    expect(capturas.propuesta?.descuentoManualPct).toBe('15.00')
  })

  it('descuento dentro del tope → nace en borrador', async () => {
    const capturas: { propuesta: InsertValues | null } = { propuesta: null }
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx(capturas)))

    await crearPropuesta(
      'lead-1',
      { cantidad: 1000, gramaje: 60, packaging: 'cristal', descuentoManualPct: 10 },
      'user-1',
    )

    expect(capturas.propuesta?.estado).toBe('borrador')
  })

  it('congela snapshot y resultado, numera correlativo y fija vigencia', async () => {
    const capturas: { propuesta: InsertValues | null } = { propuesta: null }
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx(capturas)))

    await crearPropuesta(
      'lead-1',
      { cantidad: 1000, gramaje: 60, packaging: 'personalizado', descuentoManualPct: 0 },
      'user-1',
    )

    const p = capturas.propuesta
    expect(p?.numero).toBe(4) // lastNumber 3 + 1 (patrón document_counters)
    expect(p?.snapshot).toEqual(SNAPSHOT) // parámetros congelados tal cual
    const resultado = p?.resultado as { escenarios: Array<{ elegido: boolean; setup: number }> }
    expect(resultado.escenarios[0]?.elegido).toBe(true)
    expect(resultado.escenarios[0]?.setup).toBe(50_000)
    expect(p?.vigenteHasta).toMatch(/^\d{4}-\d{2}-\d{2}$/) // hoy + validezDias
    expect(p?.creadoPor).toBe('user-1')
  })
})
