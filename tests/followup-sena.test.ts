/**
 * Recordatorio de seña: cuándo sale cada uno (reglas puras).
 */
import { describe, it, expect } from 'vitest'
import { decidirRecordatorioSena, renderTextoSena, type CandidatoSena } from '@/lib/followup/sena'

// Proforma el lunes 02/11 15:00 Argentina (18:00Z)
const proformaAt = new Date('2026-11-02T18:00:00Z')
const base: CandidatoSena = {
  proformaAt, recordatoriosEnviados: 0, cortado: false, mandoArchivoDespuesDeProforma: false, ultimoMensajeHumanoAt: null,
}

describe('decidirRecordatorioSena', () => {
  it('sale a las 24 hs, 72 hs y 7 días de la proforma', () => {
    expect(decidirRecordatorioSena(base, new Date('2026-11-03T17:00:00Z')).tipo).toBe('esperar')
    expect(decidirRecordatorioSena(base, new Date('2026-11-03T18:05:00Z'))).toEqual({ tipo: 'enviar', paso: 1 })
    expect(decidirRecordatorioSena({ ...base, recordatoriosEnviados: 1 }, new Date('2026-11-04T18:00:00Z')).tipo).toBe('esperar')
    expect(decidirRecordatorioSena({ ...base, recordatoriosEnviados: 1 }, new Date('2026-11-05T18:05:00Z'))).toEqual({ tipo: 'enviar', paso: 2 })
    expect(decidirRecordatorioSena({ ...base, recordatoriosEnviados: 2 }, new Date('2026-11-09T18:05:00Z'))).toEqual({ tipo: 'enviar', paso: 3 })
    expect(decidirRecordatorioSena({ ...base, recordatoriosEnviados: 3 }, new Date('2026-11-10T18:05:00Z')).tipo).toBe('esperar')
  })

  it('no sale de noche ni con la charla activa', () => {
    // 03/11 23:30 Argentina
    expect(decidirRecordatorioSena(base, new Date('2026-11-04T02:30:00Z')).tipo).toBe('esperar')
    expect(decidirRecordatorioSena({ ...base, ultimoMensajeHumanoAt: new Date('2026-11-03T12:00:00Z') }, new Date('2026-11-03T18:05:00Z')).tipo)
      .toBe('esperar')
  })

  it('corta si mandó un archivo (posible comprobante) o pasaron más de 10 días', () => {
    expect(decidirRecordatorioSena({ ...base, mandoArchivoDespuesDeProforma: true }, new Date('2026-11-03T18:05:00Z')).tipo).toBe('cortar')
    expect(decidirRecordatorioSena({ ...base, recordatoriosEnviados: 2 }, new Date('2026-11-13T18:05:00Z')).tipo).toBe('cortar')
    expect(decidirRecordatorioSena({ ...base, cortado: true }, new Date('2026-11-03T18:05:00Z')).tipo).toBe('esperar')
  })
})

describe('renderTextoSena', () => {
  it('con y sin nombre', () => {
    expect(renderTextoSena('Gonzalo')).toMatch(/^Hola Gonzalo! Te recuerdo que para arrancar/)
    expect(renderTextoSena(null)).toMatch(/^Hola! Te recuerdo/)
  })
})
