import { describe, it, expect } from 'vitest'
import { calcularEscenarios } from '@/lib/cotizador/escenarios'
import type { CotizadorSnapshot, CotizacionInput } from '@/lib/cotizador/calculo'

/**
 * La garantía central de las propuestas: el snapshot congelado al cotizar
 * permite reconstruir el resultado idéntico meses después, aunque los precios
 * de insumos o la config hayan cambiado. Nunca se recalcula desde la config
 * actual al releer una propuesta.
 */

const INPUT: CotizacionInput = {
  cantidad: 1000,
  gramaje: 60,
  packaging: 'personalizado',
  descuentoManualPct: 5,
}

// Snapshot vigente al momento de crear la propuesta
const SNAPSHOT_CONGELADO: CotizadorSnapshot = {
  formulaVersion: 3,
  margenPct: 50,
  cargoSetupPersonalizado: 50_000,
  alfajoresPorCaja: 12,
  topeDescuentoPct: 10,
  validezDias: 7,
  condicionesComerciales: 'Condiciones congeladas al cotizar.',
  condicionesPackagingPersonalizado: 'Packaging personalizado congelado.',
  precioBobinaUnit: 50,
  precioCajaUnit: 600,
  recetas: {
    60: [
      { gramos: 30, precioPorKg: 10_000 },
      { gramos: 20, precioPorKg: 5_000 },
      { gramos: 10, precioPorKg: 20_000 },
    ],
  },
  escalones: [
    { cantidadMin: 100, cantidadMax: 999, descuentoPct: 0 },
    { cantidadMin: 1000, cantidadMax: 4999, descuentoPct: 5 },
    { cantidadMin: 5000, cantidadMax: 9999, descuentoPct: 10 },
    { cantidadMin: 10000, cantidadMax: null, descuentoPct: 15 },
  ],
}

describe('propuesta congelada por snapshot', () => {
  it('se recalcula idéntica desde su snapshot aunque los insumos cambien de precio', () => {
    // Al crear la propuesta: resultado congelado en propuestas.resultado
    const resultadoGuardado = calcularEscenarios(INPUT, SNAPSHOT_CONGELADO)

    // Meses después la config vigente cambió: insumos más caros, otro margen,
    // otros escalones
    const snapshotActual: CotizadorSnapshot = {
      ...SNAPSHOT_CONGELADO,
      margenPct: 80,
      precioBobinaUnit: 120,
      precioCajaUnit: 1500,
      recetas: {
        60: [
          { gramos: 30, precioPorKg: 18_000 },
          { gramos: 20, precioPorKg: 9_500 },
          { gramos: 10, precioPorKg: 31_000 },
        ],
      },
      escalones: [{ cantidadMin: 1, cantidadMax: null, descuentoPct: 2 }],
    }

    // Releer la propuesta = recalcular desde SU snapshot → idéntico
    const releido = calcularEscenarios(INPUT, SNAPSHOT_CONGELADO)
    expect(releido).toEqual(resultadoGuardado)

    // Recalcular desde la config actual daría otra cosa (por eso no se hace)
    const conConfigActual = calcularEscenarios(INPUT, snapshotActual)
    expect(conConfigActual[0]!.total).not.toBe(resultadoGuardado[0]!.total)
  })

  it('sobrevive el round-trip por jsonb (JSON.stringify/parse)', () => {
    const resultadoGuardado = calcularEscenarios(INPUT, SNAPSHOT_CONGELADO)
    // propuestas.snapshot es jsonb: lo que se lee de la db pasó por JSON
    const snapshotPersistido = JSON.parse(JSON.stringify(SNAPSHOT_CONGELADO)) as CotizadorSnapshot
    expect(calcularEscenarios(INPUT, snapshotPersistido)).toEqual(resultadoGuardado)
  })
})

describe('calcularEscenarios', () => {
  it('devuelve la cantidad pedida más los dos escalones siguientes, marcando el elegido', () => {
    const escenarios = calcularEscenarios(INPUT, SNAPSHOT_CONGELADO)
    expect(escenarios.map((e) => e.cantidad)).toEqual([1000, 5000, 10000])
    expect(escenarios.map((e) => e.elegido)).toEqual([true, false, false])
    // Todos con el mismo packaging/descuento: el setup aparece en los tres
    expect(escenarios.every((e) => e.setup === 50_000)).toBe(true)
  })

  it('sin escalones siguientes devuelve solo el escenario pedido', () => {
    const escenarios = calcularEscenarios({ ...INPUT, cantidad: 20_000 }, SNAPSHOT_CONGELADO)
    expect(escenarios).toHaveLength(1)
    expect(escenarios[0]!.elegido).toBe(true)
  })

  it('con un solo escalón siguiente devuelve dos escenarios', () => {
    const escenarios = calcularEscenarios({ ...INPUT, cantidad: 6000 }, SNAPSHOT_CONGELADO)
    expect(escenarios.map((e) => e.cantidad)).toEqual([6000, 10000])
  })
})
