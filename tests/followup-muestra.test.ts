/**
 * Seguimiento después de la muestra: cuándo sale, cuándo se pospone y cuándo se omite (reglas puras).
 */
import { describe, it, expect } from 'vitest'
import {
  calcularSeguimientoMuestra,
  decidirSeguimientoMuestra,
  limitePosponerMuestra,
  MUESTRA_SEGUIMIENTO_DIAS_DEFAULT,
  REASON_MUESTRA,
} from '@/lib/followup/muestra'

describe('calcularSeguimientoMuestra', () => {
  it('sale 4 días después de la entrega (por defecto), a la misma hora si está en horario', () => {
    // 24/08 15:00Z = 12:00 Argentina → 28/08 12:00 Argentina
    const at = calcularSeguimientoMuestra(new Date('2026-08-24T15:00:00Z'))
    expect(MUESTRA_SEGUIMIENTO_DIAS_DEFAULT).toBe(4)
    expect(at.toISOString()).toBe('2026-08-28T15:00:00.000Z')
  })

  it('si cae de noche se corre a las 8 de la mañana siguiente', () => {
    // Entregada 23:30 Argentina (02:30Z del día siguiente) → +5 días 23:30 → 08:00 del otro día
    const at = calcularSeguimientoMuestra(new Date('2026-08-25T02:30:00Z'), 5)
    expect(at.toISOString()).toBe('2026-08-30T11:00:00.000Z')
  })

  it('los días se acotan entre 1 y 60', () => {
    const base = new Date('2026-08-24T15:00:00Z')
    expect(calcularSeguimientoMuestra(base, 0).toISOString()).toBe('2026-08-25T15:00:00.000Z')
    expect(calcularSeguimientoMuestra(base, 999).toISOString()).toBe('2026-10-23T15:00:00.000Z')
  })
})

describe('decidirSeguimientoMuestra', () => {
  const ahora = new Date('2026-11-01T15:00:00Z') // 12:00 Argentina
  const limite = limitePosponerMuestra(ahora)
  const base = { ahora, limite, enEtapaMuestra: true as boolean | null, botApagadoAMano: false }

  it('se manda aunque el cliente haya contestado la guía días atrás', () => {
    // Caso real: contestó "¿tengo que abonar el envío?" 5 minutos después de la guía, hace 3 días
    const r = decidirSeguimientoMuestra({ ...base, ultimoMensajeHumanoAt: new Date('2026-10-29T02:19:00Z') })
    expect(r).toEqual({ tipo: 'enviar' })
  })

  it('se manda si nadie escribió nunca, o si la etapa no se pudo determinar', () => {
    expect(decidirSeguimientoMuestra({ ...base, ultimoMensajeHumanoAt: null })).toEqual({ tipo: 'enviar' })
    expect(decidirSeguimientoMuestra({ ...base, ultimoMensajeHumanoAt: null, enEtapaMuestra: null })).toEqual({ tipo: 'enviar' })
  })

  it('con charla en curso (< 48 hs) se pospone a 48 hs del último mensaje', () => {
    const r = decidirSeguimientoMuestra({ ...base, ultimoMensajeHumanoAt: new Date('2026-10-31T16:00:00Z') })
    expect(r).toEqual({ tipo: 'posponer', hasta: new Date('2026-11-02T16:00:00Z') })
  })

  it('si posponer pasa del límite, se deja de intentar', () => {
    const r = decidirSeguimientoMuestra({
      ...base,
      limite: new Date('2026-11-02T00:00:00Z'),
      ultimoMensajeHumanoAt: new Date('2026-10-31T16:00:00Z'),
    })
    expect(r).toEqual({ tipo: 'omitir', motivo: 'la charla siguió activa después de la muestra' })
  })

  it('se omite si avanzó de etapa o si el bot está apagado a mano', () => {
    expect(decidirSeguimientoMuestra({ ...base, ultimoMensajeHumanoAt: null, enEtapaMuestra: false }))
      .toEqual({ tipo: 'omitir', motivo: 'el lead ya no está en "Muestra enviada"' })
    const apagado = decidirSeguimientoMuestra({ ...base, ultimoMensajeHumanoAt: null, botApagadoAMano: true })
    expect(apagado.tipo).toBe('omitir')
    expect(apagado.tipo === 'omitir' && apagado.motivo).toContain('apagado a mano')
  })

  it('el reason guardado en el lead es "muestra"', () => {
    expect(REASON_MUESTRA).toBe('muestra')
  })
})
