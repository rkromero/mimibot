import { describe, it, expect } from 'vitest'
import { calcularCostoUnitario, type InsumoPrecio, type RecetaCosto } from '@/lib/costos/calculo'
import { ValidationError } from '@/lib/errors'

const PRECIOS = new Map<string, InsumoPrecio>([
  ['i-gall', { id: 'i-gall', nombre: 'Galletita', unidad: 'kg', precio: 6000 }],
  ['i-ddl', { id: 'i-ddl', nombre: 'Dulce de leche', unidad: 'kg', precio: 4800 }],
  ['i-etiq', { id: 'i-etiq', nombre: 'Etiqueta', unidad: 'unidad', precio: 12.5 }],
  ['i-bob', { id: 'i-bob', nombre: 'Bobina', unidad: 'unidad', precio: 35 }],
  ['i-caja', { id: 'i-caja', nombre: 'Caja', unidad: 'unidad', precio: 550 }],
])

const RECETA_BASE: RecetaCosto = {
  items: [
    { insumoId: 'i-gall', cantidad: 38.5 },
    { insumoId: 'i-ddl', cantidad: 15.25 },
    { insumoId: 'i-etiq', cantidad: 2 },
  ],
  bobinaInsumoId: 'i-bob',
  cajaInsumoId: 'i-caja',
  alfajoresPorCaja: 12,
}

describe('calcularCostoUnitario', () => {
  it('mezcla insumos kg (cantidad en gramos, /1000) y unidad (cantidad directa)', () => {
    const d = calcularCostoUnitario(RECETA_BASE, PRECIOS)

    // kg: 38.5 g * 6000/kg / 1000 = 231; 15.25 g * 4800/kg / 1000 = 73.2
    // unidad: 2 * 12.5 = 25
    expect(d.detalle).toEqual([
      { insumoId: 'i-gall', nombre: 'Galletita', cantidad: 38.5, costo: 231 },
      { insumoId: 'i-ddl', nombre: 'Dulce de leche', cantidad: 15.25, costo: 73.2 },
      { insumoId: 'i-etiq', nombre: 'Etiqueta', cantidad: 2, costo: 25 },
    ])
    expect(d.costoMateriaPrima).toBe(329.2)
    // packaging: bobina 35 entera + caja 550/12 = 45.8333...
    expect(d.costoPackaging).toBe(80.83)
    // unitario redondeado desde la suma con precisión completa (410.0333...)
    expect(d.costoUnitario).toBe(410.03)
    expect(d.omitidos).toEqual([])
  })

  it('packaging null → costoPackaging 0 y el unitario es solo materia prima', () => {
    const d = calcularCostoUnitario(
      { ...RECETA_BASE, bobinaInsumoId: null, cajaInsumoId: null },
      PRECIOS,
    )
    expect(d.costoPackaging).toBe(0)
    expect(d.costoUnitario).toBe(d.costoMateriaPrima)
  })

  it('insumos fuera del Map se ignoran y se reportan en omitidos', () => {
    const d = calcularCostoUnitario(
      {
        items: [
          { insumoId: 'i-gall', cantidad: 30 },
          { insumoId: 'i-borrado', cantidad: 10 },
        ],
        bobinaInsumoId: 'i-bob-inactiva',
        cajaInsumoId: 'i-caja',
        alfajoresPorCaja: 10,
      },
      PRECIOS,
    )
    expect(d.omitidos).toEqual(['i-borrado', 'i-bob-inactiva'])
    expect(d.costoMateriaPrima).toBe(180) // solo la galletita: 30 * 6000 / 1000
    expect(d.costoPackaging).toBe(55) // solo la caja: 550 / 10
    expect(d.detalle).toHaveLength(1)
  })

  it('redondea al exponer, no antes: la suma usa precisión completa', () => {
    const precios = new Map<string, InsumoPrecio>([
      ['a', { id: 'a', nombre: 'A', unidad: 'kg', precio: 1235 }],
      ['b', { id: 'b', nombre: 'B', unidad: 'kg', precio: 1235 }],
    ])
    const d = calcularCostoUnitario(
      {
        items: [
          { insumoId: 'a', cantidad: 1 },
          { insumoId: 'b', cantidad: 1 },
        ],
        bobinaInsumoId: null,
        cajaInsumoId: null,
        alfajoresPorCaja: 12,
      },
      precios,
    )
    // Cada item vale 1.235 → detalle redondeado 1.24, pero la suma completa
    // es 2.47 (no 1.24 + 1.24 = 2.48)
    expect(d.detalle.map((x) => x.costo)).toEqual([1.24, 1.24])
    expect(d.costoMateriaPrima).toBe(2.47)
  })

  it('alfajoresPorCaja <= 0 lanza ValidationError', () => {
    expect(() => calcularCostoUnitario({ ...RECETA_BASE, alfajoresPorCaja: 0 }, PRECIOS))
      .toThrow(ValidationError)
    expect(() => calcularCostoUnitario({ ...RECETA_BASE, alfajoresPorCaja: -3 }, PRECIOS))
      .toThrow(ValidationError)
  })
})
