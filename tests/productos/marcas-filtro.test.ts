/**
 * Chips de marca del selector de productos (lib/productos/marcas-filtro.ts).
 *
 *  1. Con dos o más marcas entre los productos visibles → chips ordenados por nombre, con conteo.
 *  2. Con una sola marca (o ninguna) → sin chips: no hay nada que filtrar.
 *  3. Productos sin marca no generan chip.
 *  4. filtrarPorMarca: "todas"/null no filtra; un id deja solo esa marca.
 */
import { describe, it, expect } from 'vitest'
import { marcasDisponibles, filtrarPorMarca, TODAS_LAS_MARCAS } from '@/lib/productos/marcas-filtro'

const P = [
  { id: 'p1', marcaId: 'm-mimi', marcaNombre: 'MIMI' },
  { id: 'p2', marcaId: 'm-cda', marcaNombre: 'CDA' },
  { id: 'p3', marcaId: 'm-cda', marcaNombre: 'CDA' },
  { id: 'p4', marcaId: 'm-ambar', marcaNombre: 'AMBAR' },
  { id: 'p5', marcaId: null, marcaNombre: null },
]

describe('marcasDisponibles', () => {
  it('lista las marcas ordenadas por nombre con la cantidad de productos', () => {
    expect(marcasDisponibles(P)).toEqual([
      { id: 'm-ambar', nombre: 'AMBAR', count: 1 },
      { id: 'm-cda', nombre: 'CDA', count: 2 },
      { id: 'm-mimi', nombre: 'MIMI', count: 1 },
    ])
  })

  it('con una sola marca no ofrece chips', () => {
    expect(marcasDisponibles(P.filter((p) => p.marcaId === 'm-cda'))).toEqual([])
    expect(marcasDisponibles([])).toEqual([])
  })

  it('los productos sin marca no generan chip', () => {
    expect(marcasDisponibles([P[4]!, P[4]!])).toEqual([])
  })
})

describe('filtrarPorMarca', () => {
  it('"todas" o null devuelve la lista completa', () => {
    expect(filtrarPorMarca(P, TODAS_LAS_MARCAS)).toBe(P)
    expect(filtrarPorMarca(P, null)).toBe(P)
  })

  it('con un id deja solo los productos de esa marca', () => {
    expect(filtrarPorMarca(P, 'm-cda').map((p) => p.id)).toEqual(['p2', 'p3'])
    expect(filtrarPorMarca(P, 'm-inexistente')).toEqual([])
  })
})
