import { describe, it, expect } from 'vitest'
import { armarMarcaTitulo } from '@/lib/pdf/marca-titulo'

describe('armarMarcaTitulo', () => {
  it('CDA sale como ALIPRO (la marca se discontinuó)', () => {
    expect(armarMarcaTitulo(['CDA'])).toBe('ALIPRO')
    expect(armarMarcaTitulo(['cda'])).toBe('ALIPRO')
  })

  it('las demás marcas se mantienen tal cual', () => {
    expect(armarMarcaTitulo(['MIMI'])).toBe('MIMI')
    expect(armarMarcaTitulo(['MIMI', 'DUO'])).toBe('MIMI + DUO')
  })

  it('pedido mixto: CDA se reemplaza y se deduplica contra ALIPRO', () => {
    expect(armarMarcaTitulo(['MIMI', 'CDA'])).toBe('MIMI + ALIPRO')
    // Si además hubiera productos ALIPRO, no se duplica
    expect(armarMarcaTitulo(['CDA', 'ALIPRO', 'MIMI'])).toBe('ALIPRO + MIMI')
  })

  it('deduplica conservando el orden de aparición', () => {
    expect(armarMarcaTitulo(['MIMI', 'MIMI', 'DUO'])).toBe('MIMI + DUO')
  })

  it('sin marcas devuelve undefined (el documento cae al nombre de empresa)', () => {
    expect(armarMarcaTitulo([])).toBeUndefined()
    expect(armarMarcaTitulo([null, undefined])).toBeUndefined()
  })
})
