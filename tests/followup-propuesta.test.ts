/**
 * Seguimiento automático después de enviar una propuesta: cuándo sale y qué dice.
 */
import { describe, it, expect } from 'vitest'
import {
  calcularEnvioSeguimientoPropuesta,
  renderMensajeSeguimientoPropuesta,
  envioDisparaSeguimiento,
  motivoParaOmitirSeguimientoPropuesta,
  botApagadoAMano,
  MOTIVO_BOT_APAGADO_A_MANO,
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

describe('envioDisparaSeguimiento', () => {
  it('el primer envío por cualquier vía programa el seguimiento', () => {
    expect(envioDisparaSeguimiento({ via: 'whatsapp', yaEstabaEnviada: false })).toBe(true)
    expect(envioDisparaSeguimiento({ via: 'email', yaEstabaEnviada: false })).toBe(true)
    expect(envioDisparaSeguimiento({ via: 'descarga', yaEstabaEnviada: false })).toBe(true)
  })

  it('volver a bajar el PDF de una propuesta ya enviada no programa nada', () => {
    expect(envioDisparaSeguimiento({ via: 'descarga', yaEstabaEnviada: true })).toBe(false)
  })

  it('reenviarla por WhatsApp o email sí es un envío nuevo', () => {
    expect(envioDisparaSeguimiento({ via: 'whatsapp', yaEstabaEnviada: true })).toBe(true)
    expect(envioDisparaSeguimiento({ via: 'email', yaEstabaEnviada: true })).toBe(true)
  })
})

describe('motivoParaOmitirSeguimientoPropuesta', () => {
  it('sin respuesta del cliente y en "Propuesta enviada" se manda', () => {
    expect(motivoParaOmitirSeguimientoPropuesta({ mensajesDelClienteDesdeProgramado: 0, enEtapaPropuesta: true })).toBeNull()
  })

  it('si el cliente escribió después de programarse, no se manda', () => {
    expect(motivoParaOmitirSeguimientoPropuesta({ mensajesDelClienteDesdeProgramado: 3, enEtapaPropuesta: true }))
      .toBe('el cliente ya respondió después de la propuesta')
  })

  it('si el lead ya avanzó de etapa, no se manda', () => {
    expect(motivoParaOmitirSeguimientoPropuesta({ mensajesDelClienteDesdeProgramado: 0, enEtapaPropuesta: false }))
      .toBe('el lead ya no está en "Propuesta enviada"')
  })

  it('si la etapa no se puede determinar (la borraron), no se usa como criterio', () => {
    expect(motivoParaOmitirSeguimientoPropuesta({ mensajesDelClienteDesdeProgramado: 0, enEtapaPropuesta: null })).toBeNull()
  })

  it('con el bot apagado a mano no se manda, antes que cualquier otro criterio', () => {
    expect(motivoParaOmitirSeguimientoPropuesta({ mensajesDelClienteDesdeProgramado: 0, enEtapaPropuesta: true, botApagadoAMano: true }))
      .toBe(MOTIVO_BOT_APAGADO_A_MANO)
  })
})

describe('botApagadoAMano', () => {
  it('apagado por una persona antes de calificar → true', () => {
    expect(botApagadoAMano({ botEnabled: false, botQualified: false })).toBe(true)
  })

  it('apagado por el bot al calificar → false (el seguimiento sigue saliendo)', () => {
    expect(botApagadoAMano({ botEnabled: false, botQualified: true })).toBe(false)
  })

  it('bot prendido → false', () => {
    expect(botApagadoAMano({ botEnabled: true, botQualified: false })).toBe(false)
  })
})
