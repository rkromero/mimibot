/**
 * Score del bot extraído del resumen de derivación, y catálogo de motivos de pérdida.
 */
import { describe, it, expect } from 'vitest'
import { extraerScore } from '@/lib/claude/bot-context'
import { MOTIVOS_PERDIDA, labelMotivoPerdida, CODIGOS_MOTIVO_PERDIDA } from '@/lib/leads/motivos-perdida'

describe('extraerScore', () => {
  it('lee "Score: X/14, grado A" del resumen', () => {
    expect(extraerScore('Producto: alfajores\nScore: 11/14, grado A')).toEqual({ score: 11, grado: 'A' })
    expect(extraerScore('score: 7/14 - Grado: B')).toEqual({ score: 7, grado: 'B' })
    expect(extraerScore('Score 3/14 (C)')).toEqual({ score: 3, grado: 'C' })
  })

  it('tolera que falte el número o la letra', () => {
    expect(extraerScore('Grado: A')).toEqual({ score: null, grado: 'A' })
    expect(extraerScore('Score: 9/14')).toEqual({ score: 9, grado: null })
  })

  it('sin resumen o sin score devuelve nulls', () => {
    expect(extraerScore(null)).toEqual({ score: null, grado: null })
    expect(extraerScore('Producto: galletitas')).toEqual({ score: null, grado: null })
  })
})

describe('motivos de pérdida', () => {
  it('los códigos son únicos y tienen label', () => {
    const codigos = MOTIVOS_PERDIDA.map((m) => m.codigo)
    expect(new Set(codigos).size).toBe(codigos.length)
    expect(CODIGOS_MOTIVO_PERDIDA).toEqual(codigos)
    for (const m of MOTIVOS_PERDIDA) expect(m.label.length).toBeGreaterThan(0)
  })

  it('labelMotivoPerdida', () => {
    expect(labelMotivoPerdida('precio')).toBe('Precio')
    expect(labelMotivoPerdida(null)).toBe('Sin especificar')
    expect(labelMotivoPerdida('desconocido')).toBe('desconocido')
  })
})
