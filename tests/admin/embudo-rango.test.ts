/**
 * Unit tests for the Embudo period-range helpers (día/semana/mes, período
 * anterior, navegación). The week always starts on Monday. Cross-month and
 * cross-year boundaries must be handled correctly.
 */
import { describe, it, expect } from 'vitest'
import {
  getRango,
  getRangoAnterior,
  navegar,
  formatPeriodoLabel,
  formatCohorteLabel,
  toYmd,
} from '@/components/dashboard/admin/embudoRango'

// Anclas de referencia (medianoche local).
// Junio 2026: el 8 cae lunes (verificado: 2026-06-08 es lunes).
const MIE_10_JUN_2026 = new Date(2026, 5, 10) // miércoles
const MAR_30_JUN_2026 = new Date(2026, 5, 30) // martes (semana cruza a julio)
const DIC_15_2025 = new Date(2025, 11, 15)
const DIC_31_2025 = new Date(2025, 11, 31)

describe('getRango — día', () => {
  it('[d, d+1) a medianoche local', () => {
    const r = getRango('dia', new Date(2026, 5, 12, 15, 30)) // con hora → se normaliza
    expect(toYmd(r.desde)).toBe('2026-06-12')
    expect(toYmd(r.hasta)).toBe('2026-06-13')
    expect(r.desde.getHours()).toBe(0)
  })
})

describe('getRango — semana (arranca lunes)', () => {
  it('miércoles 10 jun → [lun 8, lun 15)', () => {
    const r = getRango('semana', MIE_10_JUN_2026)
    expect(toYmd(r.desde)).toBe('2026-06-08')
    expect(toYmd(r.hasta)).toBe('2026-06-15')
    expect(r.desde.getDay()).toBe(1) // lunes
  })

  it('el último día (domingo) pertenece a hasta-1', () => {
    const r = getRango('semana', MIE_10_JUN_2026)
    const domingo = new Date(r.hasta.getTime() - 24 * 3600 * 1000)
    expect(domingo.getDay()).toBe(0) // domingo
    expect(toYmd(domingo)).toBe('2026-06-14')
  })

  it('cruce de mes: martes 30 jun → [lun 29 jun, lun 6 jul)', () => {
    const r = getRango('semana', MAR_30_JUN_2026)
    expect(toYmd(r.desde)).toBe('2026-06-29')
    expect(toYmd(r.hasta)).toBe('2026-07-06')
    expect(r.desde.getDay()).toBe(1)
  })

  it('cruce de año: 31 dic 2025 (miércoles) → [lun 29 dic 2025, lun 5 ene 2026)', () => {
    const r = getRango('semana', DIC_31_2025)
    expect(toYmd(r.desde)).toBe('2025-12-29')
    expect(toYmd(r.hasta)).toBe('2026-01-05')
    expect(r.desde.getDay()).toBe(1)
  })
})

describe('getRango — mes', () => {
  it('[1° del mes, 1° del siguiente)', () => {
    const r = getRango('mes', new Date(2026, 5, 20))
    expect(toYmd(r.desde)).toBe('2026-06-01')
    expect(toYmd(r.hasta)).toBe('2026-07-01')
  })

  it('diciembre → enero del año siguiente', () => {
    const r = getRango('mes', DIC_15_2025)
    expect(toYmd(r.desde)).toBe('2025-12-01')
    expect(toYmd(r.hasta)).toBe('2026-01-01')
  })
})

describe('getRangoAnterior — mismo largo, inmediatamente previo', () => {
  it('día anterior', () => {
    const r = getRango('dia', new Date(2026, 5, 12))
    const prev = getRangoAnterior('dia', r)
    expect(toYmd(prev.desde)).toBe('2026-06-11')
    expect(toYmd(prev.hasta)).toBe('2026-06-12')
    expect(prev.hasta.getTime()).toBe(r.desde.getTime())
  })

  it('semana anterior (lunes a lunes)', () => {
    const r = getRango('semana', MIE_10_JUN_2026) // [8, 15)
    const prev = getRangoAnterior('semana', r)
    expect(toYmd(prev.desde)).toBe('2026-06-01')
    expect(toYmd(prev.hasta)).toBe('2026-06-08')
    expect(prev.desde.getDay()).toBe(1)
  })

  it('mes anterior (cruce de año)', () => {
    const r = getRango('mes', new Date(2026, 0, 10)) // enero 2026
    const prev = getRangoAnterior('mes', r)
    expect(toYmd(prev.desde)).toBe('2025-12-01')
    expect(toYmd(prev.hasta)).toBe('2026-01-01')
  })
})

describe('navegar — anterior / siguiente', () => {
  it('día: ±1 día (cruce de año)', () => {
    const next = navegar('dia', DIC_31_2025, 1)
    expect(toYmd(getRango('dia', next).desde)).toBe('2026-01-01')
    const prev = navegar('dia', new Date(2026, 0, 1), -1)
    expect(toYmd(getRango('dia', prev).desde)).toBe('2025-12-31')
  })

  it('semana: ±7 días, siempre cae en lunes', () => {
    const next = navegar('semana', MIE_10_JUN_2026, 1) // semana de [8,15) → [15,22)
    const rNext = getRango('semana', next)
    expect(toYmd(rNext.desde)).toBe('2026-06-15')
    expect(rNext.desde.getDay()).toBe(1)

    const prev = navegar('semana', MIE_10_JUN_2026, -1)
    expect(toYmd(getRango('semana', prev).desde)).toBe('2026-06-01')
  })

  it('semana: avanzar cruzando el cambio de mes', () => {
    // semana de [29 jun, 6 jul) → siguiente [6 jul, 13 jul)
    const next = navegar('semana', MAR_30_JUN_2026, 1)
    const rNext = getRango('semana', next)
    expect(toYmd(rNext.desde)).toBe('2026-07-06')
    expect(toYmd(rNext.hasta)).toBe('2026-07-13')
  })

  it('mes: ±1 mes (cruce de año)', () => {
    const next = navegar('mes', DIC_15_2025, 1)
    expect(toYmd(getRango('mes', next).desde)).toBe('2026-01-01')
    const prev = navegar('mes', new Date(2026, 0, 10), -1)
    expect(toYmd(getRango('mes', prev).desde)).toBe('2025-12-01')
  })
})

describe('formatPeriodoLabel', () => {
  it('día → "12 Jun 2026"', () => {
    expect(formatPeriodoLabel('dia', getRango('dia', new Date(2026, 5, 12)))).toBe('12 Jun 2026')
  })

  it('semana mismo mes → "Lun 8 – Dom 14 Jun 2026"', () => {
    expect(formatPeriodoLabel('semana', getRango('semana', MIE_10_JUN_2026))).toBe(
      'Lun 8 – Dom 14 Jun 2026',
    )
  })

  it('semana cruzando mes → muestra ambos meses', () => {
    const label = formatPeriodoLabel('semana', getRango('semana', MAR_30_JUN_2026))
    expect(label).toContain('Jun')
    expect(label).toContain('Jul')
    expect(label).toContain('2026')
  })

  it('semana cruzando año → muestra ambos años', () => {
    const label = formatPeriodoLabel('semana', getRango('semana', DIC_31_2025))
    expect(label).toContain('2025')
    expect(label).toContain('2026')
  })

  it('mes → "Junio 2026"', () => {
    expect(formatPeriodoLabel('mes', getRango('mes', new Date(2026, 5, 20)))).toBe('Junio 2026')
  })
})

describe('toYmd', () => {
  it('formatea con cero a la izquierda', () => {
    expect(toYmd(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toYmd(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('formatCohorteLabel', () => {
  it('mismo mes → "8–14 Jun"', () => {
    expect(formatCohorteLabel('2026-06-08')).toBe('8–14 Jun')
  })

  it('cruza mes → "29 Jun–5 Jul"', () => {
    expect(formatCohorteLabel('2026-06-29')).toBe('29 Jun–5 Jul')
  })
})
