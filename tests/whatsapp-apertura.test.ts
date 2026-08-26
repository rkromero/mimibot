/**
 * Reglas de apertura fuera de la ventana de 24 hs: qué variables se usan al
 * mandar una plantilla desde el chat y cuáles plantillas se pueden mandar.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db', () => ({ db: {} }))

import { variablesParaChat, plantillaUsableEnChat } from '@/lib/whatsapp/apertura'

describe('variablesParaChat', () => {
  it('usa las variables configuradas al registrar la plantilla', () => {
    const vars = [
      { index: 1, source: 'cliente_nombre', sample: 'Juan' },
      { index: 2, source: 'lead_producto_interes', sample: 'nuestros productos' },
    ]
    expect(variablesParaChat('Hola {{1}}, sobre {{2}}', vars)).toEqual(vars)
  })

  it('plantilla vieja sin configuración: {{1}} es el nombre del cliente', () => {
    expect(variablesParaChat('Hola {{1}}', null)).toEqual([{ index: 1, source: 'cliente_nombre', sample: 'Cliente' }])
    expect(variablesParaChat('Hola {{1}}', [])).toEqual([{ index: 1, source: 'cliente_nombre', sample: 'Cliente' }])
  })

  it('plantilla sin variables no manda parámetros', () => {
    expect(variablesParaChat('Hola, ¿cómo estás?', null)).toEqual([])
  })
})

describe('plantillaUsableEnChat', () => {
  it('se puede mandar si todas las variables se resuelven con el contacto', () => {
    expect(plantillaUsableEnChat([
      { index: 1, source: 'cliente_nombre', sample: '' },
      { index: 2, source: 'vendedor_nombre', sample: '' },
      { index: 3, source: 'lead_producto_interes', sample: '' },
      { index: 4, source: 'texto_fijo', sample: 'x' },
    ])).toBe(true)
    expect(plantillaUsableEnChat([])).toBe(true)
  })

  it('las que dependen de un pedido (número / total) no se ofrecen en el chat', () => {
    expect(plantillaUsableEnChat([{ index: 1, source: 'pedido_numero', sample: '' }])).toBe(false)
    expect(plantillaUsableEnChat([
      { index: 1, source: 'cliente_nombre', sample: '' },
      { index: 2, source: 'pedido_total', sample: '' },
    ])).toBe(false)
  })
})
