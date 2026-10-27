/**
 * Seguimiento después de la muestra: cuándo sale y cuándo se omite (reglas puras).
 */
import { describe, it, expect } from 'vitest'
import {
  calcularSeguimientoMuestra,
  motivoParaOmitirSeguimientoMuestra,
  MUESTRA_SEGUIMIENTO_DIAS_DEFAULT,
  REASON_MUESTRA,
} from '@/lib/followup/muestra'

describe('calcularSeguimientoMuestra', () => {
  it('sale 5 días después de la entrega (por defecto), a la misma hora si está en horario', () => {
    // 24/08 15:00Z = 12:00 Argentina → 29/08 12:00 Argentina
    const at = calcularSeguimientoMuestra(new Date('2026-08-24T15:00:00Z'))
    expect(MUESTRA_SEGUIMIENTO_DIAS_DEFAULT).toBe(5)
    expect(at.toISOString()).toBe('2026-08-29T15:00:00.000Z')
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

describe('motivoParaOmitirSeguimientoMuestra', () => {
  it('se manda cuando nadie escribió, sigue en Muestra enviada y el bot no está apagado a mano', () => {
    expect(motivoParaOmitirSeguimientoMuestra({ mensajesDelClienteDesdeProgramado: 0, enEtapaMuestra: true, botApagadoAMano: false })).toBeNull()
    expect(motivoParaOmitirSeguimientoMuestra({ mensajesDelClienteDesdeProgramado: 0, enEtapaMuestra: null, botApagadoAMano: false })).toBeNull()
  })

  it('se omite si el cliente escribió, si avanzó de etapa o si el bot está apagado a mano', () => {
    expect(motivoParaOmitirSeguimientoMuestra({ mensajesDelClienteDesdeProgramado: 1, enEtapaMuestra: true, botApagadoAMano: false })).toBe('el cliente ya escribió después de la muestra')
    expect(motivoParaOmitirSeguimientoMuestra({ mensajesDelClienteDesdeProgramado: 0, enEtapaMuestra: false, botApagadoAMano: false })).toBe('el lead ya no está en "Muestra enviada"')
    expect(motivoParaOmitirSeguimientoMuestra({ mensajesDelClienteDesdeProgramado: 0, enEtapaMuestra: true, botApagadoAMano: true })).toContain('apagado a mano')
  })

  it('el reason guardado en el lead es "muestra"', () => {
    expect(REASON_MUESTRA).toBe('muestra')
  })
})
