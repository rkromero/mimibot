/**
 * Cadencia post-propuesta (día 3 y aviso de vencimiento): reglas puras.
 */
import { describe, it, expect } from 'vitest'
import {
  REASON_PROPUESTA_RECORDATORIO,
  REASON_PROPUESTA_VENCE,
  calcularAvisoVencimiento,
  calcularRecordatorioPropuesta,
  decidirPasoCadencia,
  formatVigencia,
  limiteAvisoVencimiento,
  siguientePasoCadencia,
} from '@/lib/followup/propuesta-cadencia'

// Propuesta enviada el 04/11 14:10 Argentina (17:10Z), vigente hasta el 11/11
const enviadaAt = new Date('2026-11-04T17:10:00Z')
const vigenteHasta = '2026-11-11'

describe('fechas de la cadencia', () => {
  it('recordatorio el día 3 a las 11 de Argentina', () => {
    expect(calcularRecordatorioPropuesta(enviadaAt).toISOString()).toBe('2026-11-07T14:00:00.000Z')
  })

  it('aviso de vencimiento el día anterior a las 11, límite el mismo día del vencimiento', () => {
    expect(calcularAvisoVencimiento(vigenteHasta).toISOString()).toBe('2026-11-10T14:00:00.000Z')
    expect(limiteAvisoVencimiento(vigenteHasta).toISOString()).toBe('2026-11-12T00:00:00.000Z')
    expect(formatVigencia(vigenteHasta)).toBe('11/11')
  })
})

describe('siguientePasoCadencia', () => {
  it('primero el día 3, después el aviso de vencimiento, después nada', () => {
    const ahora = new Date('2026-11-05T15:00:00Z')
    const p1 = siguientePasoCadencia({ ahora, propuestaEnviadaAt: enviadaAt, vigenteHasta, ultimoPaso: null })
    expect(p1).toEqual({ paso: REASON_PROPUESTA_RECORDATORIO, at: new Date('2026-11-07T14:00:00Z') })

    const p2 = siguientePasoCadencia({
      ahora: new Date('2026-11-07T14:05:00Z'), propuestaEnviadaAt: enviadaAt, vigenteHasta, ultimoPaso: REASON_PROPUESTA_RECORDATORIO,
    })
    expect(p2).toEqual({ paso: REASON_PROPUESTA_VENCE, at: new Date('2026-11-10T14:00:00Z') })

    expect(siguientePasoCadencia({
      ahora: new Date('2026-11-10T14:05:00Z'), propuestaEnviadaAt: enviadaAt, vigenteHasta, ultimoPaso: REASON_PROPUESTA_VENCE,
    })).toBeNull()
  })

  it('si el día 3 ya pasó, salta directo al aviso de vencimiento', () => {
    const p = siguientePasoCadencia({ ahora: new Date('2026-11-08T15:00:00Z'), propuestaEnviadaAt: enviadaAt, vigenteHasta, ultimoPaso: null })
    expect(p?.paso).toBe(REASON_PROPUESTA_VENCE)
  })

  it('con vigencia corta no manda el día 3 pegado al vencimiento', () => {
    const p = siguientePasoCadencia({ ahora: new Date('2026-11-05T15:00:00Z'), propuestaEnviadaAt: enviadaAt, vigenteHasta: '2026-11-08', ultimoPaso: null })
    expect(p).toEqual({ paso: REASON_PROPUESTA_VENCE, at: new Date('2026-11-07T14:00:00Z') })
  })

  it('si el aviso ya pasó pero la propuesta vence hoy, sale en una hora; si ya venció, nada', () => {
    const hoy = siguientePasoCadencia({ ahora: new Date('2026-11-11T15:00:00Z'), propuestaEnviadaAt: enviadaAt, vigenteHasta, ultimoPaso: REASON_PROPUESTA_RECORDATORIO })
    expect(hoy).toEqual({ paso: REASON_PROPUESTA_VENCE, at: new Date('2026-11-11T16:00:00Z') })
    expect(siguientePasoCadencia({ ahora: new Date('2026-11-12T15:00:00Z'), propuestaEnviadaAt: enviadaAt, vigenteHasta, ultimoPaso: null })).toBeNull()
  })
})

describe('decidirPasoCadencia', () => {
  const ahora = new Date('2026-11-07T14:00:00Z')
  const base = {
    ahora, ultimoMensajeHumanoAt: null as Date | null, limite: new Date('2026-11-09T14:00:00Z'),
    enEtapaPropuesta: true as boolean | null, botApagadoAMano: false, propuestaVigente: true,
  }

  it('manda si nadie escribió en las últimas 48 hs', () => {
    expect(decidirPasoCadencia({ ...base, ultimoMensajeHumanoAt: new Date('2026-11-04T18:00:00Z') })).toEqual({ tipo: 'enviar' })
  })

  it('pospone si la charla está viva y omite si eso pasa del límite', () => {
    expect(decidirPasoCadencia({ ...base, ultimoMensajeHumanoAt: new Date('2026-11-06T20:00:00Z') }))
      .toEqual({ tipo: 'posponer', hasta: new Date('2026-11-08T20:00:00Z') })
    expect(decidirPasoCadencia({ ...base, ultimoMensajeHumanoAt: new Date('2026-11-07T13:00:00Z'), limite: new Date('2026-11-08T14:00:00Z') }))
      .toEqual({ tipo: 'omitir', motivo: 'la charla siguió activa' })
  })

  it('omite si el lead avanzó de etapa, el bot está apagado a mano o la propuesta venció', () => {
    expect(decidirPasoCadencia({ ...base, enEtapaPropuesta: false }).tipo).toBe('omitir')
    expect(decidirPasoCadencia({ ...base, botApagadoAMano: true }).tipo).toBe('omitir')
    expect(decidirPasoCadencia({ ...base, propuestaVigente: false }).tipo).toBe('omitir')
  })
})
