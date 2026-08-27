/**
 * Nombre de archivo de los PDFs del pedido: "Cliente - Pedido XXXXXXXX - Tipo.pdf".
 */
import { describe, it, expect } from 'vitest'
import {
  codigoPedido,
  tituloDocumento,
  nombreArchivoDocumento,
  nombreArchivoDesdeHeader,
} from '@/lib/pdf/nombre-archivo'

const PEDIDO_ID = '5de08205-d990-4667-98a8-3ca5093a9f12'

describe('codigoPedido', () => {
  it('son los últimos 8 del id en mayúsculas, igual que en la ficha', () => {
    expect(codigoPedido(PEDIDO_ID)).toBe('093A9F12')
  })
})

describe('nombreArchivoDocumento', () => {
  it('arma cliente + número de pedido + tipo', () => {
    expect(nombreArchivoDocumento('proforma', { nombre: 'Juan', apellido: 'Perez' }, PEDIDO_ID))
      .toBe('Juan Perez - Pedido 093A9F12 - Proforma.pdf')
    expect(nombreArchivoDocumento('remito', { nombre: 'Juan', apellido: 'Perez' }, PEDIDO_ID))
      .toBe('Juan Perez - Pedido 093A9F12 - Remito.pdf')
  })

  it('saca tildes y caracteres inválidos para el nombre de archivo', () => {
    expect(tituloDocumento('proforma', { nombre: 'María José', apellido: 'Núñez / "La Estrella"' }, PEDIDO_ID))
      .toBe('Maria Jose Nunez La Estrella - Pedido 093A9F12 - Proforma')
  })

  it('sin apellido o con nombre vacío no rompe', () => {
    expect(tituloDocumento('proforma', { nombre: 'Kiosco Sol', apellido: null }, PEDIDO_ID))
      .toBe('Kiosco Sol - Pedido 093A9F12 - Proforma')
    expect(tituloDocumento('proforma', { nombre: '   ', apellido: '' }, PEDIDO_ID))
      .toBe('Cliente - Pedido 093A9F12 - Proforma')
  })
})

describe('nombreArchivoDesdeHeader', () => {
  it('lee el filename del Content-Disposition', () => {
    expect(nombreArchivoDesdeHeader('attachment; filename="Juan Perez - Pedido 093A9F12 - Proforma.pdf"'))
      .toBe('Juan Perez - Pedido 093A9F12 - Proforma.pdf')
    expect(nombreArchivoDesdeHeader(null)).toBeNull()
    expect(nombreArchivoDesdeHeader('inline')).toBeNull()
  })
})
