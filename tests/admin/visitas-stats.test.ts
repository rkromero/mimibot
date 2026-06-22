import { describe, it, expect } from 'vitest'
import { buildBuckets, bucketKeyFromInstant, windowStartMs } from '@/lib/admin/date-buckets'

// Instante fijo: 22/06/2026 15:00 UTC = 12:00 AR (UTC-3) → fecha de pared AR 2026-06-22.
const NOW = Date.UTC(2026, 5, 22, 15, 0, 0)

function ordenadasYUnicas(keys: string[]): boolean {
  const sorted = [...keys].sort()
  const unicas = new Set(keys).size === keys.length
  return unicas && keys.every((k, i) => k === sorted[i])
}

describe('buildBuckets', () => {
  it('dia → 30 buckets, terminando en la fecha AR de hoy', () => {
    const b = buildBuckets('dia', NOW)
    expect(b).toHaveLength(30)
    expect(b[b.length - 1]!.key).toBe('2026-06-22')
    expect(b[0]!.key).toBe('2026-05-24')
    expect(ordenadasYUnicas(b.map((x) => x.key))).toBe(true)
    expect(b[b.length - 1]!.label).toBe('22/06')
  })

  it('semana → 12 buckets, cada uno empezando un lunes', () => {
    const b = buildBuckets('semana', NOW)
    expect(b).toHaveLength(12)
    expect(ordenadasYUnicas(b.map((x) => x.key))).toBe(true)
    for (const bucket of b) {
      const [y, m, d] = bucket.key.split('-').map(Number)
      // mediodía UTC para evitar saltos de día al leer getUTCDay
      expect(new Date(Date.UTC(y!, m! - 1, d!, 12)).getUTCDay()).toBe(1) // 1 = lunes
    }
  })

  it('mes → 12 buckets, terminando en el mes AR actual', () => {
    const b = buildBuckets('mes', NOW)
    expect(b).toHaveLength(12)
    expect(b[b.length - 1]!.key).toBe('2026-06')
    expect(b[0]!.key).toBe('2025-07')
    expect(ordenadasYUnicas(b.map((x) => x.key))).toBe(true)
    expect(b[b.length - 1]!.label).toBe('jun 26')
  })
})

describe('bucketKeyFromInstant', () => {
  it('asigna un instante al día AR correcto', () => {
    // 22/06/2026 12:00 AR → 2026-06-22
    expect(bucketKeyFromInstant('dia', NOW)).toBe('2026-06-22')
    // 22/06/2026 01:00 UTC = 21/06 22:00 AR → 2026-06-21
    expect(bucketKeyFromInstant('dia', Date.UTC(2026, 5, 22, 1, 0, 0))).toBe('2026-06-21')
  })

  it('mes agrupa por YYYY-MM', () => {
    expect(bucketKeyFromInstant('mes', NOW)).toBe('2026-06')
  })
})

describe('windowStartMs', () => {
  it('es anterior al primer bucket', () => {
    const start = windowStartMs('dia', NOW)
    expect(start).toBeLessThan(Date.UTC(2026, 4, 24)) // antes del 24/05
  })
})
