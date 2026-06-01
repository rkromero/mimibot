import { describe, it, expect } from 'vitest'
import { buildRankMap, aggregateChartData, MESES_NOMBRES } from '@/lib/admin/dashboard.service'
import type { DayDataPoint } from '@/lib/admin/dashboard.service'

// Use local-time date constructors (not ISO strings) to avoid UTC → local day shift.
// new Date(year, month0, day) always produces the requested local day.

// ─── buildRankMap ─────────────────────────────────────────────────────────────

describe('buildRankMap', () => {
  it('ranks a single client orders chronologically (1-based)', () => {
    const orders = [
      { id: 'o1', clienteId: 'c1', fecha: new Date(2026, 5, 10) }, // Jun 10
      { id: 'o2', clienteId: 'c1', fecha: new Date(2026, 5, 5) },  // Jun 5 (earliest)
      { id: 'o3', clienteId: 'c1', fecha: new Date(2026, 5, 15) }, // Jun 15
    ]
    const map = buildRankMap(orders)
    expect(map.get('o2')).toBe(1)
    expect(map.get('o1')).toBe(2)
    expect(map.get('o3')).toBe(3)
  })

  it('identifies rank-3 order (new client threshold)', () => {
    const orders = Array.from({ length: 5 }, (_, i) => ({
      id: `o${i + 1}`,
      clienteId: 'c1',
      fecha: new Date(2026, 5, i + 1),
    }))
    const map = buildRankMap(orders)
    expect(map.get('o3')).toBe(3)
    expect(map.get('o5')).toBe(5)
  })

  it('ranks multiple clients independently', () => {
    const orders = [
      { id: 'a1', clienteId: 'c1', fecha: new Date(2026, 5, 1) },
      { id: 'a2', clienteId: 'c1', fecha: new Date(2026, 5, 10) },
      { id: 'b1', clienteId: 'c2', fecha: new Date(2026, 5, 3) },
      { id: 'b2', clienteId: 'c2', fecha: new Date(2026, 5, 8) },
      { id: 'b3', clienteId: 'c2', fecha: new Date(2026, 5, 20) },
    ]
    const map = buildRankMap(orders)
    expect(map.get('a1')).toBe(1)
    expect(map.get('a2')).toBe(2)
    expect(map.get('b1')).toBe(1)
    expect(map.get('b2')).toBe(2)
    expect(map.get('b3')).toBe(3)
  })

  it('returns empty map for empty input', () => {
    expect(buildRankMap([])).toEqual(new Map())
  })

  it('treats null fecha as epoch (sorted first)', () => {
    const orders = [
      { id: 'o1', clienteId: 'c1', fecha: null },
      { id: 'o2', clienteId: 'c1', fecha: new Date(2026, 5, 1) },
    ]
    const map = buildRankMap(orders)
    expect(map.get('o1')).toBe(1)
    expect(map.get('o2')).toBe(2)
  })

  it('does not cross-contaminate clients with same-day orders', () => {
    const sameDay = new Date(2026, 5, 15)
    const orders = [
      { id: 'x1', clienteId: 'cx', fecha: sameDay },
      { id: 'y1', clienteId: 'cy', fecha: sameDay },
    ]
    const map = buildRankMap(orders)
    expect(map.get('x1')).toBe(1)
    expect(map.get('y1')).toBe(1)
  })
})

// ─── aggregateChartData ───────────────────────────────────────────────────────

function makeChart(days: number): DayDataPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    primerPedido: 0,
    clienteNuevo: 0,
  }))
}

describe('aggregateChartData', () => {
  it('increments primerPedido for rank-1 orders', () => {
    const chart = makeChart(30)
    const rankMap = new Map([['o1', 1]])
    aggregateChartData(chart, [{ id: 'o1', fecha: new Date(2026, 5, 10) }], rankMap)
    expect(chart[9].primerPedido).toBe(1) // day 10 → index 9
    expect(chart[9].clienteNuevo).toBe(0)
  })

  it('increments clienteNuevo for rank-3 orders', () => {
    const chart = makeChart(30)
    const rankMap = new Map([['o3', 3]])
    aggregateChartData(chart, [{ id: 'o3', fecha: new Date(2026, 5, 20) }], rankMap)
    expect(chart[19].clienteNuevo).toBe(1) // day 20 → index 19
    expect(chart[19].primerPedido).toBe(0)
  })

  it('ignores orders with rank other than 1 or 3', () => {
    const chart = makeChart(30)
    const rankMap = new Map([['o2', 2], ['o4', 4]])
    aggregateChartData(
      chart,
      [
        { id: 'o2', fecha: new Date(2026, 5, 5) },
        { id: 'o4', fecha: new Date(2026, 5, 5) },
      ],
      rankMap,
    )
    expect(chart[4].primerPedido).toBe(0)
    expect(chart[4].clienteNuevo).toBe(0)
  })

  it('accumulates multiple events on the same day', () => {
    const chart = makeChart(30)
    const rankMap = new Map([['o1', 1], ['o2', 1], ['o3', 3]])
    const day5 = new Date(2026, 5, 5) // June 5 in local time
    aggregateChartData(
      chart,
      [
        { id: 'o1', fecha: day5 },
        { id: 'o2', fecha: day5 },
        { id: 'o3', fecha: day5 },
      ],
      rankMap,
    )
    expect(chart[4].primerPedido).toBe(2) // day 5 → index 4
    expect(chart[4].clienteNuevo).toBe(1)
  })

  it('skips orders with null fecha', () => {
    const chart = makeChart(30)
    const rankMap = new Map([['o1', 1]])
    aggregateChartData(chart, [{ id: 'o1', fecha: null }], rankMap)
    const total = chart.reduce((s, d) => s + d.primerPedido + d.clienteNuevo, 0)
    expect(total).toBe(0)
  })

  it('skips orders whose day exceeds chart length (bounds check)', () => {
    const chart = makeChart(5) // only 5 days
    const rankMap = new Map([['o1', 1]])
    // day 10 is out of range for a 5-day chart
    aggregateChartData(chart, [{ id: 'o1', fecha: new Date(2026, 5, 10) }], rankMap)
    expect(chart.every((d) => d.primerPedido === 0 && d.clienteNuevo === 0)).toBe(true)
  })
})

// ─── MESES_NOMBRES ────────────────────────────────────────────────────────────

describe('MESES_NOMBRES', () => {
  it('contains exactly 12 entries', () => {
    expect(MESES_NOMBRES).toHaveLength(12)
  })

  it('maps month indices correctly', () => {
    expect(MESES_NOMBRES[0]).toBe('Enero')
    expect(MESES_NOMBRES[5]).toBe('Junio')
    expect(MESES_NOMBRES[11]).toBe('Diciembre')
  })
})
