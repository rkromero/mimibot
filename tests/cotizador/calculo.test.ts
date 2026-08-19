import { describe, it, expect } from 'vitest'
import { calcularCotizacion, type CotizadorSnapshot } from '@/lib/cotizador/calculo'
import { ValidationError } from '@/lib/errors'

// Receta 60 g: 30 g × $10/g + 20 g × $5/g + 10 g × $20/g = $600
// + bobina $50 + caja $600/12 = $50 → costo insumos unitario $700
// margen 50% → precio unit neto base $1050
const SNAPSHOT: CotizadorSnapshot = {
  margenPct: 50,
  cargoSetupPersonalizado: 50_000,
  alfajoresPorCaja: 12,
  topeDescuentoPct: 10,
  validezDias: 7,
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
    { cantidadMin: 5000, cantidadMax: null, descuentoPct: 10 },
  ],
}

const BASE = { gramaje: 60, packaging: 'cristal', descuentoManualPct: 0 } as const

describe('calcularCotizacion', () => {
  it('calcula el desglose completo del caso base', () => {
    const r = calcularCotizacion({ ...BASE, cantidad: 100 }, SNAPSHOT)
    expect(r.costoInsumosUnitario).toBe(700)
    expect(r.precioUnitNeto).toBe(1050)
    expect(r.setup).toBe(0)
    expect(r.neto).toBe(105_000)
    expect(r.iva).toBe(22_050)
    expect(r.total).toBe(127_050)
  })

  describe('escalones por volumen', () => {
    it('aplica el escalón que corresponde a la cantidad', () => {
      const r500 = calcularCotizacion({ ...BASE, cantidad: 500 }, SNAPSHOT)
      expect(r500.escalonAplicado?.descuentoPct).toBe(0)
      expect(r500.precioUnitNeto).toBe(1050)

      const r1000 = calcularCotizacion({ ...BASE, cantidad: 1000 }, SNAPSHOT)
      expect(r1000.escalonAplicado?.descuentoPct).toBe(5)
      expect(r1000.precioUnitNeto).toBe(997.5)

      const r4999 = calcularCotizacion({ ...BASE, cantidad: 4999 }, SNAPSHOT)
      expect(r4999.escalonAplicado?.descuentoPct).toBe(5)

      const r5000 = calcularCotizacion({ ...BASE, cantidad: 5000 }, SNAPSHOT)
      expect(r5000.escalonAplicado?.descuentoPct).toBe(10)
      expect(r5000.precioUnitNeto).toBe(945)
    })

    it('cantidadMax null = sin tope: alcanza cualquier cantidad grande', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 1_000_000 }, SNAPSHOT)
      expect(r.escalonAplicado).toEqual({ cantidadMin: 5000, cantidadMax: null, descuentoPct: 10 })
      expect(r.precioUnitNeto).toBe(945)
    })

    it('sin escalón aplicable no descuenta y devuelve escalonAplicado null', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 50 }, SNAPSHOT)
      expect(r.escalonAplicado).toBeNull()
      expect(r.precioUnitNeto).toBe(1050)
    })
  })

  describe('packaging', () => {
    it('cristal no suma cargo de setup', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 100, packaging: 'cristal' }, SNAPSHOT)
      expect(r.setup).toBe(0)
      expect(r.neto).toBe(105_000)
    })

    it('personalizado suma el cargo de setup al neto (antes de IVA)', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 100, packaging: 'personalizado' }, SNAPSHOT)
      expect(r.setup).toBe(50_000)
      expect(r.neto).toBe(155_000)
      expect(r.iva).toBe(32_550)
      expect(r.total).toBe(187_550)
    })
  })

  describe('descuento manual', () => {
    it('se aplica multiplicativo sobre el precio unitario', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 100, descuentoManualPct: 10 }, SNAPSHOT)
      expect(r.precioUnitNeto).toBe(945)
      expect(r.neto).toBe(94_500)
    })

    it('se combina con el descuento por escalón', () => {
      // 1050 × 0.95 (escalón) × 0.9 (manual) = 897.75
      const r = calcularCotizacion({ ...BASE, cantidad: 1000, descuentoManualPct: 10 }, SNAPSHOT)
      expect(r.precioUnitNeto).toBe(897.75)
    })

    it('sobre el tope calcula igual (la aprobación la decide la capa de negocio)', () => {
      // 1050 × (1 − 0.15) = 892.5 — el tope (10%) no frena el cálculo
      const r = calcularCotizacion({ ...BASE, cantidad: 100, descuentoManualPct: 15 }, SNAPSHOT)
      expect(r.precioUnitNeto).toBe(892.5)
    })

    it('rechaza descuentos fuera del rango 0-100', () => {
      expect(() =>
        calcularCotizacion({ ...BASE, cantidad: 100, descuentoManualPct: -1 }, SNAPSHOT),
      ).toThrow(ValidationError)
      expect(() =>
        calcularCotizacion({ ...BASE, cantidad: 100, descuentoManualPct: 100.01 }, SNAPSHOT),
      ).toThrow(ValidationError)
    })
  })

  describe('IVA', () => {
    it('el IVA es 21% del neto y total = neto + IVA', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 1000 }, SNAPSHOT)
      expect(r.iva).toBe(Math.round(r.neto * 0.21 * 100) / 100)
      expect(r.total).toBe(r.neto + r.iva)
    })
  })

  describe('redondeo', () => {
    it('redondea a 2 decimales solo al final, sin arrastrar error de float', () => {
      // 18.52 g × $5.40/g = 100.008 + bobina 0.10 + caja 1/12 = 100.19133...
      const snapshot: CotizadorSnapshot = {
        margenPct: 0,
        cargoSetupPersonalizado: 0,
        alfajoresPorCaja: 12,
        topeDescuentoPct: 0,
        validezDias: 7,
        precioBobinaUnit: 0.1,
        precioCajaUnit: 1,
        recetas: { 55: [{ gramos: 18.52, precioPorKg: 5400 }] },
        escalones: [],
      }
      const r = calcularCotizacion(
        { cantidad: 1, gramaje: 55, packaging: 'cristal', descuentoManualPct: 0 },
        snapshot,
      )
      expect(r.costoInsumosUnitario).toBe(100.19)
      expect(r.neto).toBe(100.19)
      expect(r.iva).toBe(21.04)
      expect(r.total).toBe(121.23)
    })
  })

  describe('entradas inválidas', () => {
    it('rechaza cantidades no positivas o no enteras', () => {
      expect(() => calcularCotizacion({ ...BASE, cantidad: 0 }, SNAPSHOT)).toThrow(ValidationError)
      expect(() => calcularCotizacion({ ...BASE, cantidad: 10.5 }, SNAPSHOT)).toThrow(ValidationError)
    })

    it('rechaza gramajes sin receta activa', () => {
      expect(() => calcularCotizacion({ ...BASE, cantidad: 100, gramaje: 90 }, SNAPSHOT)).toThrow(
        'No hay receta activa para el gramaje de 90 g',
      )
    })
  })
})
