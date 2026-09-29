/**
 * Envíos masivos — reglas puras (lib/envios-masivos/reglas.ts):
 * exclusiones, resumen, momento de envío dentro del horario y duración estimada.
 */
import { describe, it, expect } from 'vitest'
import {
  DIAS_ANTIREPETICION,
  minutosEstimados,
  momentoDeEnvio,
  motivoExclusion,
  puedeEnviarAhora,
  resumirExclusiones,
} from '@/lib/envios-masivos/reglas'

const ahora = new Date('2026-09-29T15:00:00Z') // 12:00 hora Argentina
const d = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000)

describe('motivoExclusion', () => {
  it('lead abierto con WhatsApp y sin envío reciente → entra', () => {
    expect(motivoExclusion({ isOpen: true, waContactPhone: '+5491100000000', ultimoEnvioMismaPlantillaAt: null }, ahora)).toBeNull()
  })

  it('lead cerrado → lead_cerrado (aunque tenga WhatsApp)', () => {
    expect(motivoExclusion({ isOpen: false, waContactPhone: '+549', ultimoEnvioMismaPlantillaAt: null }, ahora)).toBe('lead_cerrado')
  })

  it('sin teléfono → sin_whatsapp', () => {
    expect(motivoExclusion({ isOpen: true, waContactPhone: null, ultimoEnvioMismaPlantillaAt: null }, ahora)).toBe('sin_whatsapp')
  })

  it(`misma plantilla hace menos de ${DIAS_ANTIREPETICION} días → plantilla_repetida; más de ${DIAS_ANTIREPETICION} → entra`, () => {
    expect(motivoExclusion({ isOpen: true, waContactPhone: '+549', ultimoEnvioMismaPlantillaAt: d(3) }, ahora)).toBe('plantilla_repetida')
    expect(motivoExclusion({ isOpen: true, waContactPhone: '+549', ultimoEnvioMismaPlantillaAt: d(8) }, ahora)).toBeNull()
  })
})

describe('resumirExclusiones', () => {
  it('cuenta elegibles y cada motivo', () => {
    expect(resumirExclusiones([null, null, 'sin_whatsapp', 'plantilla_repetida', 'plantilla_repetida', 'lead_cerrado']))
      .toEqual({ elegibles: 2, sin_whatsapp: 1, plantilla_repetida: 2, lead_cerrado: 1 })
  })
})

describe('momentoDeEnvio / puedeEnviarAhora', () => {
  it('"ahora" dentro del horario sale ya', () => {
    expect(momentoDeEnvio(null, ahora).getTime()).toBe(ahora.getTime())
    expect(puedeEnviarAhora(ahora)).toBe(true)
  })

  it('"ahora" a la madrugada se corre a las 8 de ese día (hora Argentina)', () => {
    const madrugada = new Date('2026-09-29T06:00:00Z') // 03:00 AR
    expect(momentoDeEnvio(null, madrugada).toISOString()).toBe('2026-09-29T11:00:00.000Z')
    expect(puedeEnviarAhora(madrugada)).toBe(false)
  })

  it('"ahora" después de las 22 se corre a las 8 del día siguiente', () => {
    const noche = new Date('2026-09-30T01:30:00Z') // 22:30 AR del 29
    expect(momentoDeEnvio(null, noche).toISOString()).toBe('2026-09-30T11:00:00.000Z')
  })

  it('programado en el futuro dentro del horario se respeta; programado en el pasado sale ahora', () => {
    const futuro = new Date('2026-10-01T13:30:00Z') // 10:30 AR
    expect(momentoDeEnvio(futuro, ahora).getTime()).toBe(futuro.getTime())
    expect(momentoDeEnvio(d(1), ahora).getTime()).toBe(ahora.getTime())
  })

  it('programado fuera de horario se corre al próximo inicio', () => {
    const programado = new Date('2026-10-02T02:00:00Z') // 23:00 AR del 1/10
    expect(momentoDeEnvio(programado, ahora).toISOString()).toBe('2026-10-02T11:00:00.000Z')
  })
})

describe('minutosEstimados', () => {
  it('redondea hacia arriba al ritmo configurado', () => {
    expect(minutosEstimados(0)).toBe(0)
    expect(minutosEstimados(10)).toBe(1)
    expect(minutosEstimados(100)).toBe(2)
  })
})
