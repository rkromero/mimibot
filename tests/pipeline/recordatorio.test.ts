/**
 * Helpers puros del recordatorio de llamada del lead (lib/leads/recordatorio.ts):
 * validación del día, estado (vencido / hoy / próximo), aritmética de fechas
 * sin zona horaria, atajos del modal, textos del chip y de la actividad.
 */
import { describe, it, expect } from 'vitest'
import {
  esFechaDia,
  estadoRecordatorio,
  esParaHoy,
  sumarDias,
  sumarMeses,
  fechaAtajo,
  etiquetaRecordatorio,
  textoRecordatorio,
  textoRecordatorioCumplido,
  clavePopupVisto,
} from '@/lib/leads/recordatorio'

const HOY = '2026-09-02'

describe('esFechaDia', () => {
  it('acepta un día calendario YYYY-MM-DD', () => {
    expect(esFechaDia('2026-11-03')).toBe(true)
    expect(esFechaDia('2028-02-29')).toBe(true) // bisiesto
  })

  it('rechaza días inexistentes y otros formatos', () => {
    expect(esFechaDia('2026-02-30')).toBe(false)
    expect(esFechaDia('2026-13-01')).toBe(false)
    expect(esFechaDia('2026-1-3')).toBe(false)
    expect(esFechaDia('03/11/2026')).toBe(false)
    expect(esFechaDia('2026-11-03T00:00:00Z')).toBe(false)
    expect(esFechaDia(20261103)).toBe(false)
    expect(esFechaDia(null)).toBe(false)
  })
})

describe('estadoRecordatorio / esParaHoy', () => {
  it('antes de hoy → vencido y es para hoy', () => {
    expect(estadoRecordatorio('2026-09-01', HOY)).toBe('vencido')
    expect(esParaHoy('2026-09-01', HOY)).toBe(true)
  })

  it('hoy → hoy y es para hoy', () => {
    expect(estadoRecordatorio(HOY, HOY)).toBe('hoy')
    expect(esParaHoy(HOY, HOY)).toBe(true)
  })

  it('después → próximo y no es para hoy', () => {
    expect(estadoRecordatorio('2026-11-03', HOY)).toBe('proximo')
    expect(esParaHoy('2026-11-03', HOY)).toBe(false)
  })
})

describe('sumarDias', () => {
  it('cruza mes y año sin depender de la zona horaria', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01')
    expect(sumarDias('2026-09-02', 7)).toBe('2026-09-09')
    expect(sumarDias('2026-09-28', 7)).toBe('2026-10-05')
  })
})

describe('sumarMeses', () => {
  it('cae al último día cuando el mes destino es más corto', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(sumarMeses('2026-03-31', 1)).toBe('2026-04-30')
  })

  it('cruza el año', () => {
    expect(sumarMeses('2026-12-15', 1)).toBe('2027-01-15')
  })
})

describe('fechaAtajo', () => {
  it('mañana, en una semana y en un mes a partir de hoy', () => {
    expect(fechaAtajo('manana', HOY)).toBe('2026-09-03')
    expect(fechaAtajo('semana', HOY)).toBe('2026-09-09')
    expect(fechaAtajo('mes', HOY)).toBe('2026-10-02')
  })
})

describe('etiquetaRecordatorio', () => {
  it('hoy / vencido / próximo', () => {
    expect(etiquetaRecordatorio(HOY, HOY)).toBe('Llamar hoy')
    expect(etiquetaRecordatorio('2026-09-01', HOY)).toBe('Vencido 01/09/26')
    expect(etiquetaRecordatorio('2026-11-03', HOY)).toBe('Llamar 03/11/26')
  })
})

describe('textos de la actividad del lead', () => {
  it('al fijar el recordatorio, con y sin nota', () => {
    expect(textoRecordatorio('2026-11-03', 'Arrancan en noviembre'))
      .toBe('Recordatorio para llamar el 03/11/2026: Arrancan en noviembre')
    expect(textoRecordatorio('2026-11-03', null)).toBe('Recordatorio para llamar el 03/11/2026')
  })

  it('al darlo por cumplido', () => {
    expect(textoRecordatorioCumplido('2026-11-03', 'Arrancan en noviembre'))
      .toBe('Recordatorio cumplido (03/11/2026: Arrancan en noviembre)')
    expect(textoRecordatorioCumplido('2026-11-03', null)).toBe('Recordatorio cumplido (03/11/2026)')
  })
})

describe('clavePopupVisto', () => {
  it('es por usuario y por día', () => {
    expect(clavePopupVisto('u1', HOY)).toBe('recordatorios-popup-visto:u1:2026-09-02')
    expect(clavePopupVisto('u1', '2026-09-03')).not.toBe(clavePopupVisto('u1', HOY))
    expect(clavePopupVisto('u2', HOY)).not.toBe(clavePopupVisto('u1', HOY))
  })
})
