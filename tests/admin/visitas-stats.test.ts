import { describe, it, expect } from 'vitest'
import { buildVisitasBuckets } from '@/lib/admin/visitas-stats.service'

// Instante fijo: 22/06/2026 15:00 UTC = 12:00 AR (UTC-3) → fecha de pared AR 2026-06-22.
const NOW = Date.UTC(2026, 5, 22, 15, 0, 0)

function keysOrdenadasYUnicas(keys: string[]): boolean {
  const sorted = [...keys].sort()
  const unicas = new Set(keys).size === keys.length
  return unicas && keys.every((k, i) => k === sorted[i])
}

describe('buildVisitasBuckets', () => {
  it('dia → 30 buckets, terminando en la fecha AR de hoy', () => {
    const b = buildVisitasBuckets('dia', NOW)
    expect(b).toHaveLength(30)
    expect(b[b.length - 1]!.key).toBe('2026-06-22')
    // 29 días antes del 22/06/2026 → 24/05/2026
    expect(b[0]!.key).toBe('2026-05-24')
    expect(keysOrdenadasYUnicas(b.map((x) => x.key))).toBe(true)
    expect(b[b.length - 1]!.label).toBe('22/06')
  })

  it('semana → 12 buckets, cada uno empezando un lunes (hora AR)', () => {
    const b = buildVisitasBuckets('semana', NOW)
    expect(b).toHaveLength(12)
    expect(keysOrdenadasYUnicas(b.map((x) => x.key))).toBe(true)
    // El inicio de cada bucket cae un lunes en hora AR.
    for (const bucket of b) {
      const wallMonday = new Date(bucket.startMs - 3 * 60 * 60 * 1000)
      expect(wallMonday.getUTCDay()).toBe(1) // 1 = lunes
    }
    // La última semana contiene "hoy".
    const last = b[b.length - 1]!
    expect(NOW - last.startMs).toBeGreaterThanOrEqual(0)
    expect(NOW - last.startMs).toBeLessThan(7 * 24 * 60 * 60 * 1000)
  })

  it('mes → 12 buckets, terminando en el mes AR actual', () => {
    const b = buildVisitasBuckets('mes', NOW)
    expect(b).toHaveLength(12)
    expect(b[b.length - 1]!.key).toBe('2026-06')
    expect(b[0]!.key).toBe('2025-07')
    expect(keysOrdenadasYUnicas(b.map((x) => x.key))).toBe(true)
    expect(b[b.length - 1]!.label).toBe('jun 26')
  })
})
