/**
 * Tests for Argentina date helpers (lib/dates).
 *
 * Two distinct kinds of stored value:
 *  - "business date" fields: date-only / midnight UTC  → formatFechaAR
 *  - "instant" fields (e.g. pedidos.fecha = new Date())  → formatFechaInstanteAR
 *
 * The bug being guarded against: an order created after ~21:00 AR has a UTC
 * date of the NEXT calendar day. `formatFechaAR` reads the raw UTC date and
 * would show that next day; `formatFechaInstanteAR` converts to AR time first
 * and shows the correct AR calendar day, identically on any device timezone.
 */
import { describe, it, expect } from 'vitest'
import {
  formatFechaAR,
  formatFechaInstanteAR,
  fechaISO_AR,
  parseFechaAR,
} from '@/lib/dates'

// 23:30 of 2026-05-23 in Argentina (UTC-3) === 02:30 UTC on 2026-05-24.
// This mirrors the real pedido f934b2e3: UTC day = 24, AR day = 23.
const INSTANTE_POST_21 = '2026-05-24T02:30:00.000Z'

describe('formatFechaInstanteAR (instant fields like pedidos.fecha)', () => {
  it('shows the AR calendar day for an instant created after 21:00 AR', () => {
    // The correct day is 23 (AR), NOT 24 (UTC).
    expect(formatFechaInstanteAR(INSTANTE_POST_21)).toBe('23/05/2026')
  })

  it('supports the short (2-digit year) variant', () => {
    expect(formatFechaInstanteAR(INSTANTE_POST_21, true)).toBe('23/05/26')
  })

  it('accepts both Date and string and yields the same result', () => {
    expect(formatFechaInstanteAR(new Date(INSTANTE_POST_21))).toBe(
      formatFechaInstanteAR(INSTANTE_POST_21),
    )
  })

  it('differs from formatFechaAR for a post-21:00 instant (documents the fix)', () => {
    // formatFechaAR reads the raw UTC date → the buggy "24"; the instant
    // helper corrects it to "23".
    expect(formatFechaAR(INSTANTE_POST_21)).toBe('24/05/2026')
    expect(formatFechaInstanteAR(INSTANTE_POST_21)).toBe('23/05/2026')
  })
})

describe('formatFechaAR (business-date fields) stays unchanged', () => {
  it('formats a date-only string without any day shift', () => {
    expect(formatFechaAR('2026-05-28')).toBe('28/05/2026')
  })

  it('formats a midnight-UTC instant without shifting to the previous day', () => {
    expect(formatFechaAR('2026-05-28T00:00:00.000Z')).toBe('28/05/2026')
  })
})

describe('fechaISO_AR (edit prefill)', () => {
  it('returns YYYY-MM-DD of the instant in AR time', () => {
    expect(fechaISO_AR(INSTANTE_POST_21)).toBe('2026-05-23')
  })

  it('matches the displayed date so the prefill is consistent', () => {
    // dd/MM/yyyy of the prefill === what formatFechaInstanteAR renders.
    const iso = fechaISO_AR(INSTANTE_POST_21) // 2026-05-23
    const [y, m, d] = iso.split('-')
    expect(`${d}/${m}/${y}`).toBe(formatFechaInstanteAR(INSTANTE_POST_21))
  })
})

describe('parseFechaAR round-trip (how new pedidos are stored)', () => {
  it('stores midnight AR (03:00 UTC) and renders the same calendar day', () => {
    const stored = parseFechaAR('2026-05-23')
    expect(stored.toISOString()).toBe('2026-05-23T03:00:00.000Z')
    expect(formatFechaInstanteAR(stored)).toBe('23/05/2026')
  })

  it('prefill of a stored value round-trips back to the same YYYY-MM-DD', () => {
    const stored = parseFechaAR('2026-05-23')
    expect(fechaISO_AR(stored)).toBe('2026-05-23')
  })

  it('a value stored as midnight AR reads the same in both helpers', () => {
    // For new pedidos there is no longer any discrepancy between the two helpers.
    const stored = parseFechaAR('2026-05-23')
    expect(formatFechaAR(stored)).toBe(formatFechaInstanteAR(stored))
  })
})
