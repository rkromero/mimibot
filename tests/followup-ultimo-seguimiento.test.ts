/**
 * Botón "Último seguimiento": reglas puras (lib/followup/ultimo-seguimiento.ts).
 *  - El plazo de cierre cuenta horas solo dentro del horario permitido (8 a 22, hora AR).
 *  - Las respuestas automáticas de negocios no cuentan como respuesta.
 * Hora Argentina = UTC-3.
 */
import { describe, it, expect } from 'vitest'
import {
  calcularCierreUltimoSeguimiento,
  esRespuestaAutomatica,
  normalizarTexto,
  RESPUESTAS_AUTOMATICAS_DEFAULT,
} from '@/lib/followup/ultimo-seguimiento'

const ar = (isoLocal: string) => new Date(`${isoLocal}-03:00`)
const local = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 16)

describe('calcularCierreUltimoSeguimiento (horario 08 a 22)', () => {
  it('a media mañana, 10 horas entran en el mismo día', () => {
    expect(local(calcularCierreUltimoSeguimiento(ar('2026-09-02T10:00'), 10))).toBe('2026-09-02 20:00')
  })

  it('a la tarde, lo que no entra sigue a las 08:00 del día siguiente', () => {
    // 20:00 → 2 hs hasta las 22, y 8 hs desde las 08 → 16:00
    expect(local(calcularCierreUltimoSeguimiento(ar('2026-09-02T20:00'), 10))).toBe('2026-09-03 16:00')
  })

  it('de noche o de madrugada el reloj arranca a las 08:00', () => {
    expect(local(calcularCierreUltimoSeguimiento(ar('2026-09-02T23:30'), 10))).toBe('2026-09-03 18:00')
    expect(local(calcularCierreUltimoSeguimiento(ar('2026-09-03T03:00'), 10))).toBe('2026-09-03 18:00')
  })

  it('justo al cierre del horario, arranca al día siguiente', () => {
    expect(local(calcularCierreUltimoSeguimiento(ar('2026-09-02T22:00'), 10))).toBe('2026-09-03 18:00')
  })

  it('plazos largos cruzan varios días', () => {
    // 10:00 → 12 hs hoy (hasta 22), 14 hs mañana (08 a 22), 4 hs pasado → 12:00
    expect(local(calcularCierreUltimoSeguimiento(ar('2026-09-02T10:00'), 30))).toBe('2026-09-04 12:00')
  })

  it('con horario de 24 horas cuenta corrido', () => {
    const todoElDia = { desde: 0, hasta: 24, offsetHoras: -3 }
    expect(local(calcularCierreUltimoSeguimiento(ar('2026-09-02T20:00'), 10, todoElDia))).toBe('2026-09-03 06:00')
  })

  it('con horario inválido (hasta <= desde) cuenta corrido', () => {
    const roto = { desde: 22, hasta: 8, offsetHoras: -3 }
    expect(local(calcularCierreUltimoSeguimiento(ar('2026-09-02T20:00'), 10, roto))).toBe('2026-09-03 06:00')
  })
})

describe('esRespuestaAutomatica', () => {
  it('detecta contestadores típicos de negocios, sin importar mayúsculas ni tildes', () => {
    expect(esRespuestaAutomatica('Hola! En este momento estamos cerrados, te contestamos a la brevedad.')).toBe(true)
    expect(esRespuestaAutomatica('GRACIAS POR COMUNICARTE CON NOSOTROS. Un asesor se comunicará.')).toBe(true)
    expect(esRespuestaAutomatica('Nuestro horario de atencion es de 9 a 18')).toBe(true)
    expect(esRespuestaAutomatica('Este es un mensaje automatico')).toBe(true)
  })

  it('una respuesta de persona no es automática', () => {
    expect(esRespuestaAutomatica('sí, me interesa, pasame el precio')).toBe(false)
    expect(esRespuestaAutomatica('ok')).toBe(false)
    expect(esRespuestaAutomatica('más adelante te aviso')).toBe(false)
    expect(esRespuestaAutomatica('dale, arrancamos en noviembre')).toBe(false)
  })

  it('vacío o nulo no es automática', () => {
    expect(esRespuestaAutomatica('')).toBe(false)
    expect(esRespuestaAutomatica('   ')).toBe(false)
    expect(esRespuestaAutomatica(null)).toBe(false)
    expect(esRespuestaAutomatica(undefined)).toBe(false)
  })

  it('las frases extra de Ajustes también cuentan, sin tildes', () => {
    expect(esRespuestaAutomatica('Hola, en unos minutos te llamamos', [])).toBe(false)
    expect(esRespuestaAutomatica('Hola, en unos minutos te llamamos', ['En unos minutos te llamamos'])).toBe(true)
    expect(esRespuestaAutomatica('no atendemos los sabados', ['no atendemos los sábados'])).toBe(true)
  })

  it('las frases por defecto están normalizadas para poder compararlas', () => {
    for (const f of RESPUESTAS_AUTOMATICAS_DEFAULT) {
      expect(normalizarTexto(f).length).toBeGreaterThan(0)
    }
    expect(normalizarTexto('  Horario   de Atención ')).toBe('horario de atencion')
  })
})
