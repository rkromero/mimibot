/**
 * Tablero de comando — reglas puras (lib/tablero/calculos.ts):
 * semáforo, punto de equilibrio, proyección de cierre, antigüedad de deuda,
 * días de cobro y utilitarios de mes.
 */
import { describe, it, expect } from 'vitest'
import {
  antiguedadDeuda,
  armarResultado,
  diasDeCobro,
  diasEnMes,
  mesAnterior,
  proyeccionCierre,
  puntoEquilibrio,
  semaforo,
  variacionPct,
} from '@/lib/tablero/calculos'

describe('armarResultado / semaforo', () => {
  it('calcula margen bruto y neto', () => {
    const r = armarResultado({ ventas: 1000, cantidadPedidos: 10, costoDirecto: 400, gastoOperativo: 500 })
    expect(r.margenBruto).toBe(600)
    expect(r.resultadoNeto).toBe(100)
  })

  it('ganando si el neto supera el 5 % de las ventas; equilibrio dentro del ±5 %; perdiendo por debajo', () => {
    expect(semaforo({ ventas: 1000, resultadoNeto: 100 })).toBe('ganando')
    expect(semaforo({ ventas: 1000, resultadoNeto: 30 })).toBe('equilibrio')
    expect(semaforo({ ventas: 1000, resultadoNeto: -30 })).toBe('equilibrio')
    expect(semaforo({ ventas: 1000, resultadoNeto: -200 })).toBe('perdiendo')
  })

  it('sin ventas: sin datos si tampoco hay gastos; perdiendo si hay gastos', () => {
    expect(semaforo({ ventas: 0, resultadoNeto: 0 })).toBe('sin-datos')
    expect(semaforo({ ventas: 0, resultadoNeto: -5000 })).toBe('perdiendo')
  })
})

describe('puntoEquilibrio', () => {
  it('ventas necesarias = gasto operativo / margen bruto %', () => {
    // margen bruto 60 % → para cubrir 600 de gastos hay que vender 1000
    const pe = puntoEquilibrio({ ventas: 800, costoDirecto: 320, gastoOperativo: 600 })
    expect(pe).not.toBeNull()
    expect(pe!.margenBrutoPct).toBeCloseTo(0.6)
    expect(pe!.ventasNecesarias).toBeCloseTo(1000)
    expect(pe!.avance).toBeCloseTo(0.8)
    expect(pe!.faltante).toBeCloseTo(200)
  })

  it('cuando ya se superó, faltante es 0 y avance > 1', () => {
    const pe = puntoEquilibrio({ ventas: 2000, costoDirecto: 800, gastoOperativo: 600 })
    expect(pe!.faltante).toBe(0)
    expect(pe!.avance).toBeGreaterThan(1)
  })

  it('sin ventas o con margen bruto negativo no se puede calcular', () => {
    expect(puntoEquilibrio({ ventas: 0, costoDirecto: 0, gastoOperativo: 100 })).toBeNull()
    expect(puntoEquilibrio({ ventas: 100, costoDirecto: 150, gastoOperativo: 100 })).toBeNull()
  })
})

describe('proyeccionCierre', () => {
  const r = armarResultado({ ventas: 1000, cantidadPedidos: 5, costoDirecto: 400, gastoOperativo: 300 })

  it('extrapola lo que va del mes a los días totales', () => {
    const p = proyeccionCierre('2026-09', '2026-09-10', r)
    expect(p).toEqual({ diaActual: 10, diasDelMes: 30, ventas: 3000, resultadoNeto: 900 })
  })

  it('mes cerrado → null', () => {
    expect(proyeccionCierre('2026-08', '2026-09-10', r)).toBeNull()
  })

  it('último día del mes proyecta lo mismo que hay', () => {
    const p = proyeccionCierre('2026-09', '2026-09-30', r)
    expect(p!.ventas).toBe(1000)
  })
})

describe('antiguedadDeuda', () => {
  const hoy = new Date('2026-09-27T12:00:00Z')
  const d = (dias: number) => new Date(hoy.getTime() - dias * 86_400_000)

  it('reparte por tramos de 30 días y suma el total', () => {
    const a = antiguedadDeuda([
      { fecha: d(5), saldo: 100 },
      { fecha: d(45), saldo: 200 },
      { fecha: d(75), saldo: 300 },
      { fecha: d(120), saldo: 400 },
      { fecha: d(10), saldo: 0 }, // sin saldo: no cuenta
    ], hoy)
    expect(a).toEqual({ alDia: 100, d30: 200, d60: 300, mas60: 400, total: 1000, pedidos: 4 })
  })

  it('un pedido de hoy o con fecha futura cae en "al día"', () => {
    const a = antiguedadDeuda([{ fecha: new Date(hoy.getTime() + 86_400_000), saldo: 50 }], hoy)
    expect(a.alDia).toBe(50)
  })
})

describe('diasDeCobro / variacionPct / meses', () => {
  it('días de cobro = deuda / venta diaria del período', () => {
    expect(diasDeCobro(9000, 90_000, 90)).toBe(9)
    expect(diasDeCobro(9000, 0, 90)).toBeNull()
  })

  it('variación porcentual con y sin base', () => {
    expect(variacionPct(120, 100)).toBeCloseTo(0.2)
    expect(variacionPct(80, 100)).toBeCloseTo(-0.2)
    expect(variacionPct(80, 0)).toBeNull()
  })

  it('días del mes y mes anterior, incluido el cambio de año y febrero bisiesto', () => {
    expect(diasEnMes('2026-09')).toBe(30)
    expect(diasEnMes('2028-02')).toBe(29)
    expect(mesAnterior('2026-01')).toBe('2025-12')
    expect(mesAnterior('2026-09')).toBe('2026-08')
  })
})
