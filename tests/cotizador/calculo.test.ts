import { describe, it, expect } from 'vitest'
import { calcularCotizacion, type CotizadorSnapshot } from '@/lib/cotizador/calculo'
import { cotizadorConfigSchema } from '@/lib/validations/cotizador'
import { ValidationError } from '@/lib/errors'

// Receta 60 g: 30 g × $10/g + 20 g × $5/g + 10 g × $20/g = $600
// + bobina $50 + caja $600/12 = $50 → costo insumos unitario $700
// margen sobre venta 50% (fórmula v2) → precio base 700 / 0,5 = $1400
const SNAPSHOT: CotizadorSnapshot = {
  formulaVersion: 2,
  margenPct: 50,
  cargoSetupPersonalizado: 50_000,
  alfajoresPorCaja: 12,
  topeDescuentoPct: 10,
  validezDias: 7,
  condicionesComerciales: null,
  condicionesPackagingPersonalizado: null,
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
    expect(r.precioUnitNeto).toBe(1400)
    expect(r.setup).toBe(0)
    expect(r.neto).toBe(140_000)
    expect(r.iva).toBe(29_400)
    expect(r.total).toBe(169_400)
  })

  describe('escalones por volumen', () => {
    it('aplica el escalón que corresponde a la cantidad', () => {
      const r500 = calcularCotizacion({ ...BASE, cantidad: 500 }, SNAPSHOT)
      expect(r500.escalonAplicado?.descuentoPct).toBe(0)
      expect(r500.precioUnitNeto).toBe(1400)

      const r1000 = calcularCotizacion({ ...BASE, cantidad: 1000 }, SNAPSHOT)
      expect(r1000.escalonAplicado?.descuentoPct).toBe(5)
      expect(r1000.precioUnitNeto).toBe(1330)

      const r4999 = calcularCotizacion({ ...BASE, cantidad: 4999 }, SNAPSHOT)
      expect(r4999.escalonAplicado?.descuentoPct).toBe(5)

      const r5000 = calcularCotizacion({ ...BASE, cantidad: 5000 }, SNAPSHOT)
      expect(r5000.escalonAplicado?.descuentoPct).toBe(10)
      expect(r5000.precioUnitNeto).toBe(1260)
    })

    it('cantidadMax null = sin tope: alcanza cualquier cantidad grande', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 1_000_000 }, SNAPSHOT)
      expect(r.escalonAplicado).toEqual({ cantidadMin: 5000, cantidadMax: null, descuentoPct: 10 })
      expect(r.precioUnitNeto).toBe(1260)
    })

    it('sin escalón aplicable no descuenta y devuelve escalonAplicado null', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 50 }, SNAPSHOT)
      expect(r.escalonAplicado).toBeNull()
      expect(r.precioUnitNeto).toBe(1400)
    })
  })

  describe('packaging', () => {
    it('cristal no suma cargo de setup', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 100, packaging: 'cristal' }, SNAPSHOT)
      expect(r.setup).toBe(0)
      expect(r.neto).toBe(140_000)
    })

    it('personalizado suma el setup y excluye la bobina del costo (la provee el cliente)', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 100, packaging: 'personalizado' }, SNAPSHOT)
      // Costo sin bobina: 700 − 50 = 650 → precio base 650 / 0,5 = 1300
      expect(r.costoInsumosUnitario).toBe(650)
      expect(r.precioUnitNeto).toBe(1300)
      expect(r.setup).toBe(50_000)
      expect(r.neto).toBe(180_000)
      expect(r.iva).toBe(37_800)
      expect(r.total).toBe(217_800)
    })
  })

  describe('descuento manual', () => {
    it('se aplica multiplicativo sobre el precio unitario', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 100, descuentoManualPct: 10 }, SNAPSHOT)
      expect(r.precioUnitNeto).toBe(1260)
      expect(r.neto).toBe(126_000)
    })

    it('se combina con el descuento por escalón', () => {
      // 1400 × 0.95 (escalón) × 0.9 (manual) = 1197
      const r = calcularCotizacion({ ...BASE, cantidad: 1000, descuentoManualPct: 10 }, SNAPSHOT)
      expect(r.precioUnitNeto).toBe(1197)
    })

    it('sobre el tope calcula igual (la aprobación la decide la capa de negocio)', () => {
      // 1400 × (1 − 0.15) = 1190 — el tope (10%) no frena el cálculo
      const r = calcularCotizacion({ ...BASE, cantidad: 100, descuentoManualPct: 15 }, SNAPSHOT)
      expect(r.precioUnitNeto).toBe(1190)
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
        formulaVersion: 2,
        margenPct: 0,
        cargoSetupPersonalizado: 0,
        alfajoresPorCaja: 12,
        topeDescuentoPct: 0,
        validezDias: 7,
        condicionesComerciales: null,
        condicionesPackagingPersonalizado: null,
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

  describe('coherencia de redondeo: el documento cierra multiplicado a mano', () => {
    // Snapshot con precios "sucios" que generan unitarios con más de 2
    // decimales antes de redondear
    const SUCIO: CotizadorSnapshot = {
      formulaVersion: 2,
      margenPct: 32.5,
      cargoSetupPersonalizado: 150_000.55,
      alfajoresPorCaja: 12,
      topeDescuentoPct: 100,
      validezDias: 7,
      condicionesComerciales: null,
      condicionesPackagingPersonalizado: null,
      precioBobinaUnit: 37.33,
      precioCajaUnit: 613.99,
      recetas: {
        55: [{ gramos: 25.5, precioPorKg: 6_123.45 }, { gramos: 18.75, precioPorKg: 4_567.89 }],
        60: [{ gramos: 27.33, precioPorKg: 6_123.45 }, { gramos: 21.5, precioPorKg: 4_567.89 }],
        80: [{ gramos: 36.25, precioPorKg: 6_123.45 }, { gramos: 28.4, precioPorKg: 9_876.54 }],
      },
      escalones: [
        { cantidadMin: 1, cantidadMax: 999, descuentoPct: 0 },
        { cantidadMin: 1000, cantidadMax: 4999, descuentoPct: 5.5 },
        { cantidadMin: 5000, cantidadMax: null, descuentoPct: 11.25 },
      ],
    }

    const COMBOS = [
      { cantidad: 1000, gramaje: 60, packaging: 'cristal', descuentoManualPct: 0 },
      { cantidad: 999, gramaje: 55, packaging: 'cristal', descuentoManualPct: 3.33 },
      { cantidad: 5000, gramaje: 80, packaging: 'personalizado', descuentoManualPct: 0 },
      { cantidad: 123_457, gramaje: 60, packaging: 'personalizado', descuentoManualPct: 7.77 },
      { cantidad: 7, gramaje: 55, packaging: 'cristal', descuentoManualPct: 0 },
      { cantidad: 999_999, gramaje: 80, packaging: 'personalizado', descuentoManualPct: 12.5 },
    ] as const

    it.each(COMBOS)('%o', (input) => {
      const r = calcularCotizacion(input, SUCIO)
      const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

      // El unitario ya viene redondeado a 2 decimales
      expect(r.precioUnitNeto).toBe(round2(r.precioUnitNeto))
      // Multiplicar a mano el unitario impreso reproduce el neto exacto
      expect(r.neto).toBe(round2(r.precioUnitNeto * input.cantidad + r.setup))
      // IVA y total se derivan de ese neto
      expect(r.iva).toBe(round2(r.neto * 0.21))
      expect(r.total).toBe(round2(r.neto + r.iva))
    })
  })

  describe('margen sobre venta (fórmula v2) — valores reales', () => {
    // Receta 60 g: 18 g × $3/g + 30 g × $3,7/g + 12 g × $9,8/g = $282,60
    // + bobina $30 + caja $350/24 = $14,5833 → costo unitario $327,1833
    const SNAPSHOT_REAL: CotizadorSnapshot = {
      formulaVersion: 2,
      margenPct: 40,
      cargoSetupPersonalizado: 0,
      alfajoresPorCaja: 24,
      topeDescuentoPct: 100,
      validezDias: 7,
      condicionesComerciales: null,
      condicionesPackagingPersonalizado: null,
      precioBobinaUnit: 30,
      precioCajaUnit: 350,
      recetas: {
        60: [
          { gramos: 18, precioPorKg: 3_000 },
          { gramos: 30, precioPorKg: 3_700 },
          { gramos: 12, precioPorKg: 9_800 },
        ],
      },
      escalones: [{ cantidadMin: 1000, cantidadMax: null, descuentoPct: 15 }],
    }
    const INPUT_REAL = { gramaje: 60, packaging: 'cristal', descuentoManualPct: 0 } as const

    it('cristal: costo $327,18 y precio unitario $545,31 (bobina incluida)', () => {
      // 282,60 + 30 + 14,5833 = 327,1833 / (1 − 0,40) = 545,3055… → $545,31
      const r = calcularCotizacion({ ...INPUT_REAL, cantidad: 100 }, SNAPSHOT_REAL)
      expect(r.costoInsumosUnitario).toBe(327.18)
      expect(r.precioUnitNeto).toBe(545.31)
    })

    it('personalizado: costo $297,18 y precio $495,31 (bobina del cliente, excluida)', () => {
      // 282,60 + 14,5833 = 297,1833 / (1 − 0,40) = 495,3055… → $495,31
      const r = calcularCotizacion(
        { ...INPUT_REAL, cantidad: 100, packaging: 'personalizado' },
        SNAPSHOT_REAL,
      )
      expect(r.costoInsumosUnitario).toBe(297.18)
      expect(r.precioUnitNeto).toBe(495.31)
    })

    it('con escalón del 15% el unitario da $463,51 y el neto cierra exacto', () => {
      // 545,3055… × 0,85 = 463,5097… → $463,51
      const r = calcularCotizacion({ ...INPUT_REAL, cantidad: 1000 }, SNAPSHOT_REAL)
      expect(r.precioUnitNeto).toBe(463.51)
      expect(r.neto).toBe(463_510)
      expect(r.neto).toBe(Math.round(r.precioUnitNeto * 1000 * 100) / 100)
    })

    it('un snapshot sin formulaVersion sigue con la fórmula vieja: $458,06', () => {
      // Las propuestas ya emitidas se congelaron con markup: 327,1833 × 1,4
      const legacy: CotizadorSnapshot = { ...SNAPSHOT_REAL }
      delete legacy.formulaVersion
      const r = calcularCotizacion({ ...INPUT_REAL, cantidad: 100 }, legacy)
      expect(r.precioUnitNeto).toBe(458.06)
    })

    it('margen 100 en fórmula v2 es rechazado por el motor (división por cero)', () => {
      const snapshot = { ...SNAPSHOT_REAL, margenPct: 100 }
      expect(() => calcularCotizacion({ ...INPUT_REAL, cantidad: 100 }, snapshot)).toThrow(ValidationError)
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

describe('cotizadorConfigSchema — margen sobre venta', () => {
  const CONFIG_VALIDA = {
    margenPct: 40,
    cargoSetupPersonalizado: 0,
    alfajoresPorCaja: 12,
    validezDias: 7,
    topeDescuentoPct: 10,
    condicionesComerciales: null,
  }

  it('acepta el rango 0 ≤ margen < 100', () => {
    expect(cotizadorConfigSchema.safeParse(CONFIG_VALIDA).success).toBe(true)
    expect(cotizadorConfigSchema.safeParse({ ...CONFIG_VALIDA, margenPct: 0 }).success).toBe(true)
    expect(cotizadorConfigSchema.safeParse({ ...CONFIG_VALIDA, margenPct: 99.99 }).success).toBe(true)
  })

  it('rechaza margen de 100 o más con mensaje claro', () => {
    for (const margenPct of [100, 100.01, 150]) {
      const result = cotizadorConfigSchema.safeParse({ ...CONFIG_VALIDA, margenPct })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('menor a 100')
      }
    }
  })
})
