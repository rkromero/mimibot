/**
 * Reglas del paso "Entrega" (retiro en fábrica / expreso) compartido entre el
 * alta de pedidos de agentes y el modal de muestra desde el lead.
 */
import { describe, it, expect } from 'vitest'
import {
  ENTREGA_FORM_INICIAL,
  buildEntregaPayload,
  entregaCompleta,
  type EntregaFormState,
} from '@/lib/pedidos/metodo-entrega'

const GUARDADO = { nombre: 'Andreani', direccion: 'Av. Siempreviva 123' }

function form(patch: Partial<EntregaFormState>): EntregaFormState {
  return { ...ENTREGA_FORM_INICIAL, ...patch }
}

describe('entregaCompleta', () => {
  it('sin método elegido no se puede avanzar', () => {
    expect(entregaCompleta(ENTREGA_FORM_INICIAL, null)).toBe(false)
    expect(entregaCompleta(ENTREGA_FORM_INICIAL, GUARDADO)).toBe(false)
  })

  it('retiro en fábrica alcanza por sí solo', () => {
    expect(entregaCompleta(form({ metodoEntrega: 'retiro_fabrica' }), null)).toBe(true)
  })

  it('expreso sin guardado exige nombre y dirección', () => {
    expect(entregaCompleta(form({ metodoEntrega: 'expreso' }), null)).toBe(false)
    expect(entregaCompleta(form({ metodoEntrega: 'expreso', nuevoExpresoNombre: 'OCA' }), null)).toBe(false)
    expect(
      entregaCompleta(form({ metodoEntrega: 'expreso', nuevoExpresoNombre: 'OCA', nuevoExpresoDireccion: 'Calle 1' }), null),
    ).toBe(true)
  })

  it('expreso con guardado: hay que decidir si es el mismo', () => {
    expect(entregaCompleta(form({ metodoEntrega: 'expreso' }), GUARDADO)).toBe(false)
    expect(entregaCompleta(form({ metodoEntrega: 'expreso', usarExpresoGuardado: true }), GUARDADO)).toBe(true)
    expect(entregaCompleta(form({ metodoEntrega: 'expreso', usarExpresoGuardado: false }), GUARDADO)).toBe(false)
    expect(
      entregaCompleta(
        form({ metodoEntrega: 'expreso', usarExpresoGuardado: false, nuevoExpresoNombre: 'OCA', nuevoExpresoDireccion: 'Calle 1' }),
        GUARDADO,
      ),
    ).toBe(true)
  })
})

describe('buildEntregaPayload', () => {
  it('sin método devuelve null', () => {
    expect(buildEntregaPayload(ENTREGA_FORM_INICIAL, null)).toBeNull()
  })

  it('retiro en fábrica no manda datos de expreso', () => {
    expect(buildEntregaPayload(form({ metodoEntrega: 'retiro_fabrica' }), GUARDADO)).toEqual({ metodoEntrega: 'retiro_fabrica' })
  })

  it('expreso nuevo manda nombre y dirección recortados', () => {
    expect(
      buildEntregaPayload(
        form({ metodoEntrega: 'expreso', nuevoExpresoNombre: '  OCA ', nuevoExpresoDireccion: ' Calle 1 ' }),
        null,
      ),
    ).toEqual({ metodoEntrega: 'expreso', expresoNombre: 'OCA', expresoDireccion: 'Calle 1' })
  })

  it('con el expreso guardado no manda datos (el server usa la ficha)', () => {
    expect(buildEntregaPayload(form({ metodoEntrega: 'expreso', usarExpresoGuardado: true }), GUARDADO)).toEqual({
      metodoEntrega: 'expreso',
    })
  })

  it('con guardado pero eligiendo uno nuevo, manda el nuevo', () => {
    expect(
      buildEntregaPayload(
        form({ metodoEntrega: 'expreso', usarExpresoGuardado: false, nuevoExpresoNombre: 'Cruz del Sur', nuevoExpresoDireccion: 'Ruta 2' }),
        GUARDADO,
      ),
    ).toEqual({ metodoEntrega: 'expreso', expresoNombre: 'Cruz del Sur', expresoDireccion: 'Ruta 2' })
  })
})
