import { describe, it, expect } from 'vitest'
import { buildRankMap, aggregateBuckets, MESES_NOMBRES } from '@/lib/admin/dashboard.service'
import type { BucketDef } from '@/lib/admin/date-buckets'

// new Date(year, month0, day) en runner UTC produce medianoche UTC del día.

// ─── buildRankMap ─────────────────────────────────────────────────────────────

describe('buildRankMap', () => {
  it('ranks a single client orders chronologically (1-based)', () => {
    const orders = [
      { id: 'o1', clienteId: 'c1', fecha: new Date(2026, 5, 10) },
      { id: 'o2', clienteId: 'c1', fecha: new Date(2026, 5, 5) },
      { id: 'o3', clienteId: 'c1', fecha: new Date(2026, 5, 15) },
    ]
    const map = buildRankMap(orders)
    expect(map.get('o2')).toBe(1)
    expect(map.get('o1')).toBe(2)
    expect(map.get('o3')).toBe(3)
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
})

// ─── aggregateBuckets ──────────────────────────────────────────────────────────

const buckets: BucketDef[] = [
  { key: '2026-06-10', label: '10/06' },
  { key: '2026-06-11', label: '11/06' },
]

function biz(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d))
}

describe('aggregateBuckets', () => {
  it('cuenta primer pedido (rank 1) y cliente nuevo (rank 3) en su bucket por fecha', () => {
    const rankMap = new Map([['p1', 1], ['p2', 3], ['p3', 2]])
    const pedidos = [
      { id: 'p1', fecha: biz(2026, 6, 10) },
      { id: 'p2', fecha: biz(2026, 6, 11) },
      { id: 'p3', fecha: biz(2026, 6, 10) }, // rank 2 → ignorado
    ]
    const out = aggregateBuckets(buckets, pedidos, rankMap, 'dia')
    expect(out[0]).toMatchObject({ key: '2026-06-10', primerPedido: 1, clienteNuevo: 0 })
    expect(out[1]).toMatchObject({ key: '2026-06-11', primerPedido: 0, clienteNuevo: 1 })
  })

  it('ignora pedidos fuera de la ventana (clave no presente) y fecha nula', () => {
    const rankMap = new Map([['p1', 1], ['p2', 1]])
    const pedidos = [
      { id: 'p1', fecha: biz(2026, 1, 1) }, // fuera de los buckets
      { id: 'p2', fecha: null },
    ]
    const out = aggregateBuckets(buckets, pedidos, rankMap, 'dia')
    expect(out.every((b) => b.primerPedido === 0 && b.clienteNuevo === 0)).toBe(true)
  })

  it('acumula varios eventos en el mismo bucket', () => {
    const rankMap = new Map([['p1', 1], ['p2', 1], ['p3', 3]])
    const pedidos = [
      { id: 'p1', fecha: biz(2026, 6, 10) },
      { id: 'p2', fecha: biz(2026, 6, 10) },
      { id: 'p3', fecha: biz(2026, 6, 10) },
    ]
    const out = aggregateBuckets(buckets, pedidos, rankMap, 'dia')
    expect(out[0]!.primerPedido).toBe(2)
    expect(out[0]!.clienteNuevo).toBe(1)
  })
})

// ─── MESES_NOMBRES ────────────────────────────────────────────────────────────

describe('MESES_NOMBRES', () => {
  it('contains exactly 12 entries', () => {
    expect(MESES_NOMBRES).toHaveLength(12)
  })
})
