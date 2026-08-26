/**
 * Seguimiento de leads en Nuevo que dejan de responder al bot: horarios y textos.
 * Hora Argentina = UTC-3. "2026-08-26T13:00:00Z" son las 10:00 en Buenos Aires.
 */
import { describe, it, expect } from 'vitest'
import {
  estaEnHorarioPermitido,
  posponerAHorarioPermitido,
  adelantarAHorarioPermitido,
  calcularPrimerSeguimiento,
  calcularSeguimientoFinal,
  renderMensajeIndagacion,
  MENSAJE_FINAL_DEFAULT,
} from '@/lib/followup/indagacion'

const ar = (isoLocal: string) => new Date(`${isoLocal}-03:00`) // hora Argentina
const local = (d: Date) => d.toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 16)

describe('horario permitido (08:00 a 22:00 hora Argentina)', () => {
  it('detecta el horario bloqueado', () => {
    expect(estaEnHorarioPermitido(ar('2026-08-26T10:00'))).toBe(true)
    expect(estaEnHorarioPermitido(ar('2026-08-26T21:59'))).toBe(true)
    expect(estaEnHorarioPermitido(ar('2026-08-26T22:00'))).toBe(false)
    expect(estaEnHorarioPermitido(ar('2026-08-26T03:00'))).toBe(false)
    expect(estaEnHorarioPermitido(ar('2026-08-26T07:59'))).toBe(false)
    expect(estaEnHorarioPermitido(ar('2026-08-26T08:00'))).toBe(true)
  })

  it('posponer: de noche pasa a las 08:00 del día siguiente; de madrugada a las 08:00 del mismo día', () => {
    expect(local(posponerAHorarioPermitido(ar('2026-08-26T23:10')))).toBe('2026-08-27 08:00')
    expect(local(posponerAHorarioPermitido(ar('2026-08-27T02:30')))).toBe('2026-08-27 08:00')
    expect(local(posponerAHorarioPermitido(ar('2026-08-26T15:00')))).toBe('2026-08-26 15:00')
  })

  it('adelantar: de noche vuelve a las 21:30 del mismo día; de madrugada a las 21:30 del día anterior', () => {
    expect(local(adelantarAHorarioPermitido(ar('2026-08-26T23:10')))).toBe('2026-08-26 21:30')
    expect(local(adelantarAHorarioPermitido(ar('2026-08-27T02:30')))).toBe('2026-08-26 21:30')
    expect(local(adelantarAHorarioPermitido(ar('2026-08-26T15:00')))).toBe('2026-08-26 15:00')
  })
})

describe('calcularPrimerSeguimiento', () => {
  it('2 horas después del último mensaje del bot', () => {
    expect(local(calcularPrimerSeguimiento(ar('2026-08-26T10:00'), 2))).toBe('2026-08-26 12:00')
  })

  it('si cae de noche, sale a las 08:00 (sigue dentro de la ventana de 24 hs)', () => {
    expect(local(calcularPrimerSeguimiento(ar('2026-08-26T21:00'), 2))).toBe('2026-08-27 08:00')
  })
})

describe('calcularSeguimientoFinal', () => {
  const ahora = ar('2026-08-26T12:05')

  it('23 horas después del último mensaje de la persona', () => {
    const at = calcularSeguimientoFinal({ ultimoMensajeClienteAt: ar('2026-08-26T10:00'), horas: 23, ahora })
    expect(local(at)).toBe('2026-08-27 09:00')
  })

  it('si cae de noche se adelanta a las 21:30 para no salir de la ventana', () => {
    // último mensaje 00:30 → 23 hs = 23:30 (bloqueado) → 21:30 del mismo día (21 hs después, dentro de la ventana)
    const at = calcularSeguimientoFinal({ ultimoMensajeClienteAt: ar('2026-08-26T00:30'), horas: 23, ahora: ar('2026-08-26T08:05') })
    expect(local(at)).toBe('2026-08-26 21:30')
  })

  it('nunca antes del primer seguimiento ni en el pasado', () => {
    const primero = ar('2026-08-27T08:00')
    const at = calcularSeguimientoFinal({ ultimoMensajeClienteAt: ar('2026-08-26T03:00'), horas: 23, ahora, noAntesDe: primero })
    // 03:00 + 23 = 02:00 del 27 (bloqueado) → 21:30 del 26, pero el primero sale el 27 08:00 → piso
    expect(at.getTime()).toBe(primero.getTime())
  })
})

describe('renderMensajeIndagacion', () => {
  it('completa nombre y producto', () => {
    expect(renderMensajeIndagacion(MENSAJE_FINAL_DEFAULT, { clienteNombre: 'Juan Pérez', productoInteres: 'alfajores' }))
      .toBe('Hola Juan, te escribo por última vez por tu consulta de alfajores. Querés que sigamos con la cotización o preferís dejarlo? Cualquier cosa quedo a disposición.')
  })

  it('sin producto usa un comodín; sin nombre no deja "Hola ,"', () => {
    const msg = renderMensajeIndagacion(null, { clienteNombre: '', productoInteres: null }, 'Hola {{1}}, seguimos con {{2}}?')
    expect(msg).toBe('Hola, seguimos con tu producto?')
  })
})
