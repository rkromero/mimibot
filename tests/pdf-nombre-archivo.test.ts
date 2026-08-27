/**
 * Nombre de archivo de los PDFs del pedido: "Cliente - Tipo 000123.pdf",
 * con el número del documento emitido (el mismo impreso en el PDF).
 */
import { describe, it, expect } from 'vitest'
import {
  padNumeroDocumento,
  tituloDocumento,
  nombreArchivoDocumento,
  nombreArchivoDesdeHeader,
} from '@/lib/pdf/nombre-archivo'

describe('padNumeroDocumento', () => {
  it('6 dígitos con ceros a la izquierda, igual que impreso en el PDF', () => {
    expect(padNumeroDocumento(141)).toBe('000141')
    expect(padNumeroDocumento(1234567)).toBe('1234567')
  })
})

describe('nombreArchivoDocumento', () => {
  it('arma cliente + tipo + número del documento', () => {
    expect(nombreArchivoDocumento('proforma', { nombre: 'Juan', apellido: 'Perez' }, 141))
      .toBe('Juan Perez - Proforma 000141.pdf')
    expect(nombreArchivoDocumento('remito', { nombre: 'Juan', apellido: 'Perez' }, 171))
      .toBe('Juan Perez - Remito 000171.pdf')
  })

  it('saca tildes y caracteres inválidos para el nombre de archivo', () => {
    expect(tituloDocumento('proforma', { nombre: 'María José', apellido: 'Núñez / "La Estrella"' }, 7))
      .toBe('Maria Jose Nunez La Estrella - Proforma 000007')
  })

  it('sin apellido o con nombre vacío no rompe', () => {
    expect(tituloDocumento('proforma', { nombre: 'Kiosco Sol', apellido: null }, 7))
      .toBe('Kiosco Sol - Proforma 000007')
    expect(tituloDocumento('remito', { nombre: '   ', apellido: '' }, 7))
      .toBe('Cliente - Remito 000007')
  })
})

describe('nombreArchivoDesdeHeader', () => {
  it('lee el filename del Content-Disposition', () => {
    expect(nombreArchivoDesdeHeader('attachment; filename="Juan Perez - Proforma 000141.pdf"'))
      .toBe('Juan Perez - Proforma 000141.pdf')
    expect(nombreArchivoDesdeHeader(null)).toBeNull()
    expect(nombreArchivoDesdeHeader('inline')).toBeNull()
  })
})
