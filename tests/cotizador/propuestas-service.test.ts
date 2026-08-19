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
import { armarDatosPropuestaPdf } from '@/lib/pdf/propuesta.service'
import { parseCondiciones } from '@/lib/pdf/propuesta.template'
import type { propuestas as propuestasTable } from '@/db/schema'

const CONDICIONES = [
  '1. VALIDEZ. Siete días corridos.',
  '2. PAGO. Seña del 50% al confirmar.',
  '3. PRODUCCION. Quince días hábiles.',
  '4. ENTREGA. En planta ALIPRO.',
  '5. IMPUESTOS. Importes netos de IVA.',
].join('\n\n')

const SNAPSHOT: CotizadorSnapshot = {
  formulaVersion: 3,
  margenPct: 50,
  cargoSetupPersonalizado: 50_000,
  alfajoresPorCaja: 12,
  topeDescuentoPct: 10,
  validezDias: 7,
  condicionesComerciales: CONDICIONES,
  condicionesPackagingPersonalizado: 'Packaging personalizado. La bobina la provee el cliente.',
  precioBobinaUnit: 50,
  precioCajaUnit: 600,
  recetas: { 60: [{ gramos: 60, precioPorKg: 10_000 }] },
  escalones: [{ cantidadMin: 1000, cantidadMax: null, descuentoPct: 5 }],
}

type InsertValues = Record<string, unknown>

// tx mock: distingue las tablas por identidad (schema real, sin mockear).
// No expone select ni count: si la numeración dependiera de contar filas
// vivas, el mock explotaría.
function makeTx(capturas: { propuesta: InsertValues | null }, lastNumber = 3) {
  return {
    execute: vi.fn().mockResolvedValue([]),
    insert: vi.fn((table: unknown) => {
      if (table === documentCounters) {
        return {
          values: () => ({
            onConflictDoUpdate: () => ({
              returning: () => Promise.resolve([{ tipo: 'propuesta', lastNumber }]),
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

  it('el correlativo sale de document_counters: borrar la última no lo reutiliza', async () => {
    // Escenario: se creó la propuesta 5 y se borró (soft delete). El contador
    // sigue en 5, así que la próxima es la 6 — la numeración nunca cuenta
    // filas vivas (el tx mock ni siquiera permite consultar propuestas).
    const capturas: { propuesta: InsertValues | null } = { propuesta: null }
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx(capturas, 5)))

    await crearPropuesta(
      'lead-1',
      { cantidad: 1000, gramaje: 60, packaging: 'cristal', descuentoManualPct: 0 },
      'user-1',
    )

    expect(capturas.propuesta?.numero).toBe(6)
  })

  it('regresión: el snapshot persistido lleva las condiciones y el PDF las recibe', async () => {
    const capturas: { propuesta: InsertValues | null } = { propuesta: null }
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx(capturas)))

    await crearPropuesta(
      'lead-1',
      { cantidad: 1000, gramaje: 60, packaging: 'cristal', descuentoManualPct: 0 },
      'user-1',
    )

    // 1) El jsonb persistido contiene los textos de condiciones congelados,
    //    incluida la cláusula condicional de packaging
    const persistido = capturas.propuesta?.snapshot as CotizadorSnapshot
    expect(persistido.condicionesComerciales).toBe(CONDICIONES)
    expect(persistido.condicionesPackagingPersonalizado).toBe(
      'Packaging personalizado. La bobina la provee el cliente.',
    )

    // 2) El armado del PDF desde esa fila las recibe y el parser ve las 5
    //    cláusulas con su título en negrita
    const fila = {
      id: 'prop-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      aprobadoPor: null,
      ...capturas.propuesta,
    } as typeof propuestasTable.$inferSelect
    const data = armarDatosPropuestaPdf(
      fila,
      { name: 'Cliente', phone: null, email: null },
      null,
      'Vendedor',
      { nombre: 'ALIPRO', cuit: null, direccion: null, telefono: null, email: null },
    )
    expect(data.condicionesComerciales).toBe(CONDICIONES)
    const clausulas = parseCondiciones(data.condicionesComerciales!)
    expect(clausulas).toHaveLength(5)
    // La numeración original se descarta: la asigna numerarCondiciones al render
    expect(clausulas[0]!.titulo).toBe('VALIDEZ.')
    expect(clausulas[4]!.titulo).toBe('IMPUESTOS.')
  })
})
