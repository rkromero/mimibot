/**
 * Respuestas rápidas → cuadro de texto del chat. El evento viaja por `window`
 * con el id de la conversación; sólo el composer de esa conversación lo toma.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  combinarTexto,
  emitirInsertarTexto,
  suscribirInsertarTexto,
  emitirEnviarTexto,
  suscribirEnviarTexto,
} from '@/lib/inbox/composer-events'

describe('combinarTexto', () => {
  it('reemplaza cuando el cuadro está vacío (o sólo tiene espacios)', () => {
    expect(combinarTexto('', 'Hola')).toBe('Hola')
    expect(combinarTexto('   \n', 'Hola')).toBe('Hola')
  })

  it('agrega en una línea nueva cuando ya había texto', () => {
    expect(combinarTexto('Buen día ', 'Hola')).toBe('Buen día\nHola')
  })
})

describe('emitir / suscribir', () => {
  const originalWindow = (globalThis as { window?: unknown }).window

  beforeEach(() => {
    ;(globalThis as { window?: unknown }).window = new EventTarget()
  })

  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = originalWindow
  })

  it('entrega el texto sólo al composer de esa conversación', () => {
    const mia = vi.fn()
    const otra = vi.fn()
    const off1 = suscribirInsertarTexto('conv-1', mia)
    const off2 = suscribirInsertarTexto('conv-2', otra)

    emitirInsertarTexto({ conversationId: 'conv-1', text: 'Hola {nombre}' })

    expect(mia).toHaveBeenCalledWith('Hola {nombre}')
    expect(otra).not.toHaveBeenCalled()
    off1()
    off2()
  })

  it('después de desuscribirse no recibe más', () => {
    const handler = vi.fn()
    const off = suscribirInsertarTexto('conv-1', handler)
    off()
    emitirInsertarTexto({ conversationId: 'conv-1', text: 'x' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('sin window (SSR) no explota', () => {
    ;(globalThis as { window?: unknown }).window = undefined
    expect(() => emitirInsertarTexto({ conversationId: 'c', text: 't' })).not.toThrow()
    expect(suscribirInsertarTexto('c', () => {})).toBeTypeOf('function')
  })

  it('"enviar" es un evento aparte: no lo reciben los suscriptores de "insertar"', () => {
    const insertar = vi.fn()
    const enviar = vi.fn()
    const off1 = suscribirInsertarTexto('conv-1', insertar)
    const off2 = suscribirEnviarTexto('conv-1', enviar)

    emitirEnviarTexto({ conversationId: 'conv-1', text: 'Hola' })
    emitirEnviarTexto({ conversationId: 'conv-2', text: 'Otra' })

    expect(enviar).toHaveBeenCalledTimes(1)
    expect(enviar).toHaveBeenCalledWith('Hola')
    expect(insertar).not.toHaveBeenCalled()
    off1()
    off2()
  })
})
