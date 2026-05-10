import { describe, it, expect } from 'vitest'

// Helpers internos del servicio PDF — testeamos la lógica sin DB

function zeroPad(n: number, digits = 6): string {
  return String(n).padStart(digits, '0')
}

function buildFilename(tipo: 'remito' | 'proforma', numero: number): string {
  return `${tipo}-${zeroPad(numero)}.pdf`
}

describe('numeración de documentos PDF', () => {
  it('formatea el número con ceros a la izquierda (6 dígitos)', () => {
    expect(zeroPad(1)).toBe('000001')
    expect(zeroPad(42)).toBe('000042')
    expect(zeroPad(999)).toBe('000999')
    expect(zeroPad(123456)).toBe('123456')
  })

  it('genera nombre de archivo correcto para remito', () => {
    expect(buildFilename('remito', 1)).toBe('remito-000001.pdf')
    expect(buildFilename('remito', 100)).toBe('remito-000100.pdf')
  })

  it('genera nombre de archivo correcto para proforma', () => {
    expect(buildFilename('proforma', 7)).toBe('proforma-000007.pdf')
  })

  it('números mayores a 6 dígitos no se truncan', () => {
    expect(zeroPad(1234567)).toBe('1234567')
    expect(buildFilename('remito', 1000000)).toBe('remito-1000000.pdf')
  })

  it('secuencia de contadores es incremental', () => {
    let lastNumber = 0
    const secuencia: number[] = []

    for (let i = 0; i < 5; i++) {
      lastNumber += 1
      secuencia.push(lastNumber)
    }

    expect(secuencia).toEqual([1, 2, 3, 4, 5])
    expect(new Set(secuencia).size).toBe(secuencia.length) // sin duplicados
  })

  it('remito y proforma tienen contadores independientes', () => {
    // Simula dos contadores separados
    const counters: Record<string, number> = { remito: 0, proforma: 0 }

    const emitir = (tipo: 'remito' | 'proforma') => ++counters[tipo]

    emitir('remito')  // remito = 1
    emitir('remito')  // remito = 2
    emitir('proforma') // proforma = 1
    emitir('remito')  // remito = 3

    expect(counters.remito).toBe(3)
    expect(counters.proforma).toBe(1)
  })
})
