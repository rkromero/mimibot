import { describe, it, expect } from 'vitest'
import { resolverMargen, precioDesdeCosto } from '@/lib/costos/margen'
import { ValidationError } from '@/lib/errors'

describe('resolverMargen — cascada receta → lista → global', () => {
  it('con margen de receta gana la receta', () => {
    expect(resolverMargen(30, 20, 10)).toEqual({ valor: 30, origen: 'receta' })
  })

  it('sin margen de receta gana la lista', () => {
    expect(resolverMargen(null, 20, 10)).toEqual({ valor: 20, origen: 'lista' })
  })

  it('sin receta ni lista cae al global', () => {
    expect(resolverMargen(null, null, 10)).toEqual({ valor: 10, origen: 'global' })
    expect(resolverMargen(undefined, undefined, 10)).toEqual({ valor: 10, origen: 'global' })
  })

  it('margen 0 es un valor válido, no un faltante', () => {
    expect(resolverMargen(0, 20, 10)).toEqual({ valor: 0, origen: 'receta' })
    expect(resolverMargen(null, 0, 10)).toEqual({ valor: 0, origen: 'lista' })
  })
})

describe('precioDesdeCosto — margen sobre venta', () => {
  it('costo 100 con margen 40% e IVA 21% → neto 166.67, final 201.67', () => {
    expect(precioDesdeCosto(100, 40, 21)).toEqual({ neto: 166.67, iva: 35, final: 201.67 })
  })

  it('IVA 0 → final igual al neto', () => {
    expect(precioDesdeCosto(100, 50, 0)).toEqual({ neto: 200, iva: 0, final: 200 })
  })

  it('margen 0 → neto igual al costo', () => {
    expect(precioDesdeCosto(123.45, 0, 21)).toEqual({ neto: 123.45, iva: 25.92, final: 149.37 })
  })

  it('margen >= 100 lanza ValidationError', () => {
    expect(() => precioDesdeCosto(100, 100, 21)).toThrow(ValidationError)
    expect(() => precioDesdeCosto(100, 150, 21)).toThrow(ValidationError)
  })
})
