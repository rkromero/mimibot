/**
 * Pregunta "¿pudiste ver la propuesta?" con espera mínima de una hora (reglas puras).
 */
import { describe, it, expect } from 'vitest'
import {
  esAcuseDeRecibo,
  calcularPreguntaPropuestaVista,
  minutosDesde,
  motivoParaOmitirPreguntaPropuestaVista,
  MINUTOS_ESPERA_PROPUESTA,
  REASON_PROPUESTA_VISTA,
} from '@/lib/followup/propuesta-vista'

describe('esAcuseDeRecibo', () => {
  it('reconoce agradecimientos y "después lo veo"', () => {
    for (const t of ['Gracias', 'ok', 'Dale, perfecto', 'Genial, gracias!', 'Recibido', 'Lo veo y te digo', 'Buenísimo, lo reviso', 'Joya']) {
      expect(esAcuseDeRecibo(t), t).toBe(true)
    }
  })

  it('no es acuse si pregunta algo, opina sobre la propuesta o escribe largo', () => {
    for (const t of [
      'Gracias, cuánto tarda el pedido?',
      'Ya la vi, me parece caro',
      'Perfecto, me cierra, cuántos negros puedo pedir',
      'Gracias, el precio incluye el envío?',
      'Hola',
      '',
      'gracias por la info, lo que pasa es que nosotros estamos recien arrancando con el emprendimiento y queremos ver bien',
    ]) {
      expect(esAcuseDeRecibo(t), t).toBe(false)
    }
  })
})

describe('calcularPreguntaPropuestaVista', () => {
  const enviada = new Date('2026-10-28T17:06:00Z') // 14:06 Argentina

  it('pregunta una hora después de la propuesta si el acuse llegó enseguida', () => {
    expect(MINUTOS_ESPERA_PROPUESTA).toBe(60)
    const at = calcularPreguntaPropuestaVista(enviada, new Date('2026-10-28T17:07:00Z'))
    expect(at.toISOString()).toBe('2026-10-28T18:06:00.000Z')
    expect(minutosDesde(enviada, new Date('2026-10-28T17:07:00Z'))).toBe(1)
  })

  it('si ya pasó la hora, pregunta en un minuto', () => {
    const at = calcularPreguntaPropuestaVista(enviada, new Date('2026-10-28T19:00:00Z'))
    expect(at.toISOString()).toBe('2026-10-28T19:01:00.000Z')
  })

  it('de noche se corre a las 8 de la mañana', () => {
    // 23:30 Argentina = 02:30Z → +1h = 00:30 Argentina → 08:00 Argentina = 11:00Z
    const at = calcularPreguntaPropuestaVista(new Date('2026-10-29T02:30:00Z'), new Date('2026-10-29T02:31:00Z'))
    expect(at.toISOString()).toBe('2026-10-29T11:00:00.000Z')
  })
})

describe('motivoParaOmitirPreguntaPropuestaVista', () => {
  it('se pregunta solo si el bot sigue prendido, nadie escribió y sigue en Propuesta enviada', () => {
    expect(motivoParaOmitirPreguntaPropuestaVista({ mensajesDelClienteDesdeProgramado: 0, botEnabled: true, enEtapaPropuesta: true })).toBeNull()
    expect(motivoParaOmitirPreguntaPropuestaVista({ mensajesDelClienteDesdeProgramado: 0, botEnabled: true, enEtapaPropuesta: null })).toBeNull()
    expect(motivoParaOmitirPreguntaPropuestaVista({ mensajesDelClienteDesdeProgramado: 1, botEnabled: true, enEtapaPropuesta: true })).toBe('el cliente volvió a escribir')
    expect(motivoParaOmitirPreguntaPropuestaVista({ mensajesDelClienteDesdeProgramado: 0, botEnabled: false, enEtapaPropuesta: true })).toBe('el bot ya no sigue esta conversación')
    expect(motivoParaOmitirPreguntaPropuestaVista({ mensajesDelClienteDesdeProgramado: 0, botEnabled: true, enEtapaPropuesta: false })).toContain('Propuesta enviada')
    expect(REASON_PROPUESTA_VISTA).toBe('propuesta_vista')
  })
})
