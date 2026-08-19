import { describe, it, expect } from 'vitest'
import { calcularCotizacion, type CotizadorSnapshot } from '@/lib/cotizador/calculo'
import { cotizadorConfigSchema } from '@/lib/validations/cotizador'
import { ValidationError } from '@/lib/errors'

// Receta 60 g: 30 g × $10/g + 20 g × $5/g + 10 g × $20/g = $600
// + caja $600/12 = $50 → costo base $650 (la bobina $50 va aparte)
// margen sobre venta 50% (fórmula v3) → precio base 650 / 0,5 = $1300,
// y en cristal la bobina se suma pass-through al final: $1350
const SNAPSHOT: CotizadorSnapshot = {
  formulaVersion: 3,
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
    // Costo reportado completo: base 650 + bobina 50
    expect(r.costoInsumosUnitario).toBe(700)
    expect(r.precioUnitNeto).toBe(1350)
    expect(r.setup).toBe(0)
    expect(r.neto).toBe(135_000)
    expect(r.iva).toBe(28_350)
    expect(r.total).toBe(163_350)
  })

  describe('escalones por volumen', () => {
    it('aplica el escalón sobre la base marginada; la bobina se suma después', () => {
      const r500 = calcularCotizacion({ ...BASE, cantidad: 500 }, SNAPSHOT)
      expect(r500.escalonAplicado?.descuentoPct).toBe(0)
      expect(r500.precioUnitNeto).toBe(1350)

      // 1300 × 0,95 + 50 = 1285 (el descuento no toca la bobina)
      const r1000 = calcularCotizacion({ ...BASE, cantidad: 1000 }, SNAPSHOT)
      expect(r1000.escalonAplicado?.descuentoPct).toBe(5)
      expect(r1000.precioUnitNeto).toBe(1285)

      const r4999 = calcularCotizacion({ ...BASE, cantidad: 4999 }, SNAPSHOT)
      expect(r4999.escalonAplicado?.descuentoPct).toBe(5)

      // 1300 × 0,90 + 50 = 1220
      const r5000 = calcularCotizacion({ ...BASE, cantidad: 5000 }, SNAPSHOT)
      expect(r5000.escalonAplicado?.descuentoPct).toBe(10)
      expect(r5000.precioUnitNeto).toBe(1220)
    })

    it('cantidadMax null = sin tope: alcanza cualquier cantidad grande', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 1_000_000 }, SNAPSHOT)
      expect(r.escalonAplicado).toEqual({ cantidadMin: 5000, cantidadMax: null, descuentoPct: 10 })
      expect(r.precioUnitNeto).toBe(1220)
    })

    it('sin escalón aplicable no descuenta y devuelve escalonAplicado null', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 50 }, SNAPSHOT)
      expect(r.escalonAplicado).toBeNull()
      expect(r.precioUnitNeto).toBe(1350)
    })
  })

  describe('packaging', () => {
    it('cristal suma la bobina pass-through y no suma cargo de setup', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 100, packaging: 'cristal' }, SNAPSHOT)
      expect(r.setup).toBe(0)
      expect(r.neto).toBe(135_000)
    })

    it('personalizado suma el setup y no lleva bobina (la provee el cliente)', () => {
      const r = calcularCotizacion({ ...BASE, cantidad: 100, packaging: 'personalizado' }, SNAPSHOT)
      expect(r.costoInsumosUnitario).toBe(650)
      expect(r.precioUnitNeto).toBe(1300)
      expect(r.setup).toBe(50_000)
      expect(r.neto).toBe(180_000)
      expect(r.iva).toBe(37_800)
      expect(r.total).toBe(217_800)
    })
  })

  describe('descuento manual', () => {
    it('se aplica sobre la base marginada, no sobre la bobina', () => {
      // 1300 × 0,90 + 50 = 1220
      const r = calcularCotizacion({ ...BASE, cantidad: 100, descuentoManualPct: 10 }, SNAPSHOT)
      expect(r.precioUnitNeto).toBe(1220)
      expect(r.neto).toBe(122_000)
    })

    it('se combina con el descuento por escalón', () => {
      // 1300 × 0.95 (escalón) × 0.9 (manual) + 50 = 1161.5
      const r = calcularCotizacion({ ...BASE, cantidad: 1000, descuentoManualPct: 10 }, SNAPSHOT)
      expect(r.precioUnitNeto).toBe(1161.5)
    })

    it('sobre el tope calcula igual (la aprobación la decide la capa de negocio)', () => {
      // 1300 × (1 − 0.15) + 50 = 1155 — el tope (10%) no frena el cálculo
      const r = calcularCotizacion({ ...BASE, cantidad: 100, descuentoManualPct: 15 }, SNAPSHOT)
      expect(r.precioUnitNeto).toBe(1155)
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
        formulaVersion: 3,
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
      formulaVersion: 3,
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

  describe('bobina pass-through (fórmula v3) — valores reales', () => {
    // Receta 60 g: 18 g × $3/g + 30 g × $3,7/g + 12 g × $9,8/g = $282,60
    // + caja $350/24 = $14,5833 → costo BASE $297,1833 (sin la bobina de $30)
    const SNAPSHOT_REAL: CotizadorSnapshot = {
      formulaVersion: 3,
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
      escalones: [
        { cantidadMin: 1000, cantidadMax: 4999, descuentoPct: 3 },
        { cantidadMin: 5000, cantidadMax: null, descuentoPct: 15 },
      ],
    }
    const INPUT_REAL = { gramaje: 60, packaging: 'cristal', descuentoManualPct: 0 } as const

    it('costo base $297,1833 y precio base $495,3056 (sin bobina)', () => {
      const costoBase = 18 * 3 + 30 * 3.7 + 12 * 9.8 + 350 / 24
      expect(costoBase).toBeCloseTo(297.1833, 4)
      expect(costoBase / (1 - 0.4)).toBeCloseTo(495.3056, 4)
      // El motor lo refleja en personalizado (sin bobina): costo 297,18
      const r = calcularCotizacion(
        { ...INPUT_REAL, cantidad: 100, packaging: 'personalizado' },
        SNAPSHOT_REAL,
      )
      expect(r.costoInsumosUnitario).toBe(297.18)
    })

    it('sin descuento: cristal $525,31 y personalizado $495,31 — diferencia exacta $30', () => {
      // 495,3056 + 30 (bobina pass-through, sin margen) = 525,3056 → $525,31
      const cristal = calcularCotizacion({ ...INPUT_REAL, cantidad: 100 }, SNAPSHOT_REAL)
      const personalizado = calcularCotizacion(
        { ...INPUT_REAL, cantidad: 100, packaging: 'personalizado' },
        SNAPSHOT_REAL,
      )
      expect(cristal.precioUnitNeto).toBe(525.31)
      expect(personalizado.precioUnitNeto).toBe(495.31)
      expect(cristal.precioUnitNeto - personalizado.precioUnitNeto).toBeCloseTo(30, 2)
    })

    it('escalón del 3%: cristal $510,45 y personalizado $480,45 — el descuento no toca la bobina', () => {
      // 495,3056 × 0,97 = 480,4464; cristal suma la bobina ENTERA después: +30
      const cristal = calcularCotizacion({ ...INPUT_REAL, cantidad: 1000 }, SNAPSHOT_REAL)
      const personalizado = calcularCotizacion(
        { ...INPUT_REAL, cantidad: 1000, packaging: 'personalizado' },
        SNAPSHOT_REAL,
      )
      expect(cristal.escalonAplicado?.descuentoPct).toBe(3)
      expect(cristal.precioUnitNeto).toBe(510.45)
      expect(personalizado.precioUnitNeto).toBe(480.45)
      expect(cristal.precioUnitNeto - personalizado.precioUnitNeto).toBeCloseTo(30, 2)
      // neto = unitario redondeado × cantidad, exacto
      expect(cristal.neto).toBe(510_450)
    })

    // cantidad 100 → sin escalón; 1000 → 3%; 5000 → 15%
    const COMBOS_DIFERENCIA = [
      { cantidad: 100, descuentoManualPct: 0 },
      { cantidad: 100, descuentoManualPct: 5 },
      { cantidad: 100, descuentoManualPct: 12.5 },
      { cantidad: 1000, descuentoManualPct: 0 },
      { cantidad: 1000, descuentoManualPct: 5 },
      { cantidad: 1000, descuentoManualPct: 12.5 },
      { cantidad: 5000, descuentoManualPct: 0 },
      { cantidad: 5000, descuentoManualPct: 5 },
      { cantidad: 5000, descuentoManualPct: 12.5 },
    ] as const

    it.each(COMBOS_DIFERENCIA)(
      'cristal − personalizado = bobina con cualquier descuento: %o',
      ({ cantidad, descuentoManualPct }) => {
        const base = { gramaje: 60, cantidad, descuentoManualPct } as const
        const cristal = calcularCotizacion({ ...base, packaging: 'cristal' }, SNAPSHOT_REAL)
        const personalizado = calcularCotizacion({ ...base, packaging: 'personalizado' }, SNAPSHOT_REAL)
        // La bobina se traslada tal cual: la diferencia es siempre $30
        // (tolerancia de un centavo por el redondeo de cada precio)
        expect(Math.abs(cristal.precioUnitNeto - personalizado.precioUnitNeto - 30))
          .toBeLessThanOrEqual(0.01)
      },
    )

    it('internos: costo $327,18 / margen 37,72% en cristal; $297,18 / 40,00% en personalizado', () => {
      // Mismo cálculo de margen real que hace el modal del vendedor
      const margenReal = (r: { precioUnitNeto: number; costoInsumosUnitario: number }) =>
        ((r.precioUnitNeto - r.costoInsumosUnitario) / r.precioUnitNeto) * 100

      const cristal = calcularCotizacion({ ...INPUT_REAL, cantidad: 100 }, SNAPSHOT_REAL)
      expect(cristal.costoInsumosUnitario).toBe(327.18)
      expect(margenReal(cristal)).toBeCloseTo(37.72, 2)

      const personalizado = calcularCotizacion(
        { ...INPUT_REAL, cantidad: 100, packaging: 'personalizado' },
        SNAPSHOT_REAL,
      )
      expect(personalizado.costoInsumosUnitario).toBe(297.18)
      expect(margenReal(personalizado)).toBeCloseTo(40.0, 2)
    })

    it('un snapshot v2 sigue devolviendo $545,31 en cristal, sin cambios', () => {
      // v2: la bobina dentro del costo → 327,1833 / 0,6 = 545,3055…
      const v2 = { ...SNAPSHOT_REAL, formulaVersion: 2 }
      const r = calcularCotizacion({ ...INPUT_REAL, cantidad: 100 }, v2)
      expect(r.costoInsumosUnitario).toBe(327.18)
      expect(r.precioUnitNeto).toBe(545.31)
    })

    it('un snapshot sin formulaVersion sigue con la fórmula v1 (markup): $458,06', () => {
      // Las propuestas más viejas se congelaron con markup: 327,1833 × 1,4
      const legacy: CotizadorSnapshot = { ...SNAPSHOT_REAL }
      delete legacy.formulaVersion
      const r = calcularCotizacion({ ...INPUT_REAL, cantidad: 100 }, legacy)
      expect(r.precioUnitNeto).toBe(458.06)
    })

    it('margen 100 es rechazado por el motor (división por cero)', () => {
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
