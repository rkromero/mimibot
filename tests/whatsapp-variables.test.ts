import { describe, it, expect } from 'vitest'
import {
  primerNombre,
  resolveTemplateVariables,
  applyTemplateValues,
  toTemplateVariables,
  TEMPLATE_VAR_SOURCES,
} from '@/lib/whatsapp/variables'

describe('primerNombre', () => {
  it('devuelve solo la primera palabra', () => {
    expect(primerNombre('Juan Pérez')).toBe('Juan')
    expect(primerNombre('María José López')).toBe('María')
    expect(primerNombre('  Ana   Gómez ')).toBe('Ana')
  })

  it('un solo nombre queda igual; vacío o null devuelve cadena vacía', () => {
    expect(primerNombre('Carlos')).toBe('Carlos')
    expect(primerNombre('')).toBe('')
    expect(primerNombre('   ')).toBe('')
    expect(primerNombre(null)).toBe('')
    expect(primerNombre(undefined)).toBe('')
  })
})

describe('resolveTemplateVariables', () => {
  const ctx = { clienteNombre: 'Juan Pérez', vendedorNombre: 'Rodo', pedidoNumero: 'ABC123', pedidoTotal: '$100,00' }

  it('cliente_nombre manda solo el primer nombre; cliente_nombre_completo manda todo', () => {
    expect(resolveTemplateVariables([{ index: 1, source: 'cliente_nombre', sample: 'X' }], ctx)).toEqual(['Juan'])
    expect(resolveTemplateVariables([{ index: 1, source: 'cliente_nombre_completo', sample: 'X' }], ctx)).toEqual(['Juan Pérez'])
  })

  it('respeta el orden por index aunque vengan desordenadas', () => {
    const vars = [
      { index: 2, source: 'pedido_numero', sample: '' },
      { index: 1, source: 'cliente_nombre', sample: '' },
      { index: 3, source: 'pedido_total', sample: '' },
    ]
    expect(resolveTemplateVariables(vars, ctx)).toEqual(['Juan', 'ABC123', '$100,00'])
  })

  it('cae al sample cuando el dato no está o viene vacío (Meta no acepta parámetros vacíos)', () => {
    expect(resolveTemplateVariables([{ index: 1, source: 'cliente_nombre', sample: 'Cliente' }], {})).toEqual(['Cliente'])
    expect(resolveTemplateVariables([{ index: 1, source: 'cliente_nombre', sample: 'Cliente' }], { clienteNombre: '   ' })).toEqual(['Cliente'])
    expect(resolveTemplateVariables([{ index: 1, source: 'vendedor_nombre', sample: 'Ventas' }], {})).toEqual(['Ventas'])
  })

  it('texto_fijo y orígenes desconocidos usan el sample', () => {
    expect(resolveTemplateVariables([{ index: 1, source: 'texto_fijo', sample: 'Hola' }], ctx)).toEqual(['Hola'])
    expect(resolveTemplateVariables([{ index: 1, source: 'lo_que_sea', sample: 'S' }], ctx)).toEqual(['S'])
  })

  it('todos los orígenes ofrecidos en la UI están resueltos', () => {
    for (const s of TEMPLATE_VAR_SOURCES) {
      const [v] = resolveTemplateVariables([{ index: 1, source: s.value, sample: 'sample' }], ctx)
      expect(v, s.value).toBeTruthy()
      if (s.value !== 'texto_fijo' && s.value !== 'empresa_nombre') expect(v, s.value).not.toBe('sample')
    }
  })
})

describe('applyTemplateValues', () => {
  it('reemplaza {{n}} por posición, incluso repetidos', () => {
    expect(applyTemplateValues('Hola {{1}}, pedido {{2}}. Gracias {{1}}!', ['Juan', 'ABC'])).toBe('Hola Juan, pedido ABC. Gracias Juan!')
  })
})

describe('toTemplateVariables', () => {
  it('filtra entradas que no tienen forma de variable', () => {
    expect(toTemplateVariables(null)).toEqual([])
    expect(toTemplateVariables('x')).toEqual([])
    expect(toTemplateVariables([{ index: 1, source: 'cliente_nombre', sample: '' }, { foo: 1 }, null]))
      .toEqual([{ index: 1, source: 'cliente_nombre', sample: '' }])
  })
})
