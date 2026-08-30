import { describe, it, expect } from 'vitest'
import { createProductoSchema, updateProductoSchema } from '@/lib/validations/productos'

const RECETA_ID = '5a1b2c3d-0000-4000-8000-000000000001'
const MARCA_ID = '5a1b2c3d-0000-4000-8000-000000000002'

const BASE = { marcaId: MARCA_ID, nombre: 'Alfajor 60g', precio: '1200.00' }

describe('createProductoSchema — receta y margen (FASE 1D)', () => {
  it('sin receta: costo manual sigue siendo válido (comportamiento actual)', () => {
    const r = createProductoSchema.safeParse({ ...BASE, costo: '450.00' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.recetaId).toBeNull()
  })

  it('recetaId + costo a mano → rechazado con mensaje claro', () => {
    const r = createProductoSchema.safeParse({ ...BASE, recetaId: RECETA_ID, costo: '450.00' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('El costo se calcula desde la receta: no se puede cargar a mano')
    }
  })

  it('recetaId sin costo → válido', () => {
    const r = createProductoSchema.safeParse({ ...BASE, recetaId: RECETA_ID })
    expect(r.success).toBe(true)
  })

  it('margenPct fuera de rango → rechazado; en rango → válido', () => {
    expect(createProductoSchema.safeParse({ ...BASE, margenPct: '150' }).success).toBe(false)
    expect(createProductoSchema.safeParse({ ...BASE, margenPct: '100' }).success).toBe(false)
    expect(createProductoSchema.safeParse({ ...BASE, margenPct: '45.5' }).success).toBe(true)
    expect(createProductoSchema.safeParse({ ...BASE, margenPct: null }).success).toBe(true)
  })
})

describe('updateProductoSchema — receta y margen', () => {
  it('acepta enlazar y desenlazar receta', () => {
    expect(updateProductoSchema.safeParse({ recetaId: RECETA_ID }).success).toBe(true)
    expect(updateProductoSchema.safeParse({ recetaId: null }).success).toBe(true)
  })

  it('margenPct inválido → rechazado', () => {
    expect(updateProductoSchema.safeParse({ margenPct: 'abc' }).success).toBe(false)
    expect(updateProductoSchema.safeParse({ margenPct: '99.99' }).success).toBe(true)
  })
})
