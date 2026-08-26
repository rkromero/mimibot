/**
 * Seguimiento automático después de enviar una propuesta: cuándo sale y qué dice.
 */
import { describe, it, expect } from 'vitest'
import {
  calcularEnvioSeguimientoPropuesta,
  renderMensajeSeguimientoPropuesta,
  MENSAJE_SEGUIMIENTO_PROPUESTA_DEFAULT,
} from '@/lib/followup/propuesta'

const H = 60 * 60 * 1000
const t = (iso: string) => new Date(iso)

describe('calcularEnvioSeguimientoPropuesta', () => {
  it('se programa a 23 hs del último mensaje del cliente, dentro de la ventana', () => {
    const plan = calcularEnvioSeguimientoPropuesta({
      ahora: t('2026-08-26T16:00:00Z'),
      ultimoMensajeClienteAt: t('2026-08-26T10:00:00Z'),
      horasDesdeUltimoMensaje: 23,
    })
    expect(plan.dentroVentana).toBe(true)
    expect(plan.enviarAt.toISOString()).toBe('2026-08-27T09:00:00.000Z')
  })

  it('si la propuesta salió mucho después del último mensaje, cae fuera de la ventana: 22 hs después de la propuesta', () => {
    const ahora = t('2026-08-28T16:00:00Z')
    const plan = calcularEnvioSeguimientoPropuesta({
      ahora,
      ultimoMensajeClienteAt: t('2026-08-26T10:00:00Z'),
      horasDesdeUltimoMensaje: 23,
    })
    expect(plan.dentroVentana).toBe(false)
    expect(plan.enviarAt.getTime()).toBe(ahora.getTime() + 22 * H)
  })

  it('si faltara menos del mínimo para que cierre la ventana, va por plantilla', () => {
    const ahora = t('2026-08-27T08:30:00Z') // la ventana cierra 10:00, a 23 hs son las 09:00 → 30 min
    const plan = calcularEnvioSeguimientoPropuesta({
      ahora,
      ultimoMensajeClienteAt: t('2026-08-26T10:00:00Z'),
      horasDesdeUltimoMensaje: 23,
      minimoHoras: 1,
    })
    expect(plan.dentroVentana).toBe(false)
  })

  it('cliente que nunca escribió: plantilla 22 hs después', () => {
    const ahora = t('2026-08-26T16:00:00Z')
    const plan = calcularEnvioSeguimientoPropuesta({ ahora, ultimoMensajeClienteAt: null, horasDesdeUltimoMensaje: 23 })
    expect(plan.dentroVentana).toBe(false)
    expect(plan.enviarAt.getTime()).toBe(ahora.getTime() + 22 * H)
  })

  it('las horas se acotan a la ventana (nunca más de 23,5 ni menos de 1)', () => {
    const base = { ahora: t('2026-08-26T11:00:00Z'), ultimoMensajeClienteAt: t('2026-08-26T10:00:00Z') }
    expect(calcularEnvioSeguimientoPropuesta({ ...base, horasDesdeUltimoMensaje: 40 }).enviarAt.toISOString())
      .toBe('2026-08-27T09:30:00.000Z')
    expect(calcularEnvioSeguimientoPropuesta({ ...base, horasDesdeUltimoMensaje: 0 }).dentroVentana).toBe(false)
  })
})

describe('renderMensajeSeguimientoPropuesta', () => {
  it('reemplaza nombre (solo el primero) y vendedor', () => {
    const msg = renderMensajeSeguimientoPropuesta(MENSAJE_SEGUIMIENTO_PROPUESTA_DEFAULT, {
      clienteNombre: 'Micaela Frezza',
      vendedorNombre: 'Teo',
    })
    expect(msg).toBe('Hola Micaela, Teo de ALIPRO. Te escribo por la cotización que te mandé ayer. Pudiste verla? Cualquier duda me decís y lo vemos.')
  })

  it('sin vendedor firma "el equipo"; sin nombre no deja "Hola ,"', () => {
    const msg = renderMensajeSeguimientoPropuesta(null, { clienteNombre: '', vendedorNombre: null })
    expect(msg.startsWith('Hola, el equipo de ALIPRO.')).toBe(true)
  })

  it('usa el texto configurado si viene', () => {
    expect(renderMensajeSeguimientoPropuesta('Che {{1}}, viste la coti? {{2}}', { clienteNombre: 'Ana', vendedorNombre: 'Rodo' }))
      .toBe('Che Ana, viste la coti? Rodo')
  })
})
